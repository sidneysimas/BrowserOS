use crate::{
    domain::{AgentKey, AgentPageOwnership, AgentRef, ClientInfo, Session, SessionId},
    error::AppResult,
    services::{audit::AuditService, replay::ReplayService},
};
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::{
    sync::RwLock,
    task::JoinHandle,
    time::{Instant, MissedTickBehavior, interval},
};
use tracing::{debug, warn};
use ulid::Ulid;

pub struct SessionRegistry {
    sessions: RwLock<HashMap<SessionId, Arc<Session>>>,
    ownership: Arc<AgentPageOwnership>,
    audit: Arc<AuditService>,
    replay: Arc<ReplayService>,
    idle_after: Duration,
    sweep_interval: Duration,
}

impl SessionRegistry {
    #[must_use]
    pub fn new(
        audit: Arc<AuditService>,
        replay: Arc<ReplayService>,
        idle_after: Duration,
        sweep_interval: Duration,
    ) -> Arc<Self> {
        Arc::new(Self {
            sessions: RwLock::new(HashMap::new()),
            ownership: Arc::new(AgentPageOwnership::new()),
            audit,
            replay,
            idle_after,
            sweep_interval,
        })
    }

    #[must_use]
    pub fn ownership(&self) -> Arc<AgentPageOwnership> {
        self.ownership.clone()
    }

    pub async fn mint(
        self: &Arc<Self>,
        agent: AgentRef,
        client: ClientInfo,
    ) -> AppResult<Arc<Session>> {
        let id = SessionId::new(Ulid::new().to_string());
        self.mint_with_id(id, agent, client).await
    }

    pub async fn mint_with_id(
        self: &Arc<Self>,
        id: SessionId,
        agent: AgentRef,
        client: ClientInfo,
    ) -> AppResult<Arc<Session>> {
        let session = Session::new(id.clone(), agent, Instant::now());
        self.audit
            .record_session_start(
                id.as_str(),
                session.agent().agent_id().as_str(),
                session.agent().slug(),
                session.agent().label(),
                client.name.as_str(),
                client.version.as_str(),
            )
            .await?;
        self.sessions.write().await.insert(id, session.clone());
        Ok(session)
    }

    pub async fn insert_for_testing(&self, session: Arc<Session>) {
        self.sessions
            .write()
            .await
            .insert(session.id().clone(), session);
    }

    pub async fn lookup(&self, id: &SessionId) -> Option<Arc<Session>> {
        self.sessions.read().await.get(id).cloned()
    }

    pub async fn contains(&self, id: &SessionId) -> bool {
        self.sessions.read().await.contains_key(id)
    }

    /// Returns the current live sessions in stable id order for read-side joins.
    pub async fn snapshot(&self) -> Vec<Arc<Session>> {
        let mut sessions: Vec<_> = self.sessions.read().await.values().cloned().collect();
        sessions.sort_by(|left, right| left.id().cmp(right.id()));
        sessions
    }

    pub async fn touch(&self, id: &SessionId) -> bool {
        let Some(session) = self.lookup(id).await else {
            return false;
        };
        session.touch(Instant::now()).await;
        true
    }

    pub async fn count(&self) -> usize {
        self.sessions.read().await.len()
    }

    pub async fn cancel_by_agent(&self, agent_id: &str) -> usize {
        let sessions: Vec<Arc<Session>> = self.sessions.read().await.values().cloned().collect();
        let mut cancelled = 0;
        for session in sessions {
            if session.agent().agent_id().as_str() == agent_id {
                cancelled += session.cancel_active_dispatches().await;
            }
        }
        cancelled
    }

    pub async fn owner_of_page(&self, page_id: &browseros_core::PageId) -> Option<AgentKey> {
        self.ownership.owner_of_page(page_id).await
    }

    pub async fn remove(
        &self,
        id: &SessionId,
        kind: &str,
        reason: Option<&str>,
    ) -> AppResult<bool> {
        let session = self.sessions.write().await.remove(id);
        if let Some(session) = session {
            self.teardown(session, kind, reason).await?;
            return Ok(true);
        }
        Ok(false)
    }

    pub async fn sweep_idle(&self) -> AppResult<usize> {
        let now = Instant::now();
        let sessions: Vec<(SessionId, Arc<Session>)> = self
            .sessions
            .read()
            .await
            .iter()
            .map(|(id, session)| (id.clone(), session.clone()))
            .collect();
        let mut expired = Vec::new();
        for (id, session) in sessions {
            if session.idle_for(now).await >= self.idle_after {
                expired.push(id);
            }
        }
        let mut removed = 0;
        for id in expired {
            if self.remove(&id, "closed", Some("idle timeout")).await? {
                removed += 1;
            }
        }
        Ok(removed)
    }

    pub async fn shutdown(&self) -> AppResult<usize> {
        let sessions = {
            let mut guard = self.sessions.write().await;
            std::mem::take(&mut *guard)
        };
        let mut count = 0;
        for session in sessions.into_values() {
            self.teardown(session, "closed", Some("server shutdown"))
                .await?;
            count += 1;
        }
        Ok(count)
    }

    pub fn spawn_idle_sweeper(self: Arc<Self>) -> JoinHandle<()> {
        tokio::spawn(async move {
            let mut ticker = interval(self.sweep_interval);
            ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
            loop {
                ticker.tick().await;
                match self.sweep_idle().await {
                    Ok(count) if count > 0 => debug!(count, "swept idle sessions"),
                    Ok(_) => {}
                    Err(err) => warn!(error = %err, "session idle sweep failed"),
                }
            }
        })
    }

    async fn teardown(
        &self,
        session: Arc<Session>,
        kind: &str,
        reason: Option<&str>,
    ) -> AppResult<()> {
        session.cancel();
        self.replay.close_session(session.id().as_str()).await?;
        self.audit
            .record_session_end(session.id().as_str(), kind, reason)
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::SessionRegistry;
    use crate::{
        domain::{AgentRef, ClientInfo, Session, SessionId},
        services::{audit::AuditService, replay::ReplayService},
    };
    use std::{sync::Arc, time::Duration};
    use tempfile::tempdir;
    use tokio::time::Instant;

    #[tokio::test(start_paused = true)]
    async fn sweep_removes_idle_sessions_and_writes_end_row() -> anyhow::Result<()> {
        let dir = tempdir()?;
        let audit = Arc::new(AuditService::open(dir.path().join("audit.sqlite")).await?);
        let replay = Arc::new(ReplayService::new(
            dir.path().join("replays"),
            50,
            Duration::from_secs(30),
        ));
        let registry = SessionRegistry::new(
            audit.clone(),
            replay,
            Duration::from_secs(5),
            Duration::from_secs(1),
        );
        let session = Session::new(
            SessionId::new("s1"),
            AgentRef::Ephemeral {
                agent_id: crate::domain::AgentId::new("a1"),
                slug: "a1".to_string(),
                label: "A1".to_string(),
            },
            Instant::now(),
        );
        registry.insert_for_testing(session).await;
        tokio::time::advance(Duration::from_secs(6)).await;
        assert_eq!(registry.sweep_idle().await?, 1);
        assert_eq!(registry.count().await, 0);
        let detail = audit.get_task("s1").await?;
        assert!(detail.is_none());
        Ok(())
    }

    #[tokio::test]
    async fn mint_registers_live_session() -> anyhow::Result<()> {
        let dir = tempdir()?;
        let audit = Arc::new(AuditService::open(dir.path().join("audit.sqlite")).await?);
        let replay = Arc::new(ReplayService::new(
            dir.path().join("replays"),
            50,
            Duration::from_secs(30),
        ));
        let registry = SessionRegistry::new(
            audit,
            replay,
            Duration::from_secs(60),
            Duration::from_secs(1),
        );
        let session = registry
            .mint(
                AgentRef::Ephemeral {
                    agent_id: crate::domain::AgentId::new("agent-1"),
                    slug: "agent".to_string(),
                    label: "Agent".to_string(),
                },
                ClientInfo {
                    name: "Agent".to_string(),
                    version: "1".to_string(),
                    title: None,
                },
            )
            .await?;
        assert!(registry.lookup(session.id()).await.is_some());
        Ok(())
    }

    #[tokio::test]
    async fn ownership_survives_reconnect_and_preserves_tab_group() -> anyhow::Result<()> {
        let dir = tempdir()?;
        let audit = Arc::new(AuditService::open(dir.path().join("audit.sqlite")).await?);
        let replay = Arc::new(ReplayService::new(
            dir.path().join("replays"),
            50,
            Duration::from_secs(30),
        ));
        let registry = SessionRegistry::new(
            audit,
            replay,
            Duration::from_secs(60),
            Duration::from_secs(1),
        );
        let session1 = Session::new(
            SessionId::new("s1"),
            AgentRef::Ephemeral {
                agent_id: crate::domain::AgentId::new("codex-a"),
                slug: "codex".to_string(),
                label: "Codex".to_string(),
            },
            Instant::now(),
        );
        let key1 = session1.agent().ownership_key();
        registry.insert_for_testing(session1.clone()).await;
        registry
            .ownership()
            .claim_page(key1.clone(), browseros_core::PageId(1))
            .await;
        registry
            .ownership()
            .claim_page(key1.clone(), browseros_core::PageId(2))
            .await;
        registry
            .ownership()
            .set_tab_group(
                key1.clone(),
                Some("group-1".to_string()),
                Some(crate::domain::TabGroupColor::Purple),
            )
            .await;

        assert!(
            registry
                .remove(session1.id(), "closed", Some("reconnect"))
                .await?
        );

        let session2 = Session::new(
            SessionId::new("s2"),
            AgentRef::Ephemeral {
                agent_id: crate::domain::AgentId::new("codex-b"),
                slug: "codex".to_string(),
                label: "Codex".to_string(),
            },
            Instant::now(),
        );
        let key2 = session2.agent().ownership_key();
        registry.insert_for_testing(session2).await;

        assert_eq!(key1, key2);
        assert_eq!(
            registry
                .ownership()
                .owned_pages(&key2)
                .await
                .into_iter()
                .collect::<Vec<_>>(),
            vec![browseros_core::PageId(1), browseros_core::PageId(2)]
        );
        assert_eq!(
            registry.ownership().tab_group_ref(&key2).await.as_deref(),
            Some("group-1")
        );
        assert_eq!(
            registry.ownership().tab_group_color(&key2).await,
            Some(crate::domain::TabGroupColor::Purple)
        );
        Ok(())
    }
}

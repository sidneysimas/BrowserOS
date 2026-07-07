use crate::{
    domain::{SessionRegistry, TabGroupColor},
    services::tab_activity::TabActivityService,
};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReplayTab {
    pub session_id: String,
    pub tab_page_id: u32,
    pub url: String,
    pub title: String,
    pub group_color: Option<TabGroupColor>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReplayTabsResponse {
    pub tabs: Vec<ReplayTab>,
}

/// Builds replay discovery rows by joining tab activity to live sessions by agent id.
pub async fn list_replay_tabs(
    sessions: &SessionRegistry,
    tab_activity: &TabActivityService,
) -> ReplayTabsResponse {
    let live = sessions.snapshot().await;
    let mut live_by_agent_id = HashMap::with_capacity(live.len());
    for session in live {
        let agent_id = session.agent().agent_id().as_str().to_string();
        live_by_agent_id.entry(agent_id).or_insert(session);
    }

    let records = tab_activity.snapshot().await;
    let mut tabs = Vec::new();
    for record in records {
        let Some(session) = live_by_agent_id.get(record.agent_id.as_str()) else {
            continue;
        };
        let agent_key = session.agent().ownership_key();
        tabs.push(ReplayTab {
            session_id: session.id().as_str().to_string(),
            tab_page_id: record.page_id,
            url: record.url,
            title: record.title,
            group_color: sessions.ownership().tab_group_color(&agent_key).await,
        });
    }

    ReplayTabsResponse { tabs }
}

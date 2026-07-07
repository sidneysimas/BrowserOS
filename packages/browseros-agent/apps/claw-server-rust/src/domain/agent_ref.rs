use crate::{
    domain::{
        ids::{AgentId, ProfileId, SessionId},
        ownership::AgentKey,
    },
    services::agents::StoredAgentProfile,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClientInfo {
    pub name: String,
    pub version: String,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AgentRef {
    Profile {
        profile_id: ProfileId,
        agent_id: AgentId,
        slug: String,
        label: String,
    },
    Ephemeral {
        agent_id: AgentId,
        slug: String,
        label: String,
    },
}

impl AgentRef {
    #[must_use]
    pub fn resolve(
        session_id: &SessionId,
        client_info: &ClientInfo,
        profiles: &[StoredAgentProfile],
    ) -> Self {
        let client_slug = slugify_client_name(&client_info.name)
            .unwrap_or_else(|| fallback_slug_for_session(session_id));
        if let Some(profile) = profiles.iter().find(|profile| {
            profile.slug == client_slug
                || names_match(profile.name.as_str(), client_info.name.as_str())
        }) {
            return Self::Profile {
                profile_id: ProfileId::new(profile.id.clone()),
                agent_id: AgentId::new(format!(
                    "{}-{}",
                    profile.slug,
                    hash_tail(session_id.as_str())
                )),
                slug: profile.slug.clone(),
                label: profile.name.clone(),
            };
        }
        let label = clean_label(&client_info.name).unwrap_or_else(|| client_slug.clone());
        Self::Ephemeral {
            agent_id: AgentId::new(format!(
                "{}-{}",
                client_slug,
                hash_tail(session_id.as_str())
            )),
            slug: client_slug,
            label,
        }
    }

    #[must_use]
    pub fn agent_id(&self) -> &AgentId {
        match self {
            Self::Profile { agent_id, .. } | Self::Ephemeral { agent_id, .. } => agent_id,
        }
    }

    #[must_use]
    pub fn slug(&self) -> &str {
        match self {
            Self::Profile { slug, .. } | Self::Ephemeral { slug, .. } => slug,
        }
    }

    #[must_use]
    pub fn label(&self) -> &str {
        match self {
            Self::Profile { label, .. } | Self::Ephemeral { label, .. } => label,
        }
    }

    #[must_use]
    pub fn profile_id(&self) -> Option<&ProfileId> {
        match self {
            Self::Profile { profile_id, .. } => Some(profile_id),
            Self::Ephemeral { .. } => None,
        }
    }

    #[must_use]
    pub fn ownership_key(&self) -> AgentKey {
        match self {
            Self::Profile { profile_id, .. } => AgentKey::new(profile_id.as_str().to_string()),
            // Ephemeral identity is clientInfo-derived, so two unrelated harnesses that send the
            // same name intentionally share a pool; configured profiles avoid that collision.
            Self::Ephemeral { slug, .. } => AgentKey::new(slug.clone()),
        }
    }
}

#[must_use]
pub fn slugify_client_name(raw: &str) -> Option<String> {
    let mut out = String::new();
    let mut pending_dash = false;
    for ch in raw.chars().flat_map(char::to_lowercase) {
        if ch.is_ascii_alphanumeric() {
            if pending_dash && !out.is_empty() {
                out.push('-');
            }
            pending_dash = false;
            out.push(ch);
            if out.len() >= 64 {
                break;
            }
        } else {
            pending_dash = true;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn fallback_slug_for_session(session_id: &SessionId) -> String {
    format!("unknown-{}", hash_tail(session_id.as_str()))
}

fn clean_label(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn names_match(profile_name: &str, client_name: &str) -> bool {
    slugify_client_name(profile_name).as_deref() == slugify_client_name(client_name).as_deref()
}

fn hash_tail(input: &str) -> String {
    let mut hash = 0x811c9dc5_u32;
    for byte in input.as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_add(
            (hash << 1)
                .wrapping_add(hash << 4)
                .wrapping_add(hash << 7)
                .wrapping_add(hash << 8)
                .wrapping_add(hash << 24),
        );
    }
    format!("{hash:08x}").chars().take(6).collect()
}

#[cfg(test)]
mod tests {
    use super::{AgentRef, ClientInfo, slugify_client_name};
    use crate::{domain::SessionId, services::agents::StoredAgentProfile};
    use std::collections::BTreeMap;

    fn profile() -> StoredAgentProfile {
        StoredAgentProfile {
            id: "p1".to_string(),
            name: "Finance Ops".to_string(),
            harness: crate::services::agents::Harness::Codex,
            login_mode: crate::services::agents::LoginMode::Profile,
            selected_sites: Vec::new(),
            approvals: BTreeMap::new(),
            acl_rule_ids: Vec::new(),
            custom_acl_rules: Vec::new(),
            slug: "finance-ops".to_string(),
            mcp_url: "http://127.0.0.1:9200/mcp".to_string(),
            status: crate::services::agents::ProfileStatus::Configured,
            created_at: "now".to_string(),
            updated_at: "now".to_string(),
        }
    }

    #[test]
    fn slugify_matches_ts_identity_rules() {
        assert_eq!(
            slugify_client_name("Cowork . Finance ops").as_deref(),
            Some("cowork-finance-ops")
        );
        assert_eq!(slugify_client_name("..."), None);
    }

    #[test]
    fn resolves_profile_when_client_name_matches_slug() {
        let resolved = AgentRef::resolve(
            &SessionId::new("s1"),
            &ClientInfo {
                name: "finance ops".to_string(),
                version: "1".to_string(),
                title: None,
            },
            &[profile()],
        );
        match resolved {
            AgentRef::Profile {
                profile_id, slug, ..
            } => {
                assert_eq!(profile_id.as_str(), "p1");
                assert_eq!(slug, "finance-ops");
            }
            AgentRef::Ephemeral { .. } => panic!("expected profile"),
        }
    }

    #[test]
    fn falls_back_to_ephemeral_for_unknown_client() {
        let resolved = AgentRef::resolve(
            &SessionId::new("s1"),
            &ClientInfo {
                name: "Other".to_string(),
                version: "1".to_string(),
                title: None,
            },
            &[profile()],
        );
        match resolved {
            AgentRef::Ephemeral { slug, .. } => assert_eq!(slug, "other"),
            AgentRef::Profile { .. } => panic!("expected ephemeral"),
        }
    }

    #[test]
    fn ownership_key_prefers_profile_id_over_slug() {
        let resolved = AgentRef::resolve(
            &SessionId::new("s1"),
            &ClientInfo {
                name: "finance ops".to_string(),
                version: "1".to_string(),
                title: None,
            },
            &[profile()],
        );

        assert_eq!(resolved.ownership_key().as_str(), "p1");
    }

    #[test]
    fn ownership_key_uses_slug_for_ephemeral_agent() {
        let resolved = AgentRef::resolve(
            &SessionId::new("s1"),
            &ClientInfo {
                name: "Other".to_string(),
                version: "1".to_string(),
                title: None,
            },
            &[profile()],
        );

        assert_eq!(resolved.ownership_key().as_str(), "other");
    }
}

use crate::domain::AgentPageOwnership;
use browseros_cdp::{CdpClient, ConnectOptions, ReconnectPolicy};
use browseros_core::{
    BrowserSession, BrowserSessionHooks,
    pages::{OnPageDetached, PageManagerHooks},
};
use serde::Serialize;
use std::{sync::Arc, time::Duration};
use tokio::{
    sync::{RwLock, watch},
    task::JoinHandle,
};
use tokio_util::sync::CancellationToken;
use tracing::{debug, warn};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserConnectionState {
    pub connected: bool,
    pub epoch: u64,
    pub last_error: Option<String>,
}

pub struct BrowserService {
    cdp_port: u16,
    ownership: Arc<AgentPageOwnership>,
    state_tx: watch::Sender<BrowserConnectionState>,
    session: Arc<RwLock<Option<Arc<browseros_core::BrowserSession>>>>,
    cancel: CancellationToken,
}

impl BrowserService {
    #[must_use]
    pub fn new(cdp_port: u16, ownership: Arc<AgentPageOwnership>) -> Arc<Self> {
        let (state_tx, _) = watch::channel(BrowserConnectionState {
            connected: false,
            epoch: 0,
            last_error: None,
        });
        Arc::new(Self {
            cdp_port,
            ownership,
            state_tx,
            session: Arc::new(RwLock::new(None)),
            cancel: CancellationToken::new(),
        })
    }

    pub fn start(self: &Arc<Self>) -> JoinHandle<()> {
        let service = self.clone();
        tokio::spawn(async move {
            service.reattach_loop().await;
        })
    }

    #[must_use]
    pub fn state(&self) -> BrowserConnectionState {
        self.state_tx.borrow().clone()
    }

    pub async fn session(&self) -> Option<Arc<browseros_core::BrowserSession>> {
        self.session.read().await.clone()
    }

    #[doc(hidden)]
    pub async fn connect_once_for_testing(&self) -> Result<(), browseros_cdp::CdpError> {
        let opts = self.connect_options();
        let client = CdpClient::connect(opts).await?;
        *self.session.write().await = Some(self.browser_session(client.clone()));
        self.state_tx.send_replace(BrowserConnectionState {
            connected: true,
            epoch: client.epoch(),
            last_error: None,
        });
        Ok(())
    }

    pub fn stop(&self) {
        self.cancel.cancel();
    }

    fn connect_options(&self) -> ConnectOptions {
        ConnectOptions {
            port: self.cdp_port,
            connect_timeout: Duration::from_secs(2),
            connect_max_retries: 1,
            reconnect_policy: ReconnectPolicy::KeepTrying,
            reconnect_delay: Duration::from_secs(1),
            reconnect_max_retries: usize::MAX,
            ..ConnectOptions::new(self.cdp_port)
        }
    }

    fn browser_session(&self, client: CdpClient) -> Arc<BrowserSession> {
        let ownership = self.ownership.clone();
        let on_page_detached: OnPageDetached = Arc::new(move |page_id| {
            let ownership = ownership.clone();
            tokio::spawn(async move {
                ownership.remove_page(&page_id).await;
            });
        });
        BrowserSession::new(
            Arc::new(client),
            BrowserSessionHooks {
                page_manager: PageManagerHooks {
                    on_page_detached: Some(on_page_detached),
                    ..PageManagerHooks::default()
                },
            },
        )
    }

    async fn reattach_loop(self: Arc<Self>) {
        let mut backoff = Duration::from_secs(1);
        loop {
            if self.cancel.is_cancelled() {
                return;
            }
            let opts = self.connect_options();
            match CdpClient::connect(opts).await {
                Ok(client) => {
                    let session = self.browser_session(client.clone());
                    *self.session.write().await = Some(session);
                    let epoch = client.epoch();
                    self.state_tx.send_replace(BrowserConnectionState {
                        connected: true,
                        epoch,
                        last_error: None,
                    });
                    debug!(epoch, "connected to BrowserOS CDP");
                    self.monitor_client(client).await;
                    *self.session.write().await = None;
                    backoff = Duration::from_secs(1);
                }
                Err(err) => {
                    let epoch = self.state_tx.borrow().epoch;
                    self.state_tx.send_replace(BrowserConnectionState {
                        connected: false,
                        epoch,
                        last_error: Some(err.to_string()),
                    });
                    warn!(error = %err, retry_ms = backoff.as_millis(), "CDP connect failed; retrying");
                    tokio::select! {
                        () = self.cancel.cancelled() => return,
                        () = tokio::time::sleep(backoff) => {}
                    }
                    backoff = (backoff * 2).min(Duration::from_secs(30));
                }
            }
        }
    }

    async fn monitor_client(&self, client: CdpClient) {
        let mut last_connected = true;
        let mut last_epoch = client.epoch();
        loop {
            tokio::select! {
                () = self.cancel.cancelled() => {
                    client.disconnect().await;
                    return;
                }
                () = tokio::time::sleep(Duration::from_secs(1)) => {
                    let connected = client.is_connected();
                    let epoch = client.epoch();
                    if connected != last_connected || epoch != last_epoch {
                        self.state_tx.send_replace(BrowserConnectionState {
                            connected,
                            epoch,
                            last_error: if connected { None } else { Some("CDP disconnected; reconnecting".to_string()) },
                        });
                        last_connected = connected;
                        last_epoch = epoch;
                    }
                }
            }
        }
    }
}

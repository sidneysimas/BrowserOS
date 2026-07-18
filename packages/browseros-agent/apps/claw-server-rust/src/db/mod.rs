pub mod audit;

use crate::error::{AppError, AppResult, IoPath};
use sea_orm::{
    DatabaseConnection, DbErr, RuntimeErr, SqlxSqliteConnector,
    sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
};
use sea_orm_migration::MigratorTrait;
use std::{
    ffi::OsString,
    path::{Path, PathBuf},
    time::Duration,
};

/// Opens a SQLite database, applies its migrator, and recovers broken files once.
pub async fn open_and_migrate<M: MigratorTrait>(path: &Path) -> AppResult<DatabaseConnection> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.with_path(parent)?;
    }

    match connect_and_migrate::<M>(path).await {
        Ok(conn) => Ok(conn),
        Err(_) => {
            back_up_database(path).await?;
            connect_and_migrate::<M>(path).await.map_err(AppError::from)
        }
    }
}

async fn connect_and_migrate<M: MigratorTrait>(path: &Path) -> Result<DatabaseConnection, DbErr> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5));
    // A single connection preserves the old mutex-serialized write behavior and avoids SQLite write-upgrade contention.
    // A blocking task prevents paused Tokio clocks from expiring SQLx's acquire timeout before its SQLite worker responds.
    let runtime = tokio::runtime::Handle::current();
    let pool = tokio::task::spawn_blocking(move || {
        runtime.block_on(
            SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(options),
        )
    })
    .await
    .map_err(|error| DbErr::Custom(format!("SQLite connection task failed: {error}")))?
    .map_err(|error| DbErr::Conn(RuntimeErr::SqlxError(error)))?;
    let conn = SqlxSqliteConnector::from_sqlx_sqlite_pool(pool);
    if let Err(error) = M::up(&conn, None).await {
        conn.close().await?;
        return Err(error);
    }
    Ok(conn)
}

async fn back_up_database(path: &Path) -> AppResult<()> {
    for (source_suffix, backup_suffix) in [("", ".bak"), ("-wal", ".bak-wal"), ("-shm", ".bak-shm")]
    {
        let source = append_suffix(path, source_suffix);
        let backup = append_suffix(path, backup_suffix);
        match tokio::fs::rename(&source, &backup).await {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(AppError::Io {
                    path: Some(source),
                    source: error,
                });
            }
        }
    }
    Ok(())
}

fn append_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut value = OsString::from(path.as_os_str());
    value.push(suffix);
    value.into()
}

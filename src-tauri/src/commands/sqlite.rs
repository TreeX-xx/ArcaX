use crate::commands::profiles::ProfileState;
use crate::error::{AppError, Result};
use crate::s3::S3State;
use crate::sqlite::{
    self, PreviewDecision, SqliteCatalog, SqliteTablePage, MAX_SQLITE_PREVIEW_BYTES,
};
use aws_sdk_s3::Client;
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::State;

#[derive(Default)]
pub struct SqlitePreviewCache {
    inner: Mutex<Option<CachedDatabase>>,
}

struct CachedDatabase {
    profile_id: String,
    bucket: String,
    key: String,
    e_tag: String,
    bytes: Arc<Vec<u8>>,
}

impl SqlitePreviewCache {
    fn get(&self, profile_id: &str, bucket: &str, key: &str, e_tag: &str) -> Option<Arc<Vec<u8>>> {
        let guard = self.inner.lock().unwrap_or_else(|error| error.into_inner());
        guard.as_ref().and_then(|cached| {
            (cached.profile_id == profile_id
                && cached.bucket == bucket
                && cached.key == key
                && cached.e_tag == e_tag)
                .then(|| Arc::clone(&cached.bytes))
        })
    }

    fn put(
        &self,
        profile_id: String,
        bucket: String,
        key: String,
        e_tag: String,
        bytes: Arc<Vec<u8>>,
    ) {
        let mut guard = self.inner.lock().unwrap_or_else(|error| error.into_inner());
        *guard = Some(CachedDatabase {
            profile_id,
            bucket,
            key,
            e_tag,
            bytes,
        });
    }
}

#[derive(Debug, Serialize)]
pub struct SqliteProbe {
    pub decision: PreviewDecision,
    pub size: u64,
}

async fn active_client(
    expected_profile_id: &str,
    bucket_name: &str,
    bucket_region: Option<String>,
    profile_state: &ProfileState,
    s3_state: &S3State,
) -> Result<(String, Client)> {
    let profile = {
        let manager = profile_state.read().await;
        manager
            .get_active_profile()
            .await?
            .ok_or_else(|| AppError::ProfileNotFound("No active profile".to_string()))?
    };
    super::operations::validate_operation_profile(Some(expected_profile_id), &profile.id)?;

    let bucket_region = {
        let manager = s3_state.read().await;
        manager.get_bucket_region(&profile, bucket_name)
    }
    .or(bucket_region);

    let client = {
        let mut manager = s3_state.write().await;
        if let Some(region) = bucket_region.as_deref() {
            manager
                .get_client_for_region(&profile, region)
                .await?
                .clone()
        } else {
            manager.get_client(&profile).await?.clone()
        }
    };
    Ok((profile.id, client))
}

async fn object_head(client: &Client, bucket: &str, key: &str) -> Result<(u64, Option<String>)> {
    let head = client
        .head_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .map_err(|error| {
            AppError::S3Error(format!("Could not read SQLite object metadata: {error}"))
        })?;
    let size = head.content_length().unwrap_or(0).max(0) as u64;
    let e_tag = head.e_tag().map(str::to_string);
    Ok((size, e_tag))
}

async fn read_header(client: &Client, bucket: &str, key: &str) -> Result<Vec<u8>> {
    let response = client
        .get_object()
        .bucket(bucket)
        .key(key)
        .range("bytes=0-15")
        .send()
        .await
        .map_err(|error| AppError::S3Error(format!("Could not read the SQLite header: {error}")))?;
    let mut header = Vec::with_capacity(sqlite::SQLITE_MAGIC.len());
    let mut body = response.body;
    while header.len() < sqlite::SQLITE_MAGIC.len() {
        let Some(chunk) = body.try_next().await.map_err(|error| {
            AppError::S3Error(format!("Could not read the SQLite header: {error}"))
        })?
        else {
            break;
        };
        let remaining = sqlite::SQLITE_MAGIC.len() - header.len();
        if chunk.len() > remaining {
            header.extend_from_slice(&chunk[..remaining]);
            break;
        }
        header.extend_from_slice(&chunk);
    }
    Ok(header)
}

async fn download_capped(client: &Client, bucket: &str, key: &str) -> Result<Vec<u8>> {
    let response = client
        .get_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .map_err(|error| {
            AppError::S3Error(format!("Could not download the SQLite database: {error}"))
        })?;
    let mut bytes = Vec::new();
    let mut body = response.body;
    while let Some(chunk) = body.try_next().await.map_err(|error| {
        AppError::S3Error(format!("Could not download the SQLite database: {error}"))
    })? {
        if (bytes.len() as u64).saturating_add(chunk.len() as u64) > MAX_SQLITE_PREVIEW_BYTES {
            return Err(AppError::SqliteError(
                "This SQLite database is too large to preview. Download it to inspect locally."
                    .to_string(),
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

async fn load_database(
    expected_profile_id: &str,
    bucket_name: &str,
    bucket_region: Option<String>,
    key: &str,
    profile_state: &ProfileState,
    s3_state: &S3State,
    cache: &SqlitePreviewCache,
) -> Result<Arc<Vec<u8>>> {
    let (profile_id, client) = active_client(
        expected_profile_id,
        bucket_name,
        bucket_region,
        profile_state,
        s3_state,
    )
    .await?;
    let (size, e_tag) = object_head(&client, bucket_name, key).await?;
    if size > MAX_SQLITE_PREVIEW_BYTES {
        return Err(AppError::SqliteError(
            "This SQLite database is too large to preview. Download it to inspect locally."
                .to_string(),
        ));
    }
    if let Some(e_tag) = e_tag.as_deref() {
        if let Some(cached) = cache.get(&profile_id, bucket_name, key, e_tag) {
            return Ok(cached);
        }
    }

    let bytes = download_capped(&client, bucket_name, key).await?;
    if !sqlite::header_is_sqlite(&bytes) {
        return Err(AppError::SqliteError(
            "This file is not a SQLite database.".to_string(),
        ));
    }
    let bytes = Arc::new(bytes);
    if let Some(e_tag) = e_tag {
        cache.put(
            profile_id,
            bucket_name.to_string(),
            key.to_string(),
            e_tag,
            Arc::clone(&bytes),
        );
    }
    Ok(bytes)
}

#[tauri::command]
pub async fn probe_sqlite_preview(
    bucket_name: String,
    bucket_region: Option<String>,
    key: String,
    expected_profile_id: String,
    profile_state: State<'_, ProfileState>,
    s3_state: State<'_, S3State>,
) -> Result<SqliteProbe> {
    let (_profile_id, client) = active_client(
        &expected_profile_id,
        &bucket_name,
        bucket_region,
        profile_state.inner(),
        s3_state.inner(),
    )
    .await?;
    let (size, _e_tag) = object_head(&client, &bucket_name, &key).await?;
    if size == 0 {
        return Ok(SqliteProbe {
            decision: PreviewDecision::Fallback,
            size,
        });
    }
    let header = read_header(&client, &bucket_name, &key).await?;
    Ok(SqliteProbe {
        decision: sqlite::decide_preview(&key, &header, size),
        size,
    })
}

#[tauri::command]
pub async fn list_sqlite_tables(
    bucket_name: String,
    bucket_region: Option<String>,
    key: String,
    expected_profile_id: String,
    profile_state: State<'_, ProfileState>,
    s3_state: State<'_, S3State>,
    cache: State<'_, SqlitePreviewCache>,
) -> Result<SqliteCatalog> {
    let bytes = load_database(
        &expected_profile_id,
        &bucket_name,
        bucket_region,
        &key,
        profile_state.inner(),
        s3_state.inner(),
        cache.inner(),
    )
    .await?;
    tokio::task::spawn_blocking(move || sqlite::list_tables(&bytes))
        .await
        .map_err(|error| AppError::SqliteError(format!("SQLite worker failed: {error}")))?
}

#[tauri::command]
pub async fn read_sqlite_table(
    bucket_name: String,
    bucket_region: Option<String>,
    key: String,
    table: String,
    offset: u64,
    limit: u32,
    expected_profile_id: String,
    profile_state: State<'_, ProfileState>,
    s3_state: State<'_, S3State>,
    cache: State<'_, SqlitePreviewCache>,
) -> Result<SqliteTablePage> {
    let bytes = load_database(
        &expected_profile_id,
        &bucket_name,
        bucket_region,
        &key,
        profile_state.inner(),
        s3_state.inner(),
        cache.inner(),
    )
    .await?;
    tokio::task::spawn_blocking(move || sqlite::read_table(&bytes, &table, offset, limit))
        .await
        .map_err(|error| AppError::SqliteError(format!("SQLite worker failed: {error}")))?
}

#[cfg(test)]
mod tests {
    use super::SqlitePreviewCache;
    use std::sync::Arc;

    #[test]
    fn cache_matches_profile_bucket_key_and_etag() {
        let cache = SqlitePreviewCache::default();
        let bytes = Arc::new(b"SQLite format 3\0".to_vec());
        cache.put(
            "profile".to_string(),
            "bucket".to_string(),
            "nested/toolDB".to_string(),
            "etag-1".to_string(),
            Arc::clone(&bytes),
        );

        assert_eq!(
            cache
                .get("profile", "bucket", "nested/toolDB", "etag-1")
                .as_deref()
                .map(|cached| cached.as_slice()),
            Some(bytes.as_slice())
        );
        assert!(cache
            .get("profile", "bucket", "nested/toolDB", "etag-2")
            .is_none());
        assert!(cache
            .get("profile", "bucket", "library.sqlite", "etag-1")
            .is_none());
        assert!(cache
            .get("other", "bucket", "nested/toolDB", "etag-1")
            .is_none());
    }
}

use crate::archive::range_reader::S3RangeReader;
use crate::archive::{
    self, ArchiveEntryContent, ArchiveListing, ExtractResult, MAX_ENTRY_PREVIEW_BYTES,
    MAX_TEXT_ENTRY_PREVIEW_BYTES,
};
use crate::commands::profiles::ProfileState;
use crate::error::{AppError, Result};
use crate::s3::S3State;
use std::path::PathBuf;
use tauri::State;

const RANGE_CHUNK_BYTES: u64 = 1024 * 1024;
const PRESIGN_SECONDS: u64 = 3600;

async fn prepare_archive(
    expected_profile_id: &str,
    bucket_name: &str,
    bucket_region: Option<String>,
    key: &str,
    profile_state: &ProfileState,
    s3_state: &S3State,
) -> Result<(u64, Option<String>, String)> {
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

    let head = client
        .head_object()
        .bucket(bucket_name)
        .key(key)
        .send()
        .await
        .map_err(|error| {
            AppError::S3Error(format!("Could not read archive metadata: {error}"))
        })?;
    let size = head.content_length().unwrap_or(0).max(0) as u64;
    let e_tag = head.e_tag().map(|value| value.to_string());
    let url = super::objects::presigned_get_url(
        &profile,
        s3_state,
        bucket_name,
        bucket_region,
        key,
        PRESIGN_SECONDS,
    )
    .await?;
    Ok((size, e_tag, url))
}

fn ensure_zip(key: &str) -> Result<()> {
    if key.to_ascii_lowercase().ends_with(".zip") {
        Ok(())
    } else {
        Err(AppError::ArchiveError(
            "Only ZIP archives are supported in this build.".to_string(),
        ))
    }
}

#[tauri::command]
pub async fn list_archive_entries(
    bucket_name: String,
    bucket_region: Option<String>,
    key: String,
    expected_profile_id: String,
    profile_state: State<'_, ProfileState>,
    s3_state: State<'_, S3State>,
) -> Result<ArchiveListing> {
    ensure_zip(&key)?;
    let (size, e_tag, url) = prepare_archive(
        &expected_profile_id,
        &bucket_name,
        bucket_region,
        &key,
        profile_state.inner(),
        s3_state.inner(),
    )
    .await?;

    tokio::task::spawn_blocking(move || {
        let reader = S3RangeReader::new(url, size, RANGE_CHUNK_BYTES, e_tag)?;
        archive::zip::list(reader)
    })
    .await
    .map_err(|error| AppError::ArchiveError(format!("Archive worker failed: {error}")))?
}

#[tauri::command]
pub async fn read_archive_entry(
    bucket_name: String,
    bucket_region: Option<String>,
    key: String,
    entry_id: usize,
    max_bytes: Option<u64>,
    expected_profile_id: String,
    profile_state: State<'_, ProfileState>,
    s3_state: State<'_, S3State>,
) -> Result<ArchiveEntryContent> {
    ensure_zip(&key)?;
    let max_bytes = max_bytes
        .unwrap_or(MAX_TEXT_ENTRY_PREVIEW_BYTES)
        .clamp(1, MAX_ENTRY_PREVIEW_BYTES);
    let (size, e_tag, url) = prepare_archive(
        &expected_profile_id,
        &bucket_name,
        bucket_region,
        &key,
        profile_state.inner(),
        s3_state.inner(),
    )
    .await?;

    tokio::task::spawn_blocking(move || {
        let reader = S3RangeReader::new(url, size, RANGE_CHUNK_BYTES, e_tag)?;
        archive::zip::read_entry(reader, entry_id, max_bytes)
    })
    .await
    .map_err(|error| AppError::ArchiveError(format!("Archive worker failed: {error}")))?
}

#[tauri::command]
pub async fn extract_archive_entry(
    bucket_name: String,
    bucket_region: Option<String>,
    key: String,
    entry_id: usize,
    destination_path: String,
    expected_profile_id: String,
    profile_state: State<'_, ProfileState>,
    s3_state: State<'_, S3State>,
) -> Result<ExtractResult> {
    ensure_zip(&key)?;
    let destination = PathBuf::from(destination_path);
    let (size, e_tag, url) = prepare_archive(
        &expected_profile_id,
        &bucket_name,
        bucket_region,
        &key,
        profile_state.inner(),
        s3_state.inner(),
    )
    .await?;

    tokio::task::spawn_blocking(move || {
        let reader = S3RangeReader::new(url, size, RANGE_CHUNK_BYTES, e_tag)?;
        archive::zip::extract_entry(reader, entry_id, &destination)
    })
    .await
    .map_err(|error| AppError::ArchiveError(format!("Archive worker failed: {error}")))?
}

use crate::commands::profiles::ProfileState;
use crate::s3::{self, BucketInfo, S3State};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct BucketWithRegion {
    pub name: String,
    pub region: String,
    pub creation_date: Option<String>,
    pub object_count: Option<u64>,
    pub total_size: Option<u64>,
    pub total_size_formatted: Option<String>,
}

async fn configured_buckets(
    client: &aws_sdk_s3::Client,
    profile: &crate::credentials::Profile,
) -> Result<Vec<BucketInfo>, String> {
    if let Some(name) = &profile.default_bucket {
        return Ok(vec![BucketInfo {
            name: name.clone(),
            region: Some(s3::client::profile_region(profile)),
            creation_date: None,
            object_count: None,
            total_size: None,
            total_size_formatted: None,
        }]);
    }
    s3::client::list_buckets(client)
        .await
        .map_err(|e| e.to_string())
}

/// List all accessible S3 buckets
#[tauri::command]
pub async fn list_buckets(
    profile_state: State<'_, ProfileState>,
    s3_state: State<'_, S3State>,
) -> Result<Vec<BucketInfo>, String> {
    // Get active profile
    let profile_manager = profile_state.read().await;
    let active_profile = profile_manager
        .get_active_profile()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No active profile selected".to_string())?;

    drop(profile_manager);

    // Get S3 client
    let mut s3_manager = s3_state.write().await;
    let client = s3_manager
        .get_client(&active_profile)
        .await
        .map_err(|e| e.to_string())?
        .clone();
    drop(s3_manager);

    // List buckets
    let buckets = configured_buckets(&client, &active_profile).await?;

    Ok(buckets)
}

/// List buckets with their regions
#[tauri::command]
pub async fn list_buckets_with_regions(
    profile_state: State<'_, ProfileState>,
    s3_state: State<'_, S3State>,
) -> Result<Vec<BucketWithRegion>, String> {
    // Get active profile
    let profile_manager = profile_state.read().await;
    let active_profile = profile_manager
        .get_active_profile()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No active profile selected".to_string())?;

    drop(profile_manager);

    // Get S3 client
    let mut s3_manager = s3_state.write().await;
    let client = s3_manager
        .get_client(&active_profile)
        .await
        .map_err(|e| e.to_string())?
        .clone();
    drop(s3_manager);

    // List buckets
    let buckets = configured_buckets(&client, &active_profile).await?;

    // For custom endpoints (non-AWS providers like Linode, DigitalOcean, MinIO, etc.),
    // the GetBucketLocation API is often unsupported and causes "dispatch failure" errors.
    // Use the profile's configured region directly instead of querying per-bucket.
    let is_custom_endpoint = matches!(
        &active_profile.credential_type,
        crate::credentials::CredentialType::CustomEndpoint { .. }
    );
    let profile_region = s3::client::profile_region(&active_profile);

    if is_custom_endpoint {
        // Skip GetBucketLocation entirely for custom endpoints
        s3_state.write().await.set_bucket_regions(
            &active_profile,
            buckets.iter().map(|bucket| bucket.name.as_str()),
            &profile_region,
        );
        let buckets_with_regions: Vec<BucketWithRegion> = buckets
            .into_iter()
            .map(|bucket| BucketWithRegion {
                name: bucket.name,
                region: profile_region.clone(),
                creation_date: bucket.creation_date,
                object_count: bucket.object_count,
                total_size: bucket.total_size,
                total_size_formatted: bucket.total_size_formatted,
            })
            .collect();

        return Ok(buckets_with_regions);
    }

    // For standard AWS profiles, fetch regions in PARALLEL for much faster startup
    let client_clone = client.clone();
    let fallback_region = profile_region.clone();
    let futures: Vec<_> = buckets
        .into_iter()
        .map(|bucket| {
            let client_ref = client_clone.clone();
            let bucket_name = bucket.name.clone();
            let fallback = fallback_region.clone();
            async move {
                let region = match s3::client::get_bucket_region(&client_ref, &bucket_name).await {
                    Ok(r) => r,
                    Err(_) => fallback,
                };
                BucketWithRegion {
                    name: bucket.name,
                    region,
                    creation_date: bucket.creation_date,
                    object_count: bucket.object_count,
                    total_size: bucket.total_size,
                    total_size_formatted: bucket.total_size_formatted,
                }
            }
        })
        .collect();

    let buckets_with_regions = futures::stream::iter(futures)
        .buffered(8)
        .collect::<Vec<_>>()
        .await;

    Ok(buckets_with_regions)
}

/// Get the region for a specific bucket
#[tauri::command]
pub async fn get_bucket_region(
    bucket_name: String,
    profile_state: State<'_, ProfileState>,
    s3_state: State<'_, S3State>,
) -> Result<String, String> {
    // Get active profile
    let profile_manager = profile_state.read().await;
    let active_profile = profile_manager
        .get_active_profile()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No active profile selected".to_string())?;

    drop(profile_manager);

    if matches!(
        &active_profile.credential_type,
        crate::credentials::CredentialType::CustomEndpoint { .. }
    ) {
        let region = s3::client::profile_region(&active_profile);
        let mut s3_manager = s3_state.write().await;
        s3_manager.set_bucket_region(&active_profile, &bucket_name, region.clone());
        return Ok(region);
    }

    // Get S3 client
    let mut s3_manager = s3_state.write().await;
    let client = s3_manager
        .get_client(&active_profile)
        .await
        .map_err(|e| e.to_string())?
        .clone();
    drop(s3_manager);

    // Get region
    s3::client::get_bucket_region(&client, &bucket_name)
        .await
        .map_err(|e| e.to_string())
}

/// Refresh the S3 client (clear cache)
#[tauri::command]
pub async fn refresh_s3_client(s3_state: State<'_, S3State>) -> Result<(), String> {
    let mut s3_manager = s3_state.write().await;
    s3_manager.clear_cache();
    Ok(())
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn configured_bucket_is_available_without_account_listing_permission() {
        let (client, server) = crate::commands::test_s3::scripted_client(vec![]).await;
        let mut profile = crate::credentials::Profile::new(
            "COS".into(),
            crate::credentials::CredentialType::CustomEndpoint {
                endpoint_url: "https://cos.ap-guangzhou.myqcloud.com".into(),
                access_key_id: "test".into(),
                secret_access_key: "test-secret".into(),
            },
            Some("us-east-1".into()),
        );
        profile.default_bucket = Some("target-1250000000".into());
        let buckets = super::configured_buckets(&client, &profile).await.unwrap();
        assert_eq!(buckets.len(), 1);
        assert_eq!(buckets[0].name, "target-1250000000");
        assert_eq!(buckets[0].region.as_deref(), Some("ap-guangzhou"));
        assert!(server.await.unwrap().is_empty());
    }
}

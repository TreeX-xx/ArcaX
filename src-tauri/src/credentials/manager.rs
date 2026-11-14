use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use uuid::Uuid;

const PROFILES_FILE: &str = "profiles.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CredentialType {
    /// Use environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
    Environment,

    /// Use AWS shared config file (~/.aws/credentials)
    SharedConfig { profile_name: Option<String> },

    /// Manual entry with access key and secret (stored in keychain)
    Manual {
        access_key_id: String,
        #[serde(default, skip_serializing)]
        secret_access_key: String,
    },

    /// Custom S3-compatible endpoint (MinIO, Wasabi, etc.)
    CustomEndpoint {
        endpoint_url: String,
        access_key_id: String,
        #[serde(default, skip_serializing)]
        secret_access_key: String,
    },
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Profile {
    #[serde(default)]
    pub provider: StorageProvider,
    /// Kept only in secret storage; None preserves an omitted token on edits.
    #[serde(default, skip_serializing)]
    pub session_token: Option<String>,
    /// Non-secret marker: a failed token read must never silently remove STS.
    #[serde(default)]
    pub has_session_token: bool,
    /// Missing on older profiles: retain provider-aware automatic addressing.
    #[serde(default)]
    pub addressing_style: AddressingStyle,
    #[serde(default)]
    pub default_bucket: Option<String>,
    #[serde(default)]
    pub public_urls: crate::transfer::public_url::PublicUrls,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub secret_ref: Option<String>,
    pub name: String,
    pub credential_type: CredentialType,
    pub region: Option<String>,
    pub is_default: bool,
    #[serde(default)]
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(default)]
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl std::fmt::Debug for Profile {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Profile")
            .field("id", &self.id)
            .field("provider", &self.provider)
            .field("credentials", &"[REDACTED]")
            .finish_non_exhaustive()
    }
}

impl Profile {
    pub fn validate_connection(&self) -> Result<()> {
        if let CredentialType::CustomEndpoint { endpoint_url, .. } = &self.credential_type {
            if let Some((detected, _)) = crate::s3::client::endpoint_provider(endpoint_url) {
                if self.provider != StorageProvider::Auto && self.provider != detected {
                    return Err(AppError::ConfigError(
                        "The endpoint does not match the selected storage provider.".into(),
                    ));
                }
            }
            if crate::s3::client::provider_for(self, endpoint_url) == StorageProvider::Obs
                && url::Url::parse(&crate::s3::client::normalize_endpoint_url(endpoint_url))
                    .map(|url| url.scheme() != "https")
                    .unwrap_or(true)
            {
                return Err(AppError::ConfigError(
                    "Huawei OBS connections require HTTPS.".into(),
                ));
            }
        }
        if let Some(bucket) = &self.default_bucket {
            if bucket.is_empty()
                || bucket.len() > 63
                || !bucket
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'.')
            {
                return Err(AppError::ConfigError(
                    "Enter a bucket name, not a URL or path.".into(),
                ));
            }
        }
        Ok(())
    }

    pub fn cache_identity(&self) -> String {
        format!(
            "{}:{}",
            self.id,
            self.updated_at
                .map(|date| date.to_rfc3339())
                .unwrap_or_default()
        )
    }

    pub fn new(name: String, credential_type: CredentialType, region: Option<String>) -> Self {
        let now = chrono::Utc::now();
        Self {
            provider: StorageProvider::Auto,
            session_token: None,
            has_session_token: false,
            addressing_style: AddressingStyle::Auto,
            default_bucket: None,
            public_urls: Default::default(),
            id: Uuid::new_v4().to_string(),
            name,
            secret_ref: None,
            credential_type,
            region,
            is_default: false,
            created_at: Some(now),
            updated_at: Some(now),
        }
    }
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StorageProvider {
    #[default]
    Auto,
    Cos,
    Oss,
    Obs,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AddressingStyle {
    #[default]
    Auto,
    Virtual,
    Path,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
struct ProfilesData {
    profiles: HashMap<String, Profile>,
    active_profile_id: Option<String>,
    pending_secret_deletions: Vec<String>,
}

pub struct ProfileManager {
    config_dir: PathBuf,
    data: ProfilesData,
    keychain: super::KeychainStorage,
}

impl ProfileManager {
    pub fn new(config_dir: PathBuf, force_secret_fallback: bool) -> Result<Self> {
        let profiles_path = config_dir.join(PROFILES_FILE);
        log::info!(
            "Initializing ProfileManager. Storage path: {:?}",
            profiles_path
        );

        let data = if profiles_path.exists() {
            log::info!("Found existing profiles file.");
            let content = std::fs::read_to_string(&profiles_path)?;
            match Self::load_profiles_data(&content) {
                Ok(d) => {
                    log::info!("Successfully loaded profiles data.");
                    d
                }
                Err(e) => {
                    use std::io::Write;
                    let backup_path =
                        config_dir.join(format!("profiles.invalid-{}.json", Uuid::new_v4()));
                    let mut options = std::fs::OpenOptions::new();
                    options.write(true).create_new(true);
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::OpenOptionsExt;
                        options.mode(0o600);
                    }
                    let mut backup = options.open(&backup_path)?;
                    backup.write_all(content.as_bytes())?;
                    backup.sync_all()?;
                    log::error!(
                        "Failed to parse profiles.json: {}. Original saved to {:?}.",
                        e,
                        backup_path
                    );
                    ProfilesData::default()
                }
            }
        } else {
            log::info!("No profiles file found. Creating new.");
            ProfilesData::default()
        };

        let keychain = super::KeychainStorage::new("brows3", &config_dir, force_secret_fallback);

        let mut manager = Self {
            config_dir,
            data,
            keychain,
        };
        manager.cleanup_pending_secrets();
        Ok(manager)
    }

    fn load_profiles_data(content: &str) -> std::result::Result<ProfilesData, serde_json::Error> {
        let value: serde_json::Value = serde_json::from_str(content)?;
        if value.is_array() {
            let profiles: Vec<Profile> = serde_json::from_value(value)?;
            return Ok(Self::normalize_profiles_data(ProfilesData {
                profiles: profiles
                    .into_iter()
                    .map(|profile| (profile.id.clone(), profile))
                    .collect(),
                active_profile_id: None,
                pending_secret_deletions: Vec::new(),
            }));
        }

        if value.get("profiles").is_some() || value.get("active_profile_id").is_some() {
            if let Ok(data) = serde_json::from_value::<ProfilesData>(value.clone()) {
                return Ok(Self::normalize_profiles_data(data));
            }
        }

        let profiles = serde_json::from_value::<HashMap<String, Profile>>(value)?;
        Ok(Self::normalize_profiles_data(ProfilesData {
            profiles,
            active_profile_id: None,
            pending_secret_deletions: Vec::new(),
        }))
    }

    fn normalize_profiles_data(mut data: ProfilesData) -> ProfilesData {
        let mut normalized_profiles = HashMap::with_capacity(data.profiles.len());
        let mut first_profile_id: Option<String> = None;
        let mut default_profile_id: Option<String> = None;

        for (key, mut profile) in data.profiles.drain() {
            if profile.id.is_empty() {
                profile.id = if !key.is_empty() {
                    key
                } else {
                    Uuid::new_v4().to_string()
                };
            }

            if first_profile_id.is_none() {
                first_profile_id = Some(profile.id.clone());
            }
            if profile.is_default && default_profile_id.is_none() {
                default_profile_id = Some(profile.id.clone());
            }

            normalized_profiles.insert(profile.id.clone(), profile);
        }

        let mut active_profile_id = data
            .active_profile_id
            .filter(|id| normalized_profiles.contains_key(id));

        if active_profile_id.is_none() {
            active_profile_id = default_profile_id.or(first_profile_id.clone());
        }

        for profile in normalized_profiles.values_mut() {
            profile.is_default = active_profile_id.as_ref() == Some(&profile.id);
        }

        ProfilesData {
            profiles: normalized_profiles,
            active_profile_id,
            pending_secret_deletions: data.pending_secret_deletions,
        }
    }

    fn sync_default_flags(&mut self) {
        let active_profile_id = self.data.active_profile_id.clone();
        for profile in self.data.profiles.values_mut() {
            profile.is_default = active_profile_id.as_ref() == Some(&profile.id);
        }
    }

    fn commit(&mut self, previous: ProfilesData) -> Result<()> {
        if let Err(error) = self.save() {
            self.data = previous;
            return Err(error);
        }
        Ok(())
    }

    fn save(&self) -> Result<()> {
        let profiles_path = self.config_dir.join(PROFILES_FILE);
        log::info!("Saving profiles atomically to {:?}", profiles_path);
        let content = serde_json::to_string_pretty(&self.data)?;
        super::write_private_file(&profiles_path, content.as_bytes())
    }

    pub async fn list_profiles(&self) -> Result<Vec<Profile>> {
        let mut profiles: Vec<Profile> = self.data.profiles.values().cloned().collect();
        profiles.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(profiles)
    }

    pub async fn get_profile(&self, id: &str) -> Result<Profile> {
        let profile = self
            .data
            .profiles
            .get(id)
            .cloned()
            .ok_or_else(|| AppError::ProfileNotFound(id.to_string()))?;
        self.hydrate_profile(profile)
    }

    pub async fn add_profile(&mut self, mut profile: Profile) -> Result<Profile> {
        profile.validate_connection()?;
        profile.public_urls.validate()?;
        // Generate ID if not provided
        if profile.id.is_empty() {
            profile.id = Uuid::new_v4().to_string();
        }
        // Check for duplicate name
        if self.data.profiles.values().any(|p| p.name == profile.name) {
            return Err(AppError::ProfileExists(profile.name.clone()));
        }

        if self.data.profiles.contains_key(&profile.id) {
            return Err(AppError::ProfileExists(profile.id));
        }
        let previous = self.data.clone();
        profile.secret_ref = Some(Uuid::new_v4().to_string());
        profile.has_session_token = matches!(
            profile.credential_type,
            CredentialType::CustomEndpoint { .. }
        ) && profile
            .session_token
            .as_deref()
            .is_some_and(|v| !v.is_empty());
        if !matches!(
            profile.credential_type,
            CredentialType::CustomEndpoint { .. }
        ) {
            profile.session_token = None;
        }
        self.store_secret(&profile)?;

        // Set timestamps
        let now = chrono::Utc::now();
        profile.created_at = Some(now);
        profile.updated_at = Some(now);

        // If this is the first profile, make it default
        if self.data.profiles.is_empty() {
            profile.is_default = true;
            self.data.active_profile_id = Some(profile.id.clone());
        }

        self.data
            .profiles
            .insert(profile.id.clone(), profile.clone());
        self.sync_default_flags();
        if let Err(error) = self.commit(previous) {
            self.remove_secret(&profile);
            return Err(error);
        }

        self.hydrate_profile(
            self.data
                .profiles
                .get(&profile.id)
                .cloned()
                .ok_or_else(|| AppError::ProfileNotFound(profile.id.clone()))?,
        )
    }

    pub async fn update_profile(&mut self, id: &str, mut profile: Profile) -> Result<Profile> {
        profile.validate_connection()?;
        profile.public_urls.validate()?;
        let existing_profile = self
            .data
            .profiles
            .get(id)
            .cloned()
            .ok_or_else(|| AppError::ProfileNotFound(id.to_string()))?;
        let mut existing_credentials = existing_profile.clone();
        // Explicit replacement/clear can repair an unreadable saved token.
        if profile.session_token.is_some() {
            existing_credentials.session_token = profile.session_token.clone();
        } else if !matches!(
            profile.credential_type,
            CredentialType::CustomEndpoint { .. }
        ) {
            existing_credentials.session_token = Some(String::new());
        }
        let hydrated_existing_profile = self.hydrate_profile(existing_credentials)?;

        if self
            .data
            .profiles
            .values()
            .any(|p| p.id != id && p.name == profile.name)
        {
            return Err(AppError::ProfileExists(profile.name.clone()));
        }

        profile.id = id.to_string();
        profile.created_at = existing_profile.created_at;
        profile.is_default = self.data.active_profile_id.as_deref() == Some(id);
        profile.updated_at = Some(chrono::Utc::now());

        // Keep previous secret if the edit payload omitted it.
        match (
            &hydrated_existing_profile.credential_type,
            &mut profile.credential_type,
        ) {
            (
                CredentialType::Manual {
                    secret_access_key: old_secret,
                    ..
                },
                CredentialType::Manual {
                    secret_access_key, ..
                },
            ) if secret_access_key.is_empty() => {
                *secret_access_key = old_secret.clone();
            }
            (
                CredentialType::CustomEndpoint {
                    secret_access_key: old_secret,
                    ..
                },
                CredentialType::CustomEndpoint {
                    secret_access_key, ..
                },
            ) if secret_access_key.is_empty() => {
                *secret_access_key = old_secret.clone();
            }
            (
                CredentialType::Manual {
                    secret_access_key: old_secret,
                    ..
                },
                CredentialType::CustomEndpoint {
                    secret_access_key, ..
                },
            ) if secret_access_key.is_empty() && !old_secret.is_empty() => {
                *secret_access_key = old_secret.clone();
            }
            (
                CredentialType::CustomEndpoint {
                    secret_access_key: old_secret,
                    ..
                },
                CredentialType::Manual {
                    secret_access_key, ..
                },
            ) if secret_access_key.is_empty() && !old_secret.is_empty() => {
                *secret_access_key = old_secret.clone();
            }
            _ => {}
        }

        if profile.session_token.is_none() {
            profile.session_token = hydrated_existing_profile.session_token;
        }
        let previous = self.data.clone();
        profile.secret_ref = Some(Uuid::new_v4().to_string());
        profile.has_session_token = matches!(
            profile.credential_type,
            CredentialType::CustomEndpoint { .. }
        ) && profile
            .session_token
            .as_deref()
            .is_some_and(|v| !v.is_empty());
        if !matches!(
            profile.credential_type,
            CredentialType::CustomEndpoint { .. }
        ) {
            profile.session_token = None;
        }
        self.store_secret(&profile)?;

        self.queue_secret_cleanup(&existing_profile);
        self.data.profiles.insert(id.to_string(), profile.clone());
        self.sync_default_flags();
        if let Err(error) = self.commit(previous) {
            self.remove_secret(&profile);
            return Err(error);
        }

        self.cleanup_pending_secrets();
        self.hydrate_profile(profile)
    }

    pub async fn delete_profile(&mut self, id: &str) -> Result<()> {
        let previous = self.data.clone();
        let profile = self
            .data
            .profiles
            .remove(id)
            .ok_or_else(|| AppError::ProfileNotFound(id.to_string()))?;

        self.queue_secret_cleanup(&profile);
        // If this was the active profile, clear it
        if self.data.active_profile_id.as_deref() == Some(id) {
            self.data.active_profile_id = self.data.profiles.keys().next().cloned();
        }

        self.sync_default_flags();

        self.commit(previous)?;
        self.cleanup_pending_secrets();
        Ok(())
    }

    pub async fn set_active_profile(&mut self, id: &str) -> Result<()> {
        if !self.data.profiles.contains_key(id) {
            return Err(AppError::ProfileNotFound(id.to_string()));
        }

        let previous = self.data.clone();
        self.data.active_profile_id = Some(id.to_string());
        self.sync_default_flags();
        self.commit(previous)?;
        Ok(())
    }

    pub async fn get_active_profile(&self) -> Result<Option<Profile>> {
        match &self.data.active_profile_id {
            Some(id) => {
                let profile = self.data.profiles.get(id).cloned();
                profile.map(|p| self.hydrate_profile(p)).transpose()
            }
            None => Ok(None),
        }
    }

    /// Get a profile and populate its secret from the keychain if applicable
    pub fn hydrate_profile(&self, mut profile: Profile) -> Result<Profile> {
        let stored = self
            .data
            .profiles
            .get(&profile.id)
            .unwrap_or(&profile)
            .clone();
        if let Some(secret) = self.load_secret(&stored).ok().flatten() {
            match &mut profile.credential_type {
                CredentialType::Manual {
                    secret_access_key, ..
                } => {
                    if secret_access_key.is_empty() {
                        *secret_access_key = secret;
                    }
                }
                CredentialType::CustomEndpoint {
                    secret_access_key, ..
                } => {
                    if secret_access_key.is_empty() {
                        *secret_access_key = secret;
                    }
                }
                _ => {}
            }
        }
        if matches!(
            profile.credential_type,
            CredentialType::CustomEndpoint { .. }
        ) && profile.session_token.is_none()
            && stored.has_session_token
        {
            profile.session_token = Some(self.keychain.get(&format!("{}:session", stored.secret_ref.as_deref().unwrap_or(&stored.id)))
                .map_err(|_| AppError::InvalidCredentials("The saved session token could not be read. Enter it again or clear it.".into()))?);
        }
        Ok(profile)
    }

    fn store_secret(&self, profile: &Profile) -> Result<()> {
        match &profile.credential_type {
            CredentialType::Manual {
                secret_access_key, ..
            }
            | CredentialType::CustomEndpoint {
                secret_access_key, ..
            } => {
                if secret_access_key.is_empty() {
                    return Err(AppError::InvalidCredentials(
                        "Enter a secret access key; the stored secret could not be read.".into(),
                    ));
                }
                self.keychain.store(
                    profile.secret_ref.as_deref().unwrap_or(&profile.id),
                    secret_access_key,
                )?;
                if matches!(
                    profile.credential_type,
                    CredentialType::CustomEndpoint { .. }
                ) {
                    if let Some(token) = profile.session_token.as_deref().filter(|v| !v.is_empty())
                    {
                        if let Err(error) = self.keychain.store(
                            &format!(
                                "{}:session",
                                profile.secret_ref.as_deref().unwrap_or(&profile.id)
                            ),
                            token,
                        ) {
                            self.remove_secret(profile);
                            return Err(error);
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    fn queue_secret_cleanup(&mut self, profile: &Profile) {
        if matches!(
            profile.credential_type,
            CredentialType::Manual { .. } | CredentialType::CustomEndpoint { .. }
        ) {
            self.data.pending_secret_deletions.push(format!(
                "{}:session",
                profile.secret_ref.as_deref().unwrap_or(&profile.id)
            ));
            self.data.pending_secret_deletions.push(
                profile
                    .secret_ref
                    .clone()
                    .unwrap_or_else(|| profile.id.clone()),
            );
        }
    }

    fn cleanup_pending_secrets(&mut self) {
        if self.data.pending_secret_deletions.is_empty() {
            return;
        }
        self.data.pending_secret_deletions.retain(|key| {
            if let Err(error) = self.keychain.delete(key) {
                log::error!("Secret cleanup pending; will retry on next startup: {error}");
                true
            } else {
                false
            }
        });
        if let Err(error) = self.save() {
            log::warn!("Could not persist secret cleanup progress: {error}");
        }
    }

    fn remove_secret(&self, profile: &Profile) {
        match &profile.credential_type {
            CredentialType::Manual { .. } | CredentialType::CustomEndpoint { .. } => {
                let _ = self.keychain.delete(&format!(
                    "{}:session",
                    profile.secret_ref.as_deref().unwrap_or(&profile.id)
                ));
                if let Err(error) = self
                    .keychain
                    .delete(profile.secret_ref.as_deref().unwrap_or(&profile.id))
                {
                    log::error!("Profile secret cleanup failed: {error}");
                }
            }
            _ => {}
        }
    }

    pub fn load_secret(&self, profile: &Profile) -> Result<Option<String>> {
        match &profile.credential_type {
            CredentialType::Manual { .. } | CredentialType::CustomEndpoint { .. } => Ok(self
                .keychain
                .get(profile.secret_ref.as_deref().unwrap_or(&profile.id))
                .ok()),
            _ => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{CredentialType, Profile, ProfileManager};
    use std::collections::HashMap;

    #[tokio::test]
    async fn session_tokens_follow_secret_storage_updates_rollback_and_deletion() {
        let dir = tempfile::tempdir().unwrap();
        let mut manager = ProfileManager::new(dir.path().to_path_buf(), true).unwrap();
        let mut profile = Profile::new(
            "temporary".into(),
            CredentialType::CustomEndpoint {
                endpoint_url: "https://obs.cn-north-4.myhuaweicloud.com".into(),
                access_key_id: "test".into(),
                secret_access_key: "secret".into(),
            },
            None,
        );
        profile.session_token = Some("private-token".into());
        let saved = manager.add_profile(profile).await.unwrap();
        let stored = std::fs::read_to_string(dir.path().join("profiles.json")).unwrap();
        assert!(!stored.contains("private-token"));
        assert!(!format!("{saved:?}").contains("private-token"));
        assert!(saved.has_session_token);
        assert!(!serde_json::to_string(&saved)
            .unwrap()
            .contains("private-token"));
        // Reopen to exercise actual storage, rather than hydrated in-memory values.
        let mut manager = ProfileManager::new(dir.path().to_path_buf(), true).unwrap();
        let mut edit = manager.get_profile(&saved.id).await.unwrap();
        assert_eq!(edit.session_token.as_deref(), Some("private-token"));
        edit.session_token = None;
        let preserved = manager.update_profile(&saved.id, edit).await.unwrap();
        assert_eq!(preserved.session_token.as_deref(), Some("private-token"));
        std::fs::rename(
            dir.path().join("profiles.json"),
            dir.path().join("saved.json"),
        )
        .unwrap();
        std::fs::create_dir(dir.path().join("profiles.json")).unwrap();
        let mut replacement = preserved.clone();
        replacement.session_token = Some("replacement-token".into());
        assert!(manager
            .update_profile(&saved.id, replacement)
            .await
            .is_err());
        let secrets = std::fs::read_to_string(dir.path().join("secrets.json")).unwrap();
        assert!(secrets.contains("private-token"));
        assert!(!secrets.contains("replacement-token"));
        std::fs::remove_dir(dir.path().join("profiles.json")).unwrap();
        std::fs::rename(
            dir.path().join("saved.json"),
            dir.path().join("profiles.json"),
        )
        .unwrap();
        let mut clear = preserved;
        clear.session_token = Some(String::new());
        manager.update_profile(&saved.id, clear).await.unwrap();
        assert!(
            !manager
                .get_profile(&saved.id)
                .await
                .unwrap()
                .has_session_token
        );
        assert!(manager
            .get_profile(&saved.id)
            .await
            .unwrap()
            .session_token
            .as_deref()
            .is_none_or(str::is_empty));
        manager.delete_profile(&saved.id).await.unwrap();
        assert!(manager.data.pending_secret_deletions.is_empty());
        let secrets: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(dir.path().join("secrets.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(secrets["secrets"].as_object().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn unreadable_session_token_fails_closed_and_explicit_clear_repairs_it() {
        let dir = tempfile::tempdir().unwrap();
        let mut manager = ProfileManager::new(dir.path().to_path_buf(), true).unwrap();
        let mut profile = Profile::new(
            "temporary".into(),
            CredentialType::CustomEndpoint {
                endpoint_url: "https://obs.cn-north-4.myhuaweicloud.com".into(),
                access_key_id: "test".into(),
                secret_access_key: "secret".into(),
            },
            None,
        );
        profile.session_token = Some("private-token".into());
        let saved = manager.add_profile(profile).await.unwrap();
        manager
            .keychain
            .delete(&format!("{}:session", saved.secret_ref.as_deref().unwrap()))
            .unwrap();
        let mut manager = ProfileManager::new(dir.path().to_path_buf(), true).unwrap();
        assert!(manager.get_profile(&saved.id).await.is_err());
        let mut edit = manager.list_profiles().await.unwrap().remove(0);
        assert!(manager
            .update_profile(&saved.id, edit.clone())
            .await
            .is_err());
        edit.session_token = Some(String::new());
        let repaired = manager.update_profile(&saved.id, edit).await.unwrap();
        assert!(!repaired.has_session_token);
        let mut temporary = repaired;
        temporary.session_token = Some("new-token".into());
        let saved = manager.update_profile(&saved.id, temporary).await.unwrap();
        manager
            .keychain
            .delete(&format!("{}:session", saved.secret_ref.as_deref().unwrap()))
            .unwrap();
        let mut manager = ProfileManager::new(dir.path().to_path_buf(), true).unwrap();
        let mut edit = manager.list_profiles().await.unwrap().remove(0);
        edit.credential_type = CredentialType::Manual {
            access_key_id: "test".into(),
            secret_access_key: String::new(),
        };
        let switched = manager.update_profile(&saved.id, edit).await.unwrap();
        assert!(!switched.has_session_token);
        assert!(switched.session_token.is_none());
    }

    #[test]
    fn provider_validation_rejects_mismatch_and_obs_http() {
        let mut profile = Profile::new(
            "test".into(),
            CredentialType::CustomEndpoint {
                endpoint_url: "http://obs.cn-north-4.myhuaweicloud.com".into(),
                access_key_id: "test".into(),
                secret_access_key: "secret".into(),
            },
            None,
        );
        assert!(profile.validate_connection().is_err());
        profile.credential_type = CredentialType::CustomEndpoint {
            endpoint_url: "HTTPS://obs.cn-north-4.myhuaweicloud.com".into(),
            access_key_id: "test".into(),
            secret_access_key: "secret".into(),
        };
        assert!(profile.validate_connection().is_ok());
        profile.provider = super::StorageProvider::Oss;
        assert!(profile.validate_connection().is_err());
    }

    #[tokio::test]
    async fn failed_metadata_commit_preserves_selection_profile_and_secret() {
        let dir = tempfile::tempdir().unwrap();
        let mut manager = ProfileManager::new(dir.path().to_path_buf(), true).unwrap();
        let first = manager
            .add_profile(Profile::new(
                "first".into(),
                CredentialType::Manual {
                    access_key_id: "key".into(),
                    secret_access_key: "original".into(),
                },
                None,
            ))
            .await
            .unwrap();
        let second = manager
            .add_profile(Profile::new(
                "second".into(),
                CredentialType::Environment,
                None,
            ))
            .await
            .unwrap();
        // A directory at the metadata filename deterministically fails atomic replacement.
        std::fs::rename(
            dir.path().join("profiles.json"),
            dir.path().join("saved.json"),
        )
        .unwrap();
        std::fs::create_dir(dir.path().join("profiles.json")).unwrap();
        assert!(manager.set_active_profile(&second.id).await.is_err());
        assert_eq!(
            manager.get_active_profile().await.unwrap().unwrap().id,
            first.id
        );
        let mut edited = first.clone();
        edited.name = "changed".into();
        edited.credential_type = CredentialType::Manual {
            access_key_id: "new-key".into(),
            secret_access_key: "new-secret".into(),
        };
        assert!(manager.update_profile(&first.id, edited).await.is_err());
        assert_eq!(manager.get_profile(&first.id).await.unwrap().name, "first");
        assert_eq!(
            manager.load_secret(&first).unwrap().as_deref(),
            Some("original")
        );
        assert!(manager.delete_profile(&first.id).await.is_err());
        assert!(manager.get_profile(&first.id).await.is_ok());
        assert_eq!(
            manager.load_secret(&first).unwrap().as_deref(),
            Some("original")
        );
        assert!(manager
            .add_profile(Profile::new(
                "third".into(),
                CredentialType::Environment,
                None
            ))
            .await
            .is_err());
        assert_eq!(manager.list_profiles().await.unwrap().len(), 2);
    }
    use std::path::PathBuf;

    fn temp_config_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("brows3-test-{}-{}", name, uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("temp config dir should be created");
        dir
    }

    #[test]
    fn legacy_profile_maps_keep_their_entries_and_ids() {
        let json = r#"{"legacy-id":{"name":"Legacy","credential_type":{"type":"Environment"},"region":"us-east-1","is_default":true}}"#;
        let data = ProfileManager::load_profiles_data(json).unwrap();
        assert_eq!(data.profiles.len(), 1);
        assert_eq!(data.profiles["legacy-id"].id, "legacy-id");
        assert_eq!(data.active_profile_id.as_deref(), Some("legacy-id"));
        assert!(ProfileManager::load_profiles_data(r#"{"unexpected":42}"#).is_err());
    }

    #[tokio::test]
    async fn malformed_profiles_are_backed_up_before_new_profiles_are_saved() {
        let directory = temp_config_dir("invalid-profile-backup");
        let original = "{incomplete";
        std::fs::write(directory.join(super::PROFILES_FILE), original).unwrap();
        let mut manager = ProfileManager::new(directory.clone(), true).unwrap();
        manager
            .add_profile(Profile::new(
                "New".into(),
                CredentialType::Environment,
                None,
            ))
            .await
            .unwrap();
        let backup = std::fs::read_dir(&directory)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .find(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("profiles.invalid-")
            })
            .unwrap();
        assert_eq!(std::fs::read_to_string(backup.path()).unwrap(), original);
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn manual_profile_deserializes_without_secret_in_json() {
        let json = r#"{
            "id": "manual-1",
            "name": "Manual",
            "credential_type": {
                "type": "Manual",
                "access_key_id": "AKIA123"
            },
            "region": "us-east-1",
            "is_default": true
        }"#;

        let profile: Profile = serde_json::from_str(json).expect("profile should deserialize");
        match profile.credential_type {
            CredentialType::Manual {
                access_key_id,
                secret_access_key,
            } => {
                assert_eq!(access_key_id, "AKIA123");
                assert!(secret_access_key.is_empty());
            }
            _ => panic!("expected manual credentials"),
        }
    }

    #[test]
    fn custom_endpoint_profile_deserializes_without_secret_in_json() {
        let json = r#"{
            "id": "custom-1",
            "name": "MinIO",
            "credential_type": {
                "type": "CustomEndpoint",
                "endpoint_url": "http://localhost:9000",
                "access_key_id": "minio"
            },
            "region": "us-east-1",
            "is_default": false
        }"#;

        let profile: Profile = serde_json::from_str(json).expect("profile should deserialize");
        match profile.credential_type {
            CredentialType::CustomEndpoint {
                endpoint_url,
                access_key_id,
                secret_access_key,
            } => {
                assert_eq!(endpoint_url, "http://localhost:9000");
                assert_eq!(access_key_id, "minio");
                assert!(secret_access_key.is_empty());
            }
            _ => panic!("expected custom endpoint credentials"),
        }
    }

    #[test]
    fn profiles_data_deserializes_without_active_profile_id() {
        let json = r#"{
            "profiles": {
                "profile-1": {
                    "id": "profile-1",
                    "name": "MinIO",
                    "credential_type": {
                        "type": "CustomEndpoint",
                        "endpoint_url": "http://localhost:9000",
                        "access_key_id": "minio"
                    },
                    "region": "us-east-1",
                    "is_default": true
                }
            }
        }"#;

        let data =
            ProfileManager::load_profiles_data(json).expect("profiles data should deserialize");
        assert_eq!(data.active_profile_id.as_deref(), Some("profile-1"));
        assert_eq!(data.profiles.len(), 1);
    }

    #[test]
    fn profiles_data_deserializes_from_legacy_array() {
        let json = r#"[
            {
                "id": "profile-1",
                "name": "Legacy",
                "credential_type": {
                    "type": "Manual",
                    "access_key_id": "AKIA123"
                },
                "region": "us-east-1",
                "is_default": false
            }
        ]"#;

        let data =
            ProfileManager::load_profiles_data(json).expect("legacy array should deserialize");
        assert_eq!(data.active_profile_id.as_deref(), Some("profile-1"));
        assert!(data.profiles.contains_key("profile-1"));
    }

    #[test]
    fn normalize_profiles_data_repairs_missing_ids_and_default_flag() {
        let mut profiles = HashMap::new();
        profiles.insert(
            "legacy-key".to_string(),
            Profile {
                provider: Default::default(),
                session_token: None,
                has_session_token: false,
                addressing_style: Default::default(),
                default_bucket: None,
                public_urls: Default::default(),
                secret_ref: None,
                id: String::new(),
                name: "Legacy".to_string(),
                credential_type: CredentialType::Environment,
                region: None,
                is_default: false,
                created_at: None,
                updated_at: None,
            },
        );

        let data = ProfileManager::normalize_profiles_data(super::ProfilesData {
            profiles,
            active_profile_id: None,
            pending_secret_deletions: Vec::new(),
        });

        assert_eq!(data.profiles.len(), 1);
        assert_eq!(data.active_profile_id.as_deref(), Some("legacy-key"));
        let profile = data
            .profiles
            .get("legacy-key")
            .expect("profile should exist");
        assert_eq!(profile.id, "legacy-key");
        assert!(profile.is_default);
    }

    #[tokio::test]
    async fn update_preserves_secret_when_switching_manual_to_custom_endpoint() {
        let config_dir = temp_config_dir("manual-to-custom");
        let mut manager = ProfileManager::new(config_dir, true).expect("manager should initialize");

        let created = manager
            .add_profile(Profile::new(
                "Manual".to_string(),
                CredentialType::Manual {
                    access_key_id: "access".to_string(),
                    secret_access_key: "secret".to_string(),
                },
                Some("us-east-1".to_string()),
            ))
            .await
            .expect("profile should be added");

        let updated = manager
            .update_profile(
                &created.id,
                Profile::new(
                    "Custom".to_string(),
                    CredentialType::CustomEndpoint {
                        endpoint_url: "https://example.com".to_string(),
                        access_key_id: "access".to_string(),
                        secret_access_key: String::new(),
                    },
                    Some("auto".to_string()),
                ),
            )
            .await
            .expect("profile should be updated");

        match updated.credential_type {
            CredentialType::CustomEndpoint {
                secret_access_key, ..
            } => assert_eq!(secret_access_key, "secret"),
            _ => panic!("expected custom endpoint credentials"),
        }
    }

    #[tokio::test]
    async fn update_preserves_secret_when_switching_custom_endpoint_to_manual() {
        let config_dir = temp_config_dir("custom-to-manual");
        let mut manager = ProfileManager::new(config_dir, true).expect("manager should initialize");

        let created = manager
            .add_profile(Profile::new(
                "Custom".to_string(),
                CredentialType::CustomEndpoint {
                    endpoint_url: "https://example.com".to_string(),
                    access_key_id: "access".to_string(),
                    secret_access_key: "secret".to_string(),
                },
                Some("auto".to_string()),
            ))
            .await
            .expect("profile should be added");

        let updated = manager
            .update_profile(
                &created.id,
                Profile::new(
                    "Manual".to_string(),
                    CredentialType::Manual {
                        access_key_id: "access".to_string(),
                        secret_access_key: String::new(),
                    },
                    Some("us-east-1".to_string()),
                ),
            )
            .await
            .expect("profile should be updated");

        match updated.credential_type {
            CredentialType::Manual {
                secret_access_key, ..
            } => assert_eq!(secret_access_key, "secret"),
            _ => panic!("expected manual credentials"),
        }
    }

    #[tokio::test]
    async fn update_removes_secret_when_leaving_keychain_backed_credentials() {
        let config_dir = temp_config_dir("leave-keychain");
        let mut manager = ProfileManager::new(config_dir, true).expect("manager should initialize");

        let created = manager
            .add_profile(Profile::new(
                "Manual".to_string(),
                CredentialType::Manual {
                    access_key_id: "access".to_string(),
                    secret_access_key: "secret".to_string(),
                },
                Some("us-east-1".to_string()),
            ))
            .await
            .expect("profile should be added");

        manager
            .update_profile(
                &created.id,
                Profile::new(
                    "Shared".to_string(),
                    CredentialType::SharedConfig {
                        profile_name: Some("default".to_string()),
                    },
                    Some("us-east-1".to_string()),
                ),
            )
            .await
            .expect("profile should be updated");

        let manual_again = manager
            .update_profile(
                &created.id,
                Profile::new(
                    "Manual Again".to_string(),
                    CredentialType::Manual {
                        access_key_id: "access".to_string(),
                        secret_access_key: String::new(),
                    },
                    Some("us-east-1".to_string()),
                ),
            )
            .await
            .expect_err("a removed secret must not be reused");

        assert!(manual_again
            .to_string()
            .contains("Enter a secret access key"));
        assert!(manager.load_secret(&created).unwrap().is_none());
    }
}

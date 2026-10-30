pub mod path;
pub mod range_reader;
pub mod zip;

use serde::{Deserialize, Serialize};

/// Upper bound on entries returned to the UI for one archive.
pub const MAX_ARCHIVE_ENTRIES: usize = 20_000;
/// Upper bound for a single entry preview returned to the UI.
pub const MAX_ENTRY_PREVIEW_BYTES: u64 = 10 * 1024 * 1024;
/// Text entries larger than this are extract-only.
pub const MAX_TEXT_ENTRY_PREVIEW_BYTES: u64 = 2 * 1024 * 1024;
/// Upper bound for one extracted entry.
pub const MAX_ZIP_ENTRY_UNCOMPRESSED: u64 = 2 * 1024 * 1024 * 1024;
/// Reject entries that expand more than this ratio once they are large.
pub const COMPRESSION_RATIO_LIMIT: u64 = 100;
pub const COMPRESSION_RATIO_SIZE_THRESHOLD: u64 = 100 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveEntry {
    /// Stable index in the ZIP central directory.
    pub id: usize,
    /// Normalized path used for display and navigation.
    pub path: String,
    /// Original path from the archive.
    pub raw_path: String,
    pub is_dir: bool,
    pub size: u64,
    pub compressed_size: u64,
    pub modified: Option<String>,
    pub method: String,
    pub encrypted: bool,
    pub is_symlink: bool,
    pub unsafe_path: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArchiveListing {
    pub format: String,
    pub entry_count: u64,
    pub total_uncompressed: u64,
    pub truncated: bool,
    pub entries: Vec<ArchiveEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArchiveEntryContent {
    pub path: String,
    pub size: u64,
    pub content_type: Option<String>,
    pub is_text: bool,
    pub text: Option<String>,
    pub data_base64: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractResult {
    pub path: String,
    pub bytes_written: u64,
}

pub fn ratio_is_suspicious(uncompressed: u64, compressed: u64) -> bool {
    uncompressed > COMPRESSION_RATIO_SIZE_THRESHOLD
        && compressed > 0
        && uncompressed / compressed > COMPRESSION_RATIO_LIMIT
}

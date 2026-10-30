use crate::archive::path::normalize_entry_path;
use crate::archive::{
    ratio_is_suspicious, ArchiveEntry, ArchiveEntryContent, ArchiveListing, ExtractResult,
    MAX_ARCHIVE_ENTRIES, MAX_ZIP_ENTRY_UNCOMPRESSED,
};
use crate::error::{AppError, Result};
use base64::Engine;
use std::fs::OpenOptions;
use std::io::{Read, Seek, Write};
use std::path::Path;
use zip::ZipArchive;

pub fn list<R: Read + Seek>(reader: R) -> Result<ArchiveListing> {
    let mut archive = ZipArchive::new(reader).map_err(map_zip_error)?;
    let entry_count = archive.len();
    let limit = entry_count.min(MAX_ARCHIVE_ENTRIES);
    let mut entries = Vec::with_capacity(limit);
    let mut total_uncompressed = 0u64;

    for id in 0..limit {
        let entry = archive.by_index_raw(id).map_err(map_zip_error)?;
        let raw_path = entry.name().to_string();
        let (path, safe) = normalize_entry_path(&raw_path);
        if path.is_empty() {
            continue;
        }
        let size = entry.size();
        total_uncompressed = total_uncompressed.saturating_add(size);
        entries.push(ArchiveEntry {
            id,
            path,
            raw_path,
            is_dir: entry.is_dir(),
            size,
            compressed_size: entry.compressed_size(),
            modified: entry.last_modified().map(|value| value.to_string()),
            method: method_label(entry.compression()),
            encrypted: entry.encrypted(),
            is_symlink: entry.is_symlink(),
            unsafe_path: !safe,
        });
    }

    Ok(ArchiveListing {
        format: "zip".to_string(),
        entry_count: entry_count as u64,
        total_uncompressed,
        truncated: entry_count > MAX_ARCHIVE_ENTRIES,
        entries,
    })
}

pub fn read_entry<R: Read + Seek>(
    reader: R,
    entry_id: usize,
    max_bytes: u64,
) -> Result<ArchiveEntryContent> {
    let mut archive = ZipArchive::new(reader).map_err(map_zip_error)?;
    let entry = archive.by_index(entry_id).map_err(map_zip_error)?;
    validate_entry_for_read(&entry)?;

    let raw_path = entry.name().to_string();
    let (path, safe) = normalize_entry_path(&raw_path);
    if !safe {
        return Err(AppError::ArchiveError(
            "This archive entry has an unsafe path and cannot be previewed.".to_string(),
        ));
    }

    let size = entry.size();
    if ratio_is_suspicious(size, entry.compressed_size()) {
        return Err(AppError::ArchiveError(
            "This archive entry expands too much to preview safely.".to_string(),
        ));
    }
    if size > max_bytes {
        return Err(AppError::ArchiveError(format!(
            "Entry is too large to preview ({:.2} MB; limit {:.1} MB). Extract it instead.",
            bytes_to_mb(size),
            bytes_to_mb(max_bytes)
        )));
    }

    let mut bytes = Vec::with_capacity(usize::try_from(size.min(max_bytes)).unwrap_or(0));
    entry
        .take(max_bytes.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|error| AppError::ArchiveError(error.to_string()))?;
    if bytes.len() as u64 > max_bytes {
        return Err(AppError::ArchiveError(
            "Entry is larger than its declared size and cannot be previewed.".to_string(),
        ));
    }

    let content_type = mime_guess::from_path(&path).first_raw().map(str::to_string);
    let is_image = content_type
        .as_deref()
        .is_some_and(|value| value.starts_with("image/"))
        || is_image_extension(&path);

    if is_image {
        return Ok(ArchiveEntryContent {
            path,
            size,
            content_type,
            is_text: false,
            text: None,
            data_base64: Some(
                base64::engine::general_purpose::STANDARD.encode(bytes),
            ),
        });
    }

    if is_probably_text(&bytes) {
        if let Ok(text) = String::from_utf8(bytes) {
            return Ok(ArchiveEntryContent {
                path,
                size,
                content_type,
                is_text: true,
                text: Some(text),
                data_base64: None,
            });
        }
    }

    Ok(ArchiveEntryContent {
        path,
        size,
        content_type,
        is_text: false,
        text: None,
        data_base64: None,
    })
}

pub fn extract_entry<R: Read + Seek>(
    reader: R,
    entry_id: usize,
    destination: &Path,
) -> Result<ExtractResult> {
    if destination.as_os_str().is_empty() {
        return Err(AppError::ArchiveError(
            "Choose a destination for the extracted entry.".to_string(),
        ));
    }
    if destination.is_dir() {
        return Err(AppError::ArchiveError(
            "The extraction destination is a folder.".to_string(),
        ));
    }

    let mut archive = ZipArchive::new(reader).map_err(map_zip_error)?;
    let mut entry = archive.by_index(entry_id).map_err(map_zip_error)?;
    validate_entry_for_read(&entry)?;

    let raw_path = entry.name().to_string();
    let (_, safe) = normalize_entry_path(&raw_path);
    if !safe {
        return Err(AppError::ArchiveError(
            "This archive entry has an unsafe path and cannot be extracted.".to_string(),
        ));
    }

    let size = entry.size();
    if size > MAX_ZIP_ENTRY_UNCOMPRESSED {
        return Err(AppError::ArchiveError(format!(
            "This entry is too large to extract ({:.2} GB; limit {:.1} GB).",
            bytes_to_gb(size),
            bytes_to_gb(MAX_ZIP_ENTRY_UNCOMPRESSED)
        )));
    }
    if ratio_is_suspicious(size, entry.compressed_size()) {
        return Err(AppError::ArchiveError(
            "This archive entry expands too much to extract safely.".to_string(),
        ));
    }

    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(|error| match error.kind() {
            std::io::ErrorKind::AlreadyExists => AppError::ArchiveError(
                "The destination already exists. Choose another path.".to_string(),
            ),
            _ => AppError::IoError(error.to_string()),
        })?;

    match std::io::copy(&mut entry, &mut file) {
        Ok(written) if written == size => {
            if let Err(error) = file.flush() {
                drop(file);
                let _ = std::fs::remove_file(destination);
                return Err(AppError::IoError(error.to_string()));
            }
            Ok(ExtractResult {
                path: destination.to_string_lossy().into_owned(),
                bytes_written: written,
            })
        }
        Ok(written) => {
            drop(file);
            let _ = std::fs::remove_file(destination);
            Err(AppError::ArchiveError(format!(
                "The extracted entry did not match its declared size ({written} of {size} bytes)."
            )))
        }
        Err(error) => {
            drop(file);
            let _ = std::fs::remove_file(destination);
            Err(AppError::IoError(error.to_string()))
        }
    }
}

fn validate_entry_for_read<T: Read>(entry: &zip::read::ZipFile<'_, T>) -> Result<()> {
    if entry.encrypted() {
        return Err(AppError::ArchiveError(
            "Encrypted ZIP entries cannot be opened in the app.".to_string(),
        ));
    }
    if entry.is_dir() {
        return Err(AppError::ArchiveError(
            "This archive entry is a folder.".to_string(),
        ));
    }
    if entry.is_symlink() {
        return Err(AppError::ArchiveError(
            "Symbolic link entries cannot be opened in the app.".to_string(),
        ));
    }
    Ok(())
}

fn method_label(method: zip::CompressionMethod) -> String {
    match method {
        zip::CompressionMethod::Stored => "Stored".to_string(),
        zip::CompressionMethod::Deflated => "Deflate".to_string(),
        other => format!("Unsupported ({other:?})"),
    }
}

fn is_image_extension(path: &str) -> bool {
    let extension = path
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(
        extension.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "ico" | "svg" | "avif"
    )
}

fn is_probably_text(bytes: &[u8]) -> bool {
    if bytes.is_empty() {
        return true;
    }

    let mut control_count = 0usize;
    for &byte in bytes {
        if byte == 0 {
            return false;
        }
        if byte < 0x20 && !matches!(byte, b'\n' | b'\r' | b'\t' | 0x0c) {
            control_count += 1;
        }
    }
    control_count.saturating_mul(100) <= bytes.len().saturating_mul(5)
}

fn map_zip_error(error: zip::result::ZipError) -> AppError {
    match error {
        zip::result::ZipError::Io(io) => AppError::IoError(io.to_string()),
        other => AppError::ArchiveError(format!("Could not read the ZIP archive: {other}")),
    }
}

fn bytes_to_mb(bytes: u64) -> f64 {
    bytes as f64 / 1024.0 / 1024.0
}

fn bytes_to_gb(bytes: u64) -> f64 {
    bytes as f64 / 1024.0 / 1024.0 / 1024.0
}

#[cfg(test)]
mod tests {
    use super::{extract_entry, list, read_entry};
    use crate::archive::ratio_is_suspicious;
    use crate::error::AppError;
    use std::io::{Cursor, Write};
    use std::path::PathBuf;

    fn build_zip() -> Vec<u8> {
        let mut cursor = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut cursor);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            writer.start_file("hello.txt", options).unwrap();
            writer.write_all(b"hello world").unwrap();
            writer.add_directory("nested/", zip::write::SimpleFileOptions::default()).unwrap();
            writer.start_file("nested/data.json", options).unwrap();
            writer.write_all(b"{\"ok\":true}").unwrap();
            writer.start_file("pixel.png", options).unwrap();
            writer.write_all(b"not-a-real-png").unwrap();
            writer.start_file("../evil.txt", options).unwrap();
            writer.write_all(b"evil").unwrap();
            writer.finish().unwrap();
        }
        cursor.into_inner()
    }

    fn entry_id(zip: &[u8], path: &str) -> usize {
        list(Cursor::new(zip))
            .unwrap()
            .entries
            .into_iter()
            .find(|entry| entry.path == path)
            .expect("entry should exist")
            .id
    }

    #[test]
    fn lists_entries_and_marks_unsafe_paths() {
        let zip = build_zip();
        let listing = list(Cursor::new(zip)).unwrap();
        assert_eq!(listing.format, "zip");
        assert_eq!(listing.entry_count, 5);
        assert!(!listing.truncated);
        assert!(listing.entries.iter().any(|entry| entry.path == "hello.txt"));
        assert!(listing
            .entries
            .iter()
            .any(|entry| entry.path == "nested/data.json" && entry.method == "Deflate"));
        let unsafe_entry = listing
            .entries
            .iter()
            .find(|entry| entry.path == "../evil.txt")
            .expect("unsafe entry should be listed");
        assert!(unsafe_entry.unsafe_path);
    }

    #[test]
    fn reads_text_and_image_entries() {
        let zip = build_zip();
        let text = read_entry(Cursor::new(&zip), entry_id(&zip, "hello.txt"), 1024).unwrap();
        assert!(text.is_text);
        assert_eq!(text.text.as_deref(), Some("hello world"));

        let image = read_entry(Cursor::new(&zip), entry_id(&zip, "pixel.png"), 1024).unwrap();
        assert!(!image.is_text);
        assert!(image.data_base64.is_some());
    }

    #[test]
    fn rejects_unsafe_entries() {
        let zip = build_zip();
        let error = read_entry(Cursor::new(&zip), entry_id(&zip, "../evil.txt"), 1024).unwrap_err();
        assert!(matches!(error, AppError::ArchiveError(_)));
    }

    #[test]
    fn extracts_to_a_new_file_and_refuses_overwrite() {
        let zip = build_zip();
        let directory = tempfile::tempdir().unwrap();
        let destination = PathBuf::from(directory.path()).join("hello.txt");
        let result = extract_entry(Cursor::new(&zip), entry_id(&zip, "hello.txt"), &destination)
            .unwrap();
        assert_eq!(result.bytes_written, 11);
        assert_eq!(std::fs::read(&destination).unwrap(), b"hello world");

        let error = extract_entry(Cursor::new(&zip), entry_id(&zip, "hello.txt"), &destination)
            .unwrap_err();
        assert!(matches!(error, AppError::ArchiveError(_)));
    }

    #[test]
    fn detects_suspicious_compression_ratios() {
        assert!(ratio_is_suspicious(200 * 1024 * 1024, 1024 * 1024));
        assert!(!ratio_is_suspicious(50 * 1024 * 1024, 1024 * 1024));
    }
}

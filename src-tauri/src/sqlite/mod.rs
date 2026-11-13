//! Read-only SQLite preview.
//!
//! Detection uses the `SQLite format 3` header, never the object name, so
//! extensionless files such as `toolDB` follow the same path as `.db`,
//! `.sqlite`, and `.sqlite3`. The bytes are copied to a private temporary
//! file and opened with `mode=ro&immutable=1` plus `PRAGMA query_only`. The
//! source buffer is never opened in place, so preview cannot journal, migrate,
//! or vacuum it.

use crate::error::{AppError, Result};
use rusqlite::{types::ValueRef, Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};

/// Official SQLite header, including the trailing NUL. 16 bytes.
pub const SQLITE_MAGIC: &[u8] = b"SQLite format 3\0";
/// Databases smaller than a header page cannot be queried.
const MIN_SQLITE_BYTES: usize = 100;
/// Whole-file cap. SQLite preview reads the object once into memory.
pub const MAX_SQLITE_PREVIEW_BYTES: u64 = 64 * 1024 * 1024;
const MAX_TABLES: usize = 500;
const MAX_CELL_CHARS: usize = 1_000;
const DEFAULT_PAGE_LIMIT: u32 = 100;
const MAX_PAGE_LIMIT: u32 = 500;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PreviewDecision {
    Sqlite,
    TooLarge,
    Fallback,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SqliteColumn {
    pub name: String,
    pub declared_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SqliteCell {
    pub kind: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SqliteTableSummary {
    pub name: String,
    pub kind: String,
    pub row_count: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SqliteCatalog {
    pub byte_size: u64,
    pub tables: Vec<SqliteTableSummary>,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SqliteTablePage {
    pub name: String,
    pub kind: String,
    pub columns: Vec<SqliteColumn>,
    pub rows: Vec<Vec<SqliteCell>>,
    pub total_rows: u64,
    pub offset: u64,
    pub limit: u32,
}

/// Header-only decision. `object_key` is accepted so callers can pass the S3
/// key through, and is intentionally ignored: a `toolDB` object and a
/// `.sqlite` object are decided the same way.
pub fn decide_preview(object_key: &str, header: &[u8], size: u64) -> PreviewDecision {
    let _ = object_key;
    if !header_is_sqlite(header) {
        return PreviewDecision::Fallback;
    }
    if size > MAX_SQLITE_PREVIEW_BYTES {
        return PreviewDecision::TooLarge;
    }
    PreviewDecision::Sqlite
}

pub fn header_is_sqlite(header: &[u8]) -> bool {
    header.len() >= SQLITE_MAGIC.len() && header.starts_with(SQLITE_MAGIC)
}

pub fn list_tables(bytes: &[u8]) -> Result<SqliteCatalog> {
    if (bytes.len() as u64) > MAX_SQLITE_PREVIEW_BYTES {
        return Err(too_large(bytes.len() as u64));
    }
    with_readonly(bytes, |conn| read_catalog(conn, bytes.len() as u64))
}

pub fn read_table(bytes: &[u8], table: &str, offset: u64, limit: u32) -> Result<SqliteTablePage> {
    if (bytes.len() as u64) > MAX_SQLITE_PREVIEW_BYTES {
        return Err(too_large(bytes.len() as u64));
    }
    let limit = normalize_limit(limit);
    with_readonly(bytes, |conn| read_page(conn, table, offset, limit))
}

fn normalize_limit(limit: u32) -> u32 {
    if limit == 0 {
        DEFAULT_PAGE_LIMIT
    } else {
        limit.min(MAX_PAGE_LIMIT)
    }
}

fn read_catalog(conn: &Connection, byte_size: u64) -> Result<SqliteCatalog> {
    let mut stmt = conn
        .prepare(
            "SELECT name, type FROM sqlite_schema \
             WHERE type IN ('table', 'view') \
               AND lower(name) NOT LIKE 'sqlite\\_%' ESCAPE '\\' \
             ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name COLLATE NOCASE",
        )
        .map_err(query_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(query_error)?;

    let mut tables = Vec::new();
    let mut truncated = false;
    for row in rows {
        let (name, kind) = row.map_err(query_error)?;
        if tables.len() >= MAX_TABLES {
            truncated = true;
            break;
        }
        let row_count = count_rows(conn, &name).ok();
        tables.push(SqliteTableSummary {
            name,
            kind,
            row_count,
        });
    }

    Ok(SqliteCatalog {
        byte_size,
        tables,
        truncated,
    })
}

fn read_page(
    conn: &Connection,
    requested: &str,
    offset: u64,
    limit: u32,
) -> Result<SqliteTablePage> {
    let (name, kind) = lookup_relation(conn, requested)?;
    let ident = quote_ident(&name);
    let total_rows = count_rows(conn, &name)?;
    let (columns, rows) = query_page(conn, &ident, limit, offset)?;
    Ok(SqliteTablePage {
        name,
        kind,
        columns,
        rows,
        total_rows,
        offset,
        limit,
    })
}

fn lookup_relation(conn: &Connection, requested: &str) -> Result<(String, String)> {
    if requested.is_empty() || requested.len() > 1024 || requested.as_bytes().contains(&0) {
        return Err(unavailable_table());
    }
    conn.query_row(
        "SELECT name, type FROM sqlite_schema \
         WHERE name = ?1 AND type IN ('table', 'view') \
           AND lower(name) NOT LIKE 'sqlite\\_%' ESCAPE '\\'",
        [requested],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    )
    .optional()
    .map_err(query_error)?
    .ok_or_else(unavailable_table)
}

fn count_rows(conn: &Connection, name: &str) -> Result<u64> {
    let sql = format!("SELECT COUNT(*) FROM {}", quote_ident(name));
    let count: i64 = conn
        .query_row(&sql, [], |row| row.get(0))
        .map_err(query_error)?;
    u64::try_from(count)
        .map_err(|_| AppError::SqliteError("This table has too many rows to preview.".to_string()))
}

fn query_page(
    conn: &Connection,
    ident: &str,
    limit: u32,
    offset: u64,
) -> Result<(Vec<SqliteColumn>, Vec<Vec<SqliteCell>>)> {
    let ordered = format!("SELECT * FROM {ident} ORDER BY rowid LIMIT ?1 OFFSET ?2");
    match collect_page(conn, &ordered, limit, offset) {
        Ok(page) => Ok(page),
        Err(_) => {
            let plain = format!("SELECT * FROM {ident} LIMIT ?1 OFFSET ?2");
            collect_page(conn, &plain, limit, offset)
        }
    }
}

fn collect_page(
    conn: &Connection,
    sql: &str,
    limit: u32,
    offset: u64,
) -> Result<(Vec<SqliteColumn>, Vec<Vec<SqliteCell>>)> {
    let mut stmt = conn.prepare(sql).map_err(query_error)?;
    let columns = stmt
        .columns()
        .into_iter()
        .map(|column| SqliteColumn {
            name: column.name().to_string(),
            declared_type: column.decl_type().map(str::to_string),
        })
        .collect::<Vec<_>>();
    let mut rows_iter = stmt
        .query(rusqlite::params![i64::from(limit), i64_offset(offset)?])
        .map_err(query_error)?;
    let mut rows = Vec::new();
    while let Some(row) = rows_iter.next().map_err(query_error)? {
        let mut cells = Vec::with_capacity(columns.len());
        for index in 0..columns.len() {
            let value = row.get_ref(index).map_err(query_error)?;
            cells.push(cell_from(value));
        }
        rows.push(cells);
    }
    Ok((columns, rows))
}

fn i64_offset(offset: u64) -> Result<i64> {
    i64::try_from(offset)
        .map_err(|_| AppError::SqliteError("That page is outside the preview range.".to_string()))
}

fn cell_from(value: ValueRef<'_>) -> SqliteCell {
    match value {
        ValueRef::Null => SqliteCell {
            kind: "null".to_string(),
            text: String::new(),
        },
        ValueRef::Integer(value) => SqliteCell {
            kind: "integer".to_string(),
            text: value.to_string(),
        },
        ValueRef::Real(value) => SqliteCell {
            kind: "real".to_string(),
            text: value.to_string(),
        },
        ValueRef::Text(bytes) => SqliteCell {
            kind: "text".to_string(),
            text: truncate_text(&String::from_utf8_lossy(bytes)),
        },
        ValueRef::Blob(bytes) => SqliteCell {
            kind: "blob".to_string(),
            text: bytes.len().to_string(),
        },
    }
}

fn truncate_text(text: &str) -> String {
    let mut truncated = String::new();
    for (index, ch) in text.chars().enumerate() {
        if index == MAX_CELL_CHARS {
            truncated.push('…');
            return truncated;
        }
        truncated.push(ch);
    }
    truncated
}

fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

fn with_readonly<T>(bytes: &[u8], body: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
    with_readonly_limited(bytes, MAX_SQLITE_PREVIEW_BYTES, body)
}

fn with_readonly_limited<T>(
    bytes: &[u8],
    limit: u64,
    body: impl FnOnce(&Connection) -> Result<T>,
) -> Result<T> {
    if (bytes.len() as u64) > limit {
        return Err(too_large(bytes.len() as u64));
    }
    ensure_openable(bytes)?;
    let mut copy = tempfile::NamedTempFile::new().map_err(|error| {
        AppError::SqliteError(format!(
            "Could not create a read-only database copy: {error}"
        ))
    })?;
    copy.write_all(bytes).map_err(io_error)?;
    copy.flush().map_err(io_error)?;
    set_readonly(&copy, true)?;

    let path = copy.path().to_path_buf();
    let opened = open_query_only(&path);
    let result = match opened {
        Ok(conn) => {
            let result = body(&conn);
            drop(conn);
            result
        }
        Err(error) => Err(error),
    };
    set_readonly(&copy, false)?;

    let after = std::fs::read(&path).map_err(io_error)?;
    if after != bytes {
        return Err(AppError::SqliteError(
            "Read-only preview modified its temporary copy.".to_string(),
        ));
    }
    for suffix in ["-journal", "-wal", "-shm"] {
        let sidecar = sidecar_path(&path, suffix);
        if sidecar.exists() {
            let _ = std::fs::remove_file(&sidecar);
            return Err(AppError::SqliteError(
                "Read-only preview tried to create a SQLite sidecar file.".to_string(),
            ));
        }
    }
    result
}

fn open_query_only(path: &Path) -> Result<Connection> {
    let uri = sqlite_readonly_uri(path);
    let conn = Connection::open_with_flags(
        &uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|_| malformed())?;
    conn.pragma_update(None, "query_only", 1_i64)
        .map_err(|_| malformed())?;
    Ok(conn)
}

fn set_readonly(copy: &tempfile::NamedTempFile, readonly: bool) -> Result<()> {
    let mut permissions = copy.as_file().metadata().map_err(io_error)?.permissions();
    permissions.set_readonly(readonly);
    copy.as_file()
        .set_permissions(permissions)
        .map_err(io_error)?;
    Ok(())
}

fn ensure_openable(bytes: &[u8]) -> Result<()> {
    if (bytes.len() as u64) > MAX_SQLITE_PREVIEW_BYTES {
        return Err(too_large(bytes.len() as u64));
    }
    if !header_is_sqlite(bytes) {
        return Err(AppError::SqliteError(
            "This file is not a SQLite database.".to_string(),
        ));
    }
    if bytes.len() < MIN_SQLITE_BYTES {
        return Err(malformed());
    }
    Ok(())
}

fn sqlite_readonly_uri(path: &Path) -> String {
    let mut uri = String::from("file:");
    let normalized = path.to_string_lossy().replace('\\', "/");
    if let Some(rest) = normalized.strip_prefix("//") {
        uri.push_str("//");
        push_encoded(&mut uri, rest);
    } else if normalized.len() >= 3 && normalized.as_bytes().get(1) == Some(&b':') {
        uri.push_str("///");
        push_encoded(&mut uri, &normalized);
    } else {
        push_encoded(&mut uri, &normalized);
    }
    uri.push_str("?mode=ro&immutable=1");
    uri
}

fn push_encoded(uri: &mut String, text: &str) {
    for byte in text.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b':' | b'-' | b'.' | b'_' | b'~' => {
                uri.push(byte as char);
            }
            _ => uri.push_str(&format!("%{byte:02X}")),
        }
    }
}

fn sidecar_path(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(suffix);
    path.with_file_name(name)
}

fn too_large(size: u64) -> AppError {
    AppError::SqliteError(format!(
        "This SQLite database is too large to preview ({:.1} MB). Download it to inspect locally.",
        size as f64 / 1024.0 / 1024.0
    ))
}

fn malformed() -> AppError {
    AppError::SqliteError(
        "This SQLite database is truncated or malformed and cannot be previewed.".to_string(),
    )
}

fn unavailable_table() -> AppError {
    AppError::SqliteError("That table is not available to preview.".to_string())
}

fn query_error(error: rusqlite::Error) -> AppError {
    let message = error.to_string().to_lowercase();
    if message.contains("malformed")
        || message.contains("not a database")
        || message.contains("disk image")
    {
        malformed()
    } else {
        AppError::SqliteError("Could not read this SQLite database.".to_string())
    }
}

fn io_error(error: std::io::Error) -> AppError {
    AppError::SqliteError(format!("Could not read the SQLite preview copy: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{
        decide_preview, header_is_sqlite, list_tables, read_table, sqlite_readonly_uri,
        with_readonly, MAX_SQLITE_PREVIEW_BYTES, SQLITE_MAGIC,
    };
    use crate::error::AppError;
    use rusqlite::Connection;
    use std::path::Path;

    fn sample_tooldb() -> (tempfile::TempDir, Vec<u8>) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("toolDB");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE mill (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                diameter REAL,
                notes BLOB
            );
            INSERT INTO mill (name, diameter, notes) VALUES
                ('endmill', 10.0, NULL),
                ('ball', 6.5, X'0102'),
                ('face', NULL, NULL);
            CREATE TABLE drill (id INTEGER PRIMARY KEY, name TEXT);
            INSERT INTO drill (name) VALUES ('twist');
            CREATE VIEW mill_names AS SELECT name FROM mill;",
        )
        .unwrap();
        drop(conn);
        let bytes = std::fs::read(&path).unwrap();
        (dir, bytes)
    }

    #[test]
    fn magic_detection_ignores_names_including_extensionless_tooldb() {
        let (dir, bytes) = sample_tooldb();
        assert!(dir.path().join("toolDB").is_file());
        assert!(!dir.path().join("toolDB-wal").exists());
        assert!(header_is_sqlite(&bytes));
        assert_eq!(SQLITE_MAGIC.len(), 16);

        let header = &bytes[..SQLITE_MAGIC.len()];
        for name in [
            "toolDB",
            "nested/toolDB",
            "library.db",
            "library.sqlite",
            "library.sqlite3",
            "notes.txt",
        ] {
            assert_eq!(
                decide_preview(name, header, bytes.len() as u64),
                super::PreviewDecision::Sqlite,
                "{name}"
            );
        }

        assert_eq!(
            decide_preview("toolDB", b"hello tool library", 18),
            super::PreviewDecision::Fallback
        );
        assert_eq!(
            decide_preview("library.sqlite", b"not a database!!", 16),
            super::PreviewDecision::Fallback
        );
        assert_eq!(
            decide_preview("toolDB", b"SQLite format 3", 15),
            super::PreviewDecision::Fallback
        );
        assert_eq!(
            decide_preview("archive.zip", b"PK\x03\x04", 4),
            super::PreviewDecision::Fallback
        );
        assert_eq!(
            decide_preview("toolDB", header, MAX_SQLITE_PREVIEW_BYTES + 1),
            super::PreviewDecision::TooLarge
        );
    }

    #[test]
    fn lists_tables_and_pages_rows_from_a_tooldb_copy() {
        let (_dir, bytes) = sample_tooldb();
        let original = bytes.clone();
        let catalog = list_tables(&bytes).unwrap();
        assert_eq!(catalog.byte_size, bytes.len() as u64);
        assert!(!catalog.truncated);
        assert_eq!(
            catalog
                .tables
                .iter()
                .map(|table| (table.name.as_str(), table.kind.as_str(), table.row_count))
                .collect::<Vec<_>>(),
            vec![
                ("drill", "table", Some(1)),
                ("mill", "table", Some(3)),
                ("mill_names", "view", Some(3)),
            ]
        );
        assert!(catalog
            .tables
            .iter()
            .all(|table| !table.name.starts_with("sqlite_")));

        let first = read_table(&bytes, "mill", 0, 2).unwrap();
        assert_eq!(first.total_rows, 3);
        assert_eq!(first.offset, 0);
        assert_eq!(first.limit, 2);
        assert_eq!(first.rows.len(), 2);
        assert_eq!(first.columns[1].name, "name");
        assert_eq!(first.columns[1].declared_type.as_deref(), Some("TEXT"));
        assert_eq!(first.rows[0][1].kind, "text");
        assert_eq!(first.rows[0][1].text, "endmill");
        assert_eq!(first.rows[0][2].text, "10");
        assert_eq!(first.rows[1][1].text, "ball");
        assert_eq!(first.rows[1][2].kind, "real");
        assert_eq!(first.rows[1][3].kind, "blob");
        assert_eq!(first.rows[1][3].text, "2");

        let second = read_table(&bytes, "mill", 2, 2).unwrap();
        assert_eq!(second.rows.len(), 1);
        assert_eq!(second.rows[0][1].text, "face");
        assert_eq!(second.rows[0][2].kind, "null");
        assert_eq!(bytes, original);
    }

    #[test]
    fn rejects_non_sqlite_truncated_oversized_and_unsafe_names() {
        let text = b"hello world, this is plain text and not a database";
        let err = list_tables(text).unwrap_err();
        assert!(err.to_string().contains("not a SQLite database"));

        let mut truncated = SQLITE_MAGIC.to_vec();
        truncated.extend_from_slice(&[0; 20]);
        let err = list_tables(&truncated).unwrap_err();
        assert!(err.to_string().contains("truncated or malformed"));

        let (_dir, bytes) = sample_tooldb();
        let err = with_readonly(&bytes[..10], |_| Ok(())).unwrap_err();
        assert!(matches!(err, AppError::SqliteError(_)));

        let mut oversized = bytes.clone();
        // The production cap is the constant; this exercises the same comparison
        // with a limit below the sample so the test does not allocate 64 MiB.
        assert!(oversized.len() as u64 <= MAX_SQLITE_PREVIEW_BYTES);
        oversized.extend(std::iter::repeat(0_u8).take(8));
        let err = super::with_readonly_limited(&oversized, (bytes.len() as u64) + 1, |_| Ok(()))
            .unwrap_err();
        assert!(err.to_string().contains("too large"));

        let err = read_table(&bytes, "mill; DROP TABLE mill", 0, 10).unwrap_err();
        assert!(err.to_string().contains("not available"));
        let err = read_table(&bytes, "sqlite_schema", 0, 10).unwrap_err();
        assert!(err.to_string().contains("not available"));
    }

    #[test]
    fn quoted_table_names_round_trip_and_writes_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("library.sqlite");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE \"end mill\"\"s\" (id INTEGER PRIMARY KEY, name TEXT);
             INSERT INTO \"end mill\"\"s\" (name) VALUES ('ok');",
        )
        .unwrap();
        drop(conn);
        let bytes = std::fs::read(&path).unwrap();
        let before = std::fs::read(&path).unwrap();

        let page = read_table(&bytes, "end mill\"s", 0, 10).unwrap();
        assert_eq!(page.rows.len(), 1);
        assert_eq!(page.rows[0][1].text, "ok");

        let err = with_readonly(&bytes, |conn| {
            conn.execute("INSERT INTO \"end mill\"\"s\" (name) VALUES ('nope')", [])
                .map(|_| ())
                .map_err(|error| AppError::SqliteError(error.to_string()))
        })
        .unwrap_err();
        let message = err.to_string().to_lowercase();
        assert!(
            message.contains("readonly") || message.contains("read-only"),
            "{message}"
        );
        assert_eq!(std::fs::read(&path).unwrap(), before);
        assert!(!dir.path().join("library.sqlite-journal").exists());
        assert!(!dir.path().join("library.sqlite-wal").exists());
    }

    #[test]
    fn readonly_uri_keeps_query_separators_encoded() {
        let uri = sqlite_readonly_uri(Path::new("/tmp/tool db?.sqlite"));
        assert!(uri.starts_with("file:/tmp/tool%20db%3F.sqlite?mode=ro&immutable=1"));
        let windows = sqlite_readonly_uri(Path::new("C:\\libs\\toolDB"));
        assert!(windows.starts_with("file:///C:/libs/toolDB?mode=ro&immutable=1"));
    }
}

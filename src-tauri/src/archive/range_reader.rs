use crate::error::{AppError, Result};
use reqwest::blocking::Client;
use reqwest::header::{ETAG, RANGE};
use std::collections::VecDeque;
use std::io::{self, Read, Seek, SeekFrom};
use std::time::Duration;

const DEFAULT_CACHE_BYTES: usize = 16 * 1024 * 1024;
const MIN_CHUNK_SIZE: u64 = 4 * 1024;

/// A `Read + Seek` view over one object using HTTP range requests.
///
/// The archive parsers are synchronous, so this type bridges them to a
/// presigned S3 GET using `reqwest::blocking`. Callers run it inside
/// `spawn_blocking` and never on the async runtime thread.
pub struct S3RangeReader {
    client: Client,
    url: String,
    len: u64,
    pos: u64,
    chunk_size: u64,
    expected_etag: Option<String>,
    chunks: VecDeque<(u64, Vec<u8>)>,
    cached_bytes: usize,
    cache_limit: usize,
}

impl S3RangeReader {
    pub fn new(
        url: String,
        len: u64,
        chunk_size: u64,
        expected_etag: Option<String>,
    ) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|error| {
                AppError::ArchiveError(format!(
                    "Could not create the archive reader: {}",
                    error.without_url()
                ))
            })?;

        Ok(Self {
            client,
            url,
            len,
            pos: 0,
            chunk_size: chunk_size.max(MIN_CHUNK_SIZE),
            expected_etag,
            chunks: VecDeque::new(),
            cached_bytes: 0,
            cache_limit: DEFAULT_CACHE_BYTES,
        })
    }

    fn chunk_start(&self, position: u64) -> u64 {
        (position / self.chunk_size) * self.chunk_size
    }

    fn ensure_chunk(&mut self, start: u64) -> io::Result<()> {
        if self.chunks.iter().any(|(chunk, _)| *chunk == start) {
            return Ok(());
        }

        let bytes = self.fetch_chunk(start)?;
        self.cached_bytes = self.cached_bytes.saturating_add(bytes.len());
        self.chunks.push_back((start, bytes));
        while self.cached_bytes > self.cache_limit {
            let Some((_, oldest)) = self.chunks.pop_front() else {
                break;
            };
            self.cached_bytes = self.cached_bytes.saturating_sub(oldest.len());
        }
        Ok(())
    }

    fn fetch_chunk(&self, start: u64) -> io::Result<Vec<u8>> {
        let end = start
            .saturating_add(self.chunk_size)
            .min(self.len)
            .saturating_sub(1);
        let range = format!("bytes={start}-{end}");
        let response = self
            .client
            .get(&self.url)
            .header(RANGE, range)
            .send()
            .map_err(range_error)?;

        let status = response.status();
        if status == reqwest::StatusCode::OK && self.len > self.chunk_size {
            return Err(io::Error::other(
                "The storage server ignored the Range request for this archive.",
            ));
        }
        if !status.is_success() {
            return Err(io::Error::other(format!(
                "Range request failed with HTTP {}.",
                status.as_u16()
            )));
        }

        if let Some(expected) = &self.expected_etag {
            if let Some(actual) = response
                .headers()
                .get(ETAG)
                .and_then(|value| value.to_str().ok())
            {
                if normalize_etag(actual) != normalize_etag(expected) {
                    return Err(io::Error::other(
                        "The archive changed while it was being read.",
                    ));
                }
            }
        }

        let bytes = response.bytes().map_err(range_error)?.to_vec();
        if bytes.is_empty() {
            return Err(io::Error::other(
                "The storage server returned an empty range.",
            ));
        }
        Ok(bytes)
    }

    fn read_current_chunk(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        let start = self.chunk_start(self.pos);
        self.ensure_chunk(start)?;

        let index = self
            .chunks
            .iter()
            .position(|(chunk, _)| *chunk == start)
            .ok_or_else(|| io::Error::other("The archive chunk cache lost an entry."))?;
        let chunk = &self.chunks[index].1;
        let offset = (self.pos - start) as usize;
        if offset >= chunk.len() {
            return Ok(0);
        }
        let available = chunk.len() - offset;
        let count = available.min(buffer.len());
        buffer[..count].copy_from_slice(&chunk[offset..offset + count]);
        self.pos = self.pos.saturating_add(count as u64);
        Ok(count)
    }
}

impl Read for S3RangeReader {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        if buffer.is_empty() || self.pos >= self.len {
            return Ok(0);
        }
        self.read_current_chunk(buffer)
    }
}

impl Seek for S3RangeReader {
    fn seek(&mut self, position: SeekFrom) -> io::Result<u64> {
        let next = match position {
            SeekFrom::Start(value) => value as i128,
            SeekFrom::Current(value) => self.pos as i128 + value as i128,
            SeekFrom::End(value) => self.len as i128 + value as i128,
        };
        if next < 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Cannot seek before the start of the archive.",
            ));
        }
        self.pos = next as u64;
        Ok(self.pos)
    }
}

fn normalize_etag(value: &str) -> &str {
    value.trim().trim_matches('"')
}

fn range_error(error: reqwest::Error) -> io::Error {
    io::Error::other(format!(
        "Archive range request failed: {}",
        error.without_url()
    ))
}

#[cfg(test)]
mod tests {
    use super::{normalize_etag, S3RangeReader};

    #[test]
    fn normalizes_quoted_etags() {
        assert_eq!(normalize_etag("\"abc\""), "abc");
        assert_eq!(normalize_etag(" abc "), "abc");
    }

    #[tokio::test]
    async fn constructs_a_blocking_client_inside_the_worker_thread() {
        let result = tokio::task::spawn_blocking(|| {
            S3RangeReader::new("http://127.0.0.1:1/object".to_string(), 10, 1024, None)
        })
        .await
        .expect("blocking task should join");
        assert!(result.is_ok());
    }
}

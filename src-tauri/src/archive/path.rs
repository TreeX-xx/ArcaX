/// Normalize an archive entry path for display and mark whether it is safe to
/// extract. The normalized form keeps `..` segments so an unsafe entry is not
/// shown as a safe-looking file.
pub fn normalize_entry_path(raw: &str) -> (String, bool) {
    let replaced = raw.replace('\\', "/");
    let mut candidate = replaced.as_str();
    while let Some(rest) = candidate.strip_prefix("./") {
        candidate = rest;
    }

    let mut safe = true;
    if candidate.starts_with('/') {
        safe = false;
        candidate = candidate.trim_start_matches('/');
    }

    let bytes = candidate.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        safe = false;
    }

    let mut segments = Vec::new();
    for segment in candidate.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            safe = false;
        }
        if segment.contains('\0') {
            safe = false;
        }
        if segment.chars().any(|ch| ch.is_control()) {
            safe = false;
        }
        if segment
            .chars()
            .any(|ch| matches!(ch, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
        {
            safe = false;
        }
        if segment.ends_with('.') || segment.ends_with(' ') {
            safe = false;
        }
        if is_windows_reserved_name(segment) {
            safe = false;
        }
        segments.push(segment);
    }

    let normalized = segments.join("/");
    if normalized.is_empty() {
        safe = false;
    }
    (normalized, safe)
}

fn is_windows_reserved_name(segment: &str) -> bool {
    let stem = segment.split('.').next().unwrap_or("").trim();
    if stem.is_empty() {
        return false;
    }
    let upper = stem.to_ascii_uppercase();
    if matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL") {
        return true;
    }
    if let Some(suffix) = upper.strip_prefix("COM").or_else(|| upper.strip_prefix("LPT")) {
        return matches!(
            suffix,
            "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
        );
    }
    false
}

#[cfg(test)]
mod tests {
    use super::normalize_entry_path;

    #[test]
    fn keeps_normal_nested_paths() {
        assert_eq!(
            normalize_entry_path("nested/東京 report.txt"),
            ("nested/東京 report.txt".to_string(), true)
        );
        assert_eq!(
            normalize_entry_path("./a//b.txt"),
            ("a/b.txt".to_string(), true)
        );
    }

    #[test]
    fn rejects_traversal_absolute_and_reserved_paths() {
        for raw in [
            "../evil.txt",
            "a/../../evil.txt",
            "/absolute.txt",
            "C:\\temp\\evil.txt",
            "CON.txt",
            "folder/file ",
            "folder/file.",
            "folder/a:b.txt",
        ] {
            let (_, safe) = normalize_entry_path(raw);
            assert!(!safe, "{raw} should be unsafe");
        }
    }

    #[test]
    fn retains_unsafe_segments_for_display() {
        assert_eq!(
            normalize_entry_path("../evil.txt").0,
            "../evil.txt".to_string()
        );
    }
}

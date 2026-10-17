use std::collections::HashSet;
use std::ffi::{OsStr, OsString};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// Configuration options for scanning media directories safely.
#[derive(Debug, Clone)]
pub struct ScanOptions {
    /// Maximum directory traversal depth (0 = only the root directory).
    pub max_depth: usize,
    /// Whether to follow symbolic links.
    pub follow_symlinks: bool,
    /// Optional set of allowed lowercase file extensions without leading dot (e.g., "mp4", "mkv").
    pub allowed_extensions: Option<HashSet<OsString>>,
    /// Hard cap on scanned items to prevent infinite loops or runaway memory.
    pub max_items: usize,
    /// Whether to skip hidden files or folders starting with a dot or system artifacts.
    pub skip_system_files: bool,
}

impl Default for ScanOptions {
    fn default() -> Self {
        Self {
            max_depth: 30,
            follow_symlinks: true,
            allowed_extensions: None,
            max_items: 200_000,
            skip_system_files: true,
        }
    }
}

/// Represents a media item or folder discovered during file system scanning.
#[derive(Debug, Clone)]
pub struct DiscoveredMedia {
    /// Exact native path representation.
    pub path: PathBuf,
    /// Relative path from the scan root.
    pub relative_path: PathBuf,
    /// File or directory name as an OS string.
    pub file_name: OsString,
    /// Size in bytes (0 for directories).
    pub size_bytes: u64,
    /// Whether this entry is a directory.
    pub is_dir: bool,
}

/// Summary statistics of a scan operation.
#[derive(Debug, Default, Clone)]
pub struct ScanSummary {
    pub total_scanned: usize,
    pub files_found: usize,
    pub dirs_found: usize,
    pub permission_errors: usize,
    pub io_errors: usize,
}

/// Helper to check if an entry matches known system/garbage folders or files.
fn is_system_or_ignored(file_name: &OsStr) -> bool {
    // Lossy conversion is only used for checking against known ASCII ignore patterns
    let name_lossy = file_name.to_string_lossy();
    name_lossy.starts_with(".Spotlight-")
        || name_lossy.starts_with(".Trashes")
        || name_lossy.starts_with(".fseventsd")
        || name_lossy.starts_with(".DocumentRevisions-")
        || name_lossy.starts_with(".TemporaryItems")
        || name_lossy.starts_with("$RECYCLE.BIN")
        || name_lossy == "System Volume Information"
        || name_lossy == ".DS_Store"
        || name_lossy == "Thumbs.db"
}

/// Helper to check if file extension is within allowed set.
fn has_allowed_extension(path: &Path, allowed: &HashSet<OsString>) -> bool {
    match path.extension() {
        Some(ext) => {
            let lower = ext.to_string_lossy().to_lowercase();
            allowed.contains(OsStr::new(&lower))
        }
        None => false,
    }
}

/// Recursively scans a directory using native `std::fs::read_dir`, building paths with
/// `PathBuf` and `Path`, without premature UTF-8 string conversion or string interpolation.
pub fn scan_directory_recursive<P: AsRef<Path>>(
    root_path: P,
    options: &ScanOptions,
) -> Result<(Vec<DiscoveredMedia>, ScanSummary), io::Error> {
    let root = root_path.as_ref();
    let mut discovered = Vec::new();
    let mut summary = ScanSummary::default();

    if !root.exists() {
        eprintln!("[Scanner] Specified root path does not exist: {}", root.display());
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("Path does not exist: {}", root.display()),
        ));
    }

    let mut stack: Vec<(PathBuf, usize)> = vec![(root.to_path_buf(), 0)];

    while let Some((current_dir, depth)) = stack.pop() {
        if summary.total_scanned >= options.max_items {
            eprintln!(
                "[Scanner] Reached maximum items limit of {}. Halting scan at: {}",
                options.max_items,
                current_dir.display()
            );
            break;
        }

        let read_dir_result = match fs::read_dir(&current_dir) {
            Ok(rd) => rd,
            Err(err) => {
                if err.kind() == io::ErrorKind::PermissionDenied {
                    summary.permission_errors += 1;
                    eprintln!(
                        "[Scanner] [Permission Denied] Skipping inaccessible directory: {}",
                        current_dir.display()
                    );
                } else {
                    summary.io_errors += 1;
                    eprintln!(
                        "[Scanner] [IO Error] Failed to read directory {}: {}",
                        current_dir.display(),
                        err
                    );
                }
                continue;
            }
        };

        for entry_result in read_dir_result {
            if summary.total_scanned >= options.max_items {
                break;
            }

            let entry = match entry_result {
                Ok(e) => e,
                Err(err) => {
                    summary.io_errors += 1;
                    eprintln!("[Scanner] [Read Error] Failed reading entry: {}", err);
                    continue;
                }
            };

            // Safely get native path directly from DirEntry without UTF-8 conversion
            let entry_path = entry.path();
            let file_name = entry.file_name();

            // Ignore system or trash artifacts
            if options.skip_system_files && is_system_or_ignored(&file_name) {
                continue;
            }

            // Query metadata safely without following broken symlinks if configured
            let metadata = if options.follow_symlinks {
                match fs::metadata(&entry_path) {
                    Ok(m) => m,
                    Err(err) => {
                        // Might be a broken symlink or permission issue
                        if err.kind() == io::ErrorKind::PermissionDenied {
                            summary.permission_errors += 1;
                        } else {
                            summary.io_errors += 1;
                        }
                        eprintln!(
                            "[Scanner] Metadata retrieval error for {}: {}",
                            entry_path.display(),
                            err
                        );
                        continue;
                    }
                }
            } else {
                match fs::symlink_metadata(&entry_path) {
                    Ok(m) => m,
                    Err(err) => {
                        summary.io_errors += 1;
                        eprintln!(
                            "[Scanner] Symlink metadata error for {}: {}",
                            entry_path.display(),
                            err
                        );
                        continue;
                    }
                }
            };

            let is_dir = metadata.is_dir();
            let size_bytes = if is_dir { 0 } else { metadata.len() };

            // Compute relative path natively via Path::strip_prefix
            let relative_path = match entry_path.strip_prefix(root) {
                Ok(rel) => rel.to_path_buf(),
                Err(_) => entry_path.clone(),
            };

            summary.total_scanned += 1;

            if is_dir {
                summary.dirs_found += 1;
                discovered.push(DiscoveredMedia {
                    path: entry_path.clone(),
                    relative_path,
                    file_name: file_name.clone(),
                    size_bytes,
                    is_dir: true,
                });

                if depth < options.max_depth {
                    // Push directory onto stack using native PathBuf
                    stack.push((entry_path, depth + 1));
                }
            } else {
                // If extension filtering is enabled, check against allowed extensions
                if let Some(ref allowed) = options.allowed_extensions {
                    if !has_allowed_extension(&entry_path, allowed) {
                        continue;
                    }
                }

                summary.files_found += 1;
                discovered.push(DiscoveredMedia {
                    path: entry_path,
                    relative_path,
                    file_name,
                    size_bytes,
                    is_dir: false,
                });
            }
        }
    }

    Ok((discovered, summary))
}

/// Helper function to join path segments natively without string formatting.
/// Handles special characters, spaces, and brackets reliably.
pub fn join_media_path<P: AsRef<Path>, S: AsRef<Path>>(base: P, subpath: S) -> PathBuf {
    base.as_ref().join(subpath.as_ref())
}

/// Builds a candidate list of potential mount locations for a given share name natively.
pub fn get_candidate_mount_paths(share_name: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    // Standard Unix mounts built cleanly via Path::new and .join()
    candidates.push(Path::new("/Volumes").join(share_name));
    candidates.push(Path::new("/mnt").join(share_name));
    candidates.push(Path::new("/media").join(share_name));

    if let Ok(home) = std::env::var("HOME") {
        let mut home_path = PathBuf::from(home);
        home_path.push("media");
        home_path.push(share_name);
        candidates.push(home_path);
    }

    candidates
}

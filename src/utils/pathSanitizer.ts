/**
 * Path and filename sanitization utility for Samba (SMB/CIFS), macOS, Linux, and Windows filesystems.
 * Removes or replaces illegal filesystem characters (colons, quotes, question marks, asterisks, pipes, etc.)
 * that cause file writing or URL parameter parsing to fail silently.
 */

/**
 * Sanitizes a single file or folder name segment, replacing illegal characters:
 * - Colons (:) replaced with " - "
 * - Slash (/), Backslash (\), Pipe (|) replaced with "-"
 * - Question mark (?), Asterisk (*), Double quote ("), Angle brackets (< >) removed
 * - Trailing dots or spaces stripped (Windows/SMB incompatibility)
 */
export function sanitizeFilename(name: string): string {
  if (!name) return '';

  return name
    .trim()
    // Replace colon with spaced hyphen (e.g. "Dune: Part Two" -> "Dune - Part Two")
    .replace(/:/g, ' - ')
    // Replace internal slashes, backslashes, or pipes with hyphen
    .replace(/[\\/|]/g, '-')
    // Remove characters forbidden on SMB / Windows / macOS / Linux filesystems: < > " ? *
    .replace(/[<>"?*]/g, '')
    // Remove control characters (0-31)
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Collapse multiple spaces or multiple hyphens
    .replace(/\s{2,}/g, ' ')
    .replace(/-{2,}/g, '-')
    // Strip leading/trailing dots or spaces from the segment
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim();
}

/**
 * Sanitizes a full relative or absolute path for Samba shares.
 * Preserves directory structure while ensuring each path segment is safe.
 */
export function sanitizeSambaPath(rawPath: string): string {
  if (!rawPath) return '';

  // Standardize slashes to forward slashes
  const normalized = rawPath.replace(/\\/g, '/');
  
  // Split into segments
  const segments = normalized.split('/').filter(Boolean);
  
  // Sanitize each individual folder or file segment
  const sanitizedSegments = segments.map((seg) => sanitizeFilename(seg)).filter(Boolean);

  return sanitizedSegments.join('/');
}

/**
 * URL-encodes a Samba path safely for query strings or API params.
 */
export function encodeSambaPathForUrl(path: string): string {
  return encodeURIComponent(sanitizeSambaPath(path));
}

/**
 * Formats standard media artwork filename based on media type.
 */
export function getStandardArtworkFilenames(type: 'movie' | 'series' | 'album' = 'movie') {
  if (type === 'album') {
    return {
      poster: 'folder.jpg',
      fanart: 'fanart.jpg',
      nfo: 'album.nfo',
    };
  }
  if (type === 'series') {
    return {
      poster: 'poster.jpg',
      fanart: 'fanart.jpg',
      nfo: 'tvshow.nfo',
    };
  }
  return {
    poster: 'poster.jpg',
    fanart: 'fanart.jpg',
    nfo: 'movie.nfo',
  };
}

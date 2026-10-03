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

  let cleaned = name
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

  // Balance unclosed parenthesis e.g. "Stranger Things (2016" -> "Stranger Things (2016)"
  const openParen = (cleaned.match(/\(/g) || []).length;
  const closeParen = (cleaned.match(/\)/g) || []).length;
  if (openParen > closeParen) {
    cleaned = cleaned + ')'.repeat(openParen - closeParen);
  }

  const openBracket = (cleaned.match(/\[/g) || []).length;
  const closeBracket = (cleaned.match(/\]/g) || []).length;
  if (openBracket > closeBracket) {
    cleaned = cleaned + ']'.repeat(openBracket - closeBracket);
  }

  return cleaned;
}

/**
 * Sanitizes a full relative or absolute path for Samba shares.
 * Automatically normalizes slashes, handles UNC network prefixes (e.g. "//192.168.1.25/media/"),
 * strips Windows drive letters, and balances unclosed brackets on every segment.
 */
export function sanitizeSambaPath(rawPath: string, options?: { preserveAbsolutePrefix?: boolean }): string {
  if (!rawPath) return '';

  let normalized = rawPath.replace(/\\/g, '/');

  // Strip raw UNC host & share prefixes if present e.g. "//192.168.1.25/media/Series/..." -> "Series/..."
  // or "smb://192.168.1.25/media/Series/..." -> "Series/..."
  // Handles variable leading slashes: //, ///, \\\\, etc.
  const uncMatch = normalized.match(/^(?:smb:)?\/+([^\/]+)\/([^\/]+)(?:\/(.*))?$/i);
  if (uncMatch) {
    normalized = uncMatch[3] || '';
  }

  // Also strip leading /Volumes/<share>/ or /mnt/<share>/ or /media/<share>/ if extracting share relative path
  if (!options?.preserveAbsolutePrefix) {
    normalized = normalized.replace(/^\/?(?:Volumes|mnt|media)\/[^\/]+\/?/i, '');
    // Strip Windows drive letters e.g. "C:/" or "D:\"
    normalized = normalized.replace(/^[a-zA-Z]:\/?/, '');
  }

  // Split into segments
  const segments = normalized.split('/').filter(Boolean);
  
  // Sanitize each individual folder or file segment (balances parens/brackets, removes forbidden chars)
  const sanitizedSegments = segments.map((seg) => sanitizeFilename(seg)).filter(Boolean);

  const result = sanitizedSegments.join('/');

  if (options?.preserveAbsolutePrefix && rawPath.startsWith('/') && !result.startsWith('/')) {
    return `/${result}`;
  }

  return result;
}

export function encodeSambaPathForUrl(path: string): string {
  return encodeURIComponent(sanitizeSambaPath(path));
}

export interface PathDiagnosticReport {
  rawPath: string;
  sanitizedPath: string;
  hasDoubleSlash: boolean;
  hasMixedSlashes: boolean;
  hasUnclosedParens: boolean;
  issues: string[];
  isSuspicious: boolean;
}

/**
 * Explicitly takes a raw path string and runs it through a series of regex checks
 * to detect and report unescaped network prefixes like '//' or mixed slash directions.
 */
export function diagnoseSambaPath(rawPath: string): PathDiagnosticReport {
  const raw = rawPath || '';
  const issues: string[] = [];

  // 1. Check for double slash start
  const hasDoubleSlash = raw.startsWith('//') || raw.startsWith('\\\\');
  if (hasDoubleSlash) {
    issues.push('Path begins with a suspicious double slash (UNC network prefix or double root)');
  }

  // 2. Check for mixed slash directions
  const hasBackslash = raw.includes('\\');
  const hasForwardSlash = raw.includes('/');
  const hasMixedSlashes = hasBackslash && hasForwardSlash;
  if (hasMixedSlashes) {
    issues.push('Path contains mixed slash directions (both / and \\)');
  } else if (raw.includes('\\\\\\\\')) {
    issues.push('Path contains redundant consecutive backslashes');
  }

  // 3. Check for unescaped network prefixes / consecutive slashes
  const cleanNoProto = raw.replace(/^(?:smb|https?):/i, '');
  if (/\/{2,}/.test(cleanNoProto.replace(/^\/\//, ''))) {
    issues.push('Path contains redundant consecutive slashes (//)');
  }

  // 4. Check for unclosed parentheses
  const openParens = (raw.match(/\(/g) || []).length;
  const closeParens = (raw.match(/\)/g) || []).length;
  const hasUnclosedParens = openParens !== closeParens;
  if (hasUnclosedParens) {
    issues.push(`Unbalanced parentheses (${openParens} open vs ${closeParens} close)`);
  }

  const sanitizedPath = sanitizeSambaPath(raw);

  return {
    rawPath: raw,
    sanitizedPath,
    hasDoubleSlash,
    hasMixedSlashes,
    hasUnclosedParens,
    issues,
    isSuspicious: issues.length > 0 || hasDoubleSlash,
  };
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

export function isMalformedMediaSource(source: string): boolean {
  if (!source) return false;

  let pathname = source;
  try {
    const url = new URL(source);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      pathname = url.pathname;
    } else if (url.protocol === 'asset:' || url.protocol === 'tauri:') {
      pathname = url.pathname;
    }
  } catch {
    // A filesystem path can also contain an accidentally embedded URI.
  }

  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return true;
  }

  return /\/(?:asset|tauri):\/{1,2}/i.test(pathname) ||
    /\/Volumes\/[^/]+\/Volumes\//i.test(pathname) ||
    /\/localhost\/(?:https?:\/\/|\/Volumes\/)/i.test(pathname);
}

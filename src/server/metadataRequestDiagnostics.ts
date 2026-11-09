export type MetadataDiagnostic = { provider: string; outcome: string };

export async function fetchMetadataWithDiagnostics(
  url: string | URL,
  options: RequestInit,
  provider: string,
  diagnostics: MetadataDiagnostic[] | undefined,
  visibleParams: readonly string[],
): Promise<Response> {
  const target = new URL(url.toString());
  if (diagnostics) {
    const safe = new URL(target.origin + target.pathname);
    for (const [name, value] of target.searchParams) {
      if (visibleParams.includes(name)) safe.searchParams.append(name, value);
    }
    if (provider === 'OMDb' && target.searchParams.has('apikey')) {
      safe.searchParams.set('apikey', '[REDACTED]');
    }
    diagnostics.push({ provider, outcome: `Request: GET ${safe.toString()}` });
  }
  const start = Date.now();
  try {
    const response = await fetch(url, options);
    diagnostics?.push({ provider, outcome: `Response: HTTP ${response.status} in ${Date.now() - start}ms` });
    return response;
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
    diagnostics?.push({ provider, outcome: `Request ${timedOut ? 'timed out' : 'failed'} after ${Date.now() - start}ms` });
    throw error;
  }
}

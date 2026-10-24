import { MediaMetadata, MediaType } from '../types';

export interface CategorizeRequestPayload {
  name: string;
  type?: MediaType | 'all';
  year?: number;
  title?: string;
  query?: string;
}

export interface CategorizeResponse {
  success: boolean;
  source: string;
  data: MediaMetadata;
  error?: string;
  warning?: string;
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  timeoutMs?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 400,
  backoffFactor: 2,
  timeoutMs: 8000,
};

/**
 * Robust categorizer client with exponential backoff, detailed diagnostic logging,
 * and fail-safe fallback payload formatting.
 */
export async function categorizeMediaWithRetry(
  rawTitle: string,
  type: MediaType | 'all' = 'all',
  year?: number,
  options?: RetryOptions
): Promise<MediaMetadata | null> {
  const { maxRetries, initialDelayMs, backoffFactor, timeoutMs } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  // 1. Validation Check: Ensure 'name' is correctly populated as a non-empty string
  const cleanTitle = (typeof rawTitle === 'string' ? rawTitle : String(rawTitle || ''))
    .replace(/\s*\(\d{4}\).*$/, '')
    .trim();

  if (!cleanTitle || cleanTitle.length === 0) {
    console.warn('[Categorizer] ❌ Pre-flight validation failed: \'name\'/title field is empty or missing. Request aborted.');
    return null;
  }

  // 2. Validation Check: Ensure 'type' is correctly populated with an accepted media category
  const validTypes: Array<MediaType | 'all'> = ['movie', 'series', 'album', 'all'];
  let sanitizedType: MediaType | 'all' = 'all';
  const rawTypeLower = String(type || '').toLowerCase();
  if (rawTypeLower === 'movie' || rawTypeLower === 'series' || rawTypeLower === 'album') {
    sanitizedType = rawTypeLower as MediaType;
  } else if (rawTypeLower === 'music' || rawTypeLower === 'audio' || rawTypeLower === 'track') {
    sanitizedType = 'album';
  } else if (rawTypeLower === 'show' || rawTypeLower === 'tv' || rawTypeLower === 'anime') {
    sanitizedType = 'series';
  } else {
    sanitizedType = 'all';
  }

  if (type && type !== 'all' && !validTypes.includes(type as any)) {
    console.warn(`[Categorizer] ⚠️ Pre-flight validation warning: 'type' "${type}" normalized to "${sanitizedType}".`);
  }

  // Ensure robust payload adhering strictly to what /api/metadata/categorize expects
  const payload: CategorizeRequestPayload = {
    name: cleanTitle,
    title: cleanTitle,
    query: cleanTitle,
    type: sanitizedType !== 'all' ? sanitizedType : undefined,
    year: year && !isNaN(Number(year)) ? Number(year) : undefined,
  };

  console.log(`[Categorizer] 📋 Pre-flight validation passed for "${cleanTitle}". Payload:`, payload);

  const startTime = Date.now();
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const isRetry = attempt > 0;
    const attemptStart = Date.now();

    if (isRetry) {
      const delay = Math.min(6000, initialDelayMs * Math.pow(backoffFactor, attempt - 1)) + Math.floor(Math.random() * 150);
      console.log(`[Categorizer] ⏳ Retry attempt ${attempt}/${maxRetries} for "${cleanTitle}" after ${delay}ms backoff...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      console.log(`[Categorizer] 🌐 POST /api/metadata/categorize (Attempt ${attempt + 1}/${maxRetries + 1}):`, payload);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch('/api/metadata/categorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const attemptDuration = Date.now() - attemptStart;

      if (!res.ok) {
        let errorText = '';
        try {
          const errJson = await res.json();
          errorText = errJson.error || errJson.details || JSON.stringify(errJson);
        } catch {
          errorText = await res.text();
        }

        const isServerError = res.status >= 500;
        console.warn(
          `[Categorizer] ⚠️ Server returned HTTP ${res.status} for "${cleanTitle}" (${attemptDuration}ms). Error: ${errorText}`
        );

        lastError = new Error(`HTTP ${res.status}: ${errorText}`);

        // Only retry on server errors (500, 502, 503, 504) or rate limits (429)
        if (!isServerError && res.status !== 429) {
          console.warn(`[Categorizer] Non-retryable client status (${res.status}). Halting retries.`);
          break;
        }
        continue;
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.warn(`[Categorizer] ⚠️ Non-JSON response received from /api/metadata/categorize (${contentType})`);
        lastError = new Error(`Expected JSON but got ${contentType}`);
        continue;
      }

      const data: CategorizeResponse = await res.json();
      if (data && data.success && data.data) {
        console.log(
          `[Categorizer] ✅ Successfully categorized "${cleanTitle}" via source "${data.source}" in ${Date.now() - startTime}ms.`
        );
        return data.data;
      }

      console.warn(`[Categorizer] ⚠️ Response payload did not contain valid data:`, data);
      lastError = new Error('Invalid response structure');
    } catch (err: any) {
      const isAbort = err.name === 'AbortError';
      const errMsg = isAbort ? `Request timed out after ${timeoutMs}ms` : err.message || err;
      console.warn(`[Categorizer] ❌ Error during categorize attempt ${attempt + 1}: ${errMsg}`);
      lastError = err;
    }
  }

  console.error(
    `[Categorizer] 🚨 All ${maxRetries + 1} categorize attempts exhausted for "${cleanTitle}" (${Date.now() - startTime}ms). Last error:`,
    lastError
  );

  return null;
}

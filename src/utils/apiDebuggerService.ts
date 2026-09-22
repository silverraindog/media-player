/**
 * API Debugger & Network Interceptor Service
 * 
 * Captures all outbound HTTP requests and inbound responses across the entire application,
 * with specialized diagnostics for metadata queries (OMDb, TVMaze, TMDB, /api/metadata/*).
 * Accurately diagnoses 404 Not Found, 301/302 Redirects, HTML SPA Fallbacks (e.g. in Tauri),
 * and 500 Server Errors.
 */
import { localDbFallback } from './localDatabaseFallback';

export type ApiRequestCategory =
  | 'metadata-primary'    // OMDb API
  | 'metadata-secondary'  // TVMaze, TMDB, iTunes fallback
  | 'internal-api'        // /api/* routes
  | 'samba'               // /api/samba/* routes
  | 'asset'               // Images, posters, thumbnails
  | 'other';

export type ApiErrorType =
  | '404_not_found'
  | 'redirect_html_fallback'
  | 'server_error_5xx'
  | 'client_error_4xx'
  | 'api_rejected'
  | 'network_failure';

export interface ApiLogEntry {
  id: string;
  timestamp: string;
  startTime: number;
  durationMs: number;
  method: string;
  url: string;
  targetDomain: string;
  category: ApiRequestCategory;
  
  // Outbound Request Data
  requestHeaders: Record<string, string>;
  requestBody?: any;
  rawRequestBody?: string;

  // Inbound Response Data
  status: number;
  statusText: string;
  redirected: boolean;
  responseHeaders: Record<string, string>;
  responseBody?: any;
  rawResponseBody?: string;
  responseType: 'json' | 'html' | 'text' | 'image' | 'error';
  
  // Failure & Diagnostic Info
  isFailed: boolean;
  isMetadataRequest: boolean;
  errorType?: ApiErrorType;
  errorMessage?: string;
  queryTarget?: string; // e.g. "24"
  diagnosticNote?: string;
}

type Subscriber = (logs: ApiLogEntry[]) => void;

class ApiDebuggerStore {
  private logs: ApiLogEntry[] = [];
  private subscribers: Set<Subscriber> = new Set();
  private maxLogs: number = 200;
  private isInterceptorInstalled: boolean = false;
  private isCapturing: boolean = true;

  constructor() {
    this.installInterceptor();
  }

  public installInterceptor() {
    if (this.isInterceptorInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    this.isInterceptorInstalled = true;

    try {
      const originalFetch = window.fetch.bind(window);
      const self = this;

      const interceptedFetch: typeof window.fetch = async function (
        input: RequestInfo | URL,
        init?: RequestInit
      ): Promise<Response> {
        if (!self.isCapturing) {
          return originalFetch(input, init);
        }

        const startTime = performance.now();
        const id = Math.random().toString(36).substring(2, 9);
        const timestamp = new Date().toISOString();

        let modifiedInput = input;
        let url = '';
        if (typeof input === 'string') {
          url = input;
        } else if (input instanceof URL) {
          url = input.toString();
        } else if (input && typeof (input as Request).url === 'string') {
          url = (input as Request).url;
        }

        const isActualTauri = typeof window !== 'undefined' && (
          Boolean((window as any).__TAURI__) ||
          '__TAURI_IPC__' in window ||
          (((window as any).location?.origin || '').includes('tauri://'))
        );

        if (isActualTauri) {
          let urlForRewrite = '';
          if (typeof input === 'string') {
            urlForRewrite = input;
          } else if (input instanceof URL) {
            urlForRewrite = input.pathname + input.search;
          } else if (input && typeof (input as Request).url === 'string') {
            const reqUrl = (input as Request).url;
            if (reqUrl.startsWith('http://') || reqUrl.startsWith('https://')) {
              try {
                const parsed = new URL(reqUrl);
                urlForRewrite = parsed.pathname + parsed.search;
              } catch {
                urlForRewrite = reqUrl;
              }
            } else {
              urlForRewrite = reqUrl;
            }
          }

          if (urlForRewrite.startsWith('/api/')) {
            const rewrittenUrlStr = `http://127.0.0.1:3000${urlForRewrite}`;
            url = rewrittenUrlStr;
            if (typeof input === 'string') {
              modifiedInput = rewrittenUrlStr;
            } else if (input instanceof URL) {
              modifiedInput = new URL(rewrittenUrlStr);
            } else if (input) {
              try {
                modifiedInput = new Request(rewrittenUrlStr, input as Request);
              } catch {
                modifiedInput = rewrittenUrlStr;
              }
            }
          }
        }

        const method = (
          init?.method ||
          (typeof input === 'object' && input && 'method' in input
            ? (input as Request).method
            : 'GET')
        ).toUpperCase();

        // Extract Request Headers
        const requestHeaders: Record<string, string> = {};
        if (init?.headers) {
          if (init.headers instanceof Headers) {
            init.headers.forEach((v, k) => {
              requestHeaders[k.toLowerCase()] = v;
            });
          } else if (Array.isArray(init.headers)) {
            init.headers.forEach(([k, v]) => {
              requestHeaders[k.toLowerCase()] = v;
            });
          } else {
            Object.entries(init.headers).forEach(([k, v]) => {
              requestHeaders[k.toLowerCase()] = String(v);
            });
          }
        }

        // Extract Request Body
        let rawRequestBody = '';
        let parsedRequestBody: any = undefined;
        if (init?.body) {
          try {
            if (typeof init.body === 'string') {
              rawRequestBody = init.body;
              parsedRequestBody = JSON.parse(init.body);
            } else {
              rawRequestBody = '[Binary or FormData Body]';
            }
          } catch {
            rawRequestBody = String(init.body);
          }
        }

        // Determine category and query target
        const { category, isMetadataRequest, queryTarget } = self.categorizeRequest(
          url,
          method,
          parsedRequestBody || rawRequestBody
        );

        let response: Response;
        let durationMs = 0;

        try {
          response = await originalFetch(modifiedInput, init);
          durationMs = Math.round(performance.now() - startTime);
        } catch (err: any) {
          durationMs = Math.round(performance.now() - startTime);

          // If it's an internal DB endpoint (e.g. /api/db/history, /api/db/watchlist), fulfill from offline local storage fallback
          if (url.includes('/api/db/')) {
            const fallbackResponse = localDbFallback.handleDbRequestFallback(
              url,
              method,
              parsedRequestBody
            );
            if (fallbackResponse) {
              const fallbackLog: ApiLogEntry = {
                id,
                timestamp,
                startTime,
                durationMs,
                method,
                url,
                targetDomain: self.extractDomain(url),
                category,
                requestHeaders,
                requestBody: parsedRequestBody,
                rawRequestBody,
                status: 200,
                statusText: '200 OK (Offline Local Storage Fallback)',
                redirected: false,
                responseHeaders: { 'content-type': 'application/json' },
                responseBody: { fallback: true, source: 'local_storage' },
                rawResponseBody: '{"source":"local_storage_cache"}',
                responseType: 'json',
                isFailed: false,
                isMetadataRequest,
                queryTarget,
                diagnosticNote: `Backend connection unavailable or port refused on ${url}; seamlessly served from local offline cache.`,
              };
              self.addLog(fallbackLog);
              return fallbackResponse;
            }
          }

          // Network failure log
          const logEntry: ApiLogEntry = {
            id,
            timestamp,
            startTime,
            durationMs,
            method,
            url,
            targetDomain: self.extractDomain(url),
            category,
            requestHeaders,
            requestBody: parsedRequestBody,
            rawRequestBody,
            status: 0,
            statusText: 'Network Failure / Connection Refused',
            redirected: false,
            responseHeaders: {},
            responseBody: null,
            rawResponseBody: err?.message || 'Network connection failed',
            responseType: 'error',
            isFailed: true,
            isMetadataRequest,
            errorType: 'network_failure',
            errorMessage: err?.message || 'Network fetch failed',
            queryTarget,
            diagnosticNote: `The request to "${url}" could not be completed. The network connection was refused, dropped, or timed out.`,
          };

          self.addLog(logEntry);
          throw err;
        }

        // Parse Response asynchronously using clone so application continues without delay
        const responseClone = response.clone();
        const status = response.status;
        const statusText = response.statusText;
        const redirected = response.redirected;

        // Extract Response Headers
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((val, key) => {
          responseHeaders[key.toLowerCase()] = val;
        });

        // Process Clone
        self.processResponseClone({
          id,
          timestamp,
          startTime,
          durationMs,
          method,
          url,
          category,
          isMetadataRequest,
          queryTarget,
          requestHeaders,
          requestBody: parsedRequestBody,
          rawRequestBody,
          status,
          statusText,
          redirected,
          responseHeaders,
          responseClone,
        });

        return response;
      };

      // Try setting via Object.defineProperty to handle environments where window.fetch is getter-only
      try {
        Object.defineProperty(window, 'fetch', {
          value: interceptedFetch,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } catch {
        try {
          (window as any).fetch = interceptedFetch;
        } catch (e2) {
          console.warn('[ApiDebugger] fetch property is protected; interceptor skipped.', e2);
        }
      }
    } catch (outerErr) {
      console.warn('[ApiDebugger] Failed to initialize fetch interceptor:', outerErr);
    }
  }

  private async processResponseClone(context: {
    id: string;
    timestamp: string;
    startTime: number;
    durationMs: number;
    method: string;
    url: string;
    category: ApiRequestCategory;
    isMetadataRequest: boolean;
    queryTarget?: string;
    requestHeaders: Record<string, string>;
    requestBody: any;
    rawRequestBody: string;
    status: number;
    statusText: string;
    redirected: boolean;
    responseHeaders: Record<string, string>;
    responseClone: Response;
  }) {
    const {
      id,
      timestamp,
      startTime,
      durationMs,
      method,
      url,
      category,
      isMetadataRequest,
      queryTarget,
      requestHeaders,
      requestBody,
      rawRequestBody,
      status,
      statusText,
      redirected,
      responseHeaders,
      responseClone,
    } = context;

    let rawResponseBody = '';
    let parsedResponseBody: any = undefined;
    let responseType: 'json' | 'html' | 'text' | 'image' | 'error' = 'text';

    const contentType = responseHeaders['content-type'] || '';

    try {
      if (contentType.includes('image/')) {
        responseType = 'image';
        rawResponseBody = `[Image Binary: ${contentType}]`;
      } else {
        rawResponseBody = await responseClone.text();
        if (contentType.includes('application/json') || rawResponseBody.trim().startsWith('{') || rawResponseBody.trim().startsWith('[')) {
          try {
            parsedResponseBody = JSON.parse(rawResponseBody);
            responseType = 'json';
          } catch {
            responseType = 'text';
          }
        } else if (contentType.includes('text/html') || /<!doctype html>|<html/i.test(rawResponseBody)) {
          responseType = 'html';
        }
      }
    } catch (e: any) {
      rawResponseBody = `[Error reading response stream: ${e?.message}]`;
      responseType = 'error';
    }

    // Determine failure and diagnostic insights
    let isFailed = false;
    let errorType: ApiErrorType | undefined = undefined;
    let errorMessage: string | undefined = undefined;
    let diagnosticNote: string | undefined = undefined;

    // 1. Check HTTP Status
    if (status >= 500) {
      isFailed = true;
      errorType = 'server_error_5xx';
      errorMessage = `HTTP ${status}: Server Error`;
      diagnosticNote = `Server error returned by ${url}. Check backend logs or upstream provider.`;
    } else if (status === 404) {
      isFailed = true;
      errorType = '404_not_found';
      errorMessage = `HTTP 404: Not Found`;
      diagnosticNote = `The requested endpoint "${url}" was not found (404). Check route definitions or provider endpoints.`;
    } else if (status >= 400) {
      isFailed = true;
      errorType = 'client_error_4xx';
      errorMessage = `HTTP ${status}: Client Error (${statusText})`;
      diagnosticNote = `Client error ${status} returned for "${url}". Inspect request headers and parameters.`;
    }

    // 2. Check for HTML SPA Fallback on an API route (Common in Tauri / Vite preview when backend isn't mounted)
    if (status === 200 && responseType === 'html' && (url.includes('/api/') || url.includes('/metadata') || url.includes('omdb'))) {
      isFailed = true;
      errorType = 'redirect_html_fallback';
      errorMessage = `Redirect / SPA Fallback: Received HTML on API route`;
      diagnosticNote = `CRITICAL DESKTOP/SPA ISSUE: An API call to "${url}" returned an HTML document (index.html) instead of JSON. In desktop/Tauri environments, unhandled API paths fallback to the frontend single-page app router. The secondary metadata resolver must be engaged.`;
    }

    // 3. Check for OMDb API error response (e.g. { Response: "False", Error: "Movie not found!" })
    if (parsedResponseBody && typeof parsedResponseBody === 'object') {
      if (parsedResponseBody.Response === 'False') {
        isFailed = true;
        errorType = 'api_rejected';
        errorMessage = `OMDb Rejection: ${parsedResponseBody.Error || 'Unknown API rejection'}`;
        diagnosticNote = `OMDb API returned Response: "False" with message: "${parsedResponseBody.Error}". Primary metadata provider failed; engaging secondary provider (TVMaze / TMDB).`;
      } else if (parsedResponseBody.success === false && parsedResponseBody.error) {
        isFailed = true;
        errorType = 'api_rejected';
        errorMessage = String(parsedResponseBody.error);
        diagnosticNote = `API endpoint returned an error: "${parsedResponseBody.error}"`;
      } else if (status === 200 && parsedResponseBody.success) {
        if (url.includes('/api/db/history') && Array.isArray(parsedResponseBody.history)) {
          localDbFallback.syncWatchHistoryFromApi(parsedResponseBody.history);
        } else if (url.includes('/api/db/watchlist') && Array.isArray(parsedResponseBody.watchlist)) {
          localDbFallback.syncWatchlistFromApi(parsedResponseBody.watchlist);
        }
      }
    }

    const logEntry: ApiLogEntry = {
      id,
      timestamp,
      startTime,
      durationMs,
      method,
      url,
      targetDomain: this.extractDomain(url),
      category,
      requestHeaders,
      requestBody: parsedResponseBody,
      rawRequestBody: rawRequestBody.length > 3000 ? rawRequestBody.substring(0, 3000) + '... [truncated]' : rawRequestBody,
      status,
      statusText,
      redirected,
      responseHeaders,
      responseBody: parsedResponseBody,
      rawResponseBody: rawResponseBody.length > 5000 ? rawResponseBody.substring(0, 5000) + '... [truncated]' : rawResponseBody,
      responseType,
      isFailed,
      isMetadataRequest,
      errorType,
      errorMessage,
      queryTarget,
      diagnosticNote,
    };

    this.addLog(logEntry);
  }

  private categorizeRequest(url: string, method: string, bodyContent: any): {
    category: ApiRequestCategory;
    isMetadataRequest: boolean;
    queryTarget?: string;
  } {
    const lower = url.toLowerCase();
    let queryTarget: string | undefined = undefined;

    // Detect queryTarget from URL or Body
    try {
      if (url.includes('?')) {
        const params = new URLSearchParams(url.split('?')[1]);
        queryTarget = params.get('t') || params.get('q') || params.get('term') || params.get('title') || params.get('name') || undefined;
      }
      if (!queryTarget && bodyContent) {
        if (typeof bodyContent === 'object') {
          queryTarget = bodyContent.name || bodyContent.title || bodyContent.q || undefined;
        } else if (typeof bodyContent === 'string') {
          const match = bodyContent.match(/"(?:name|title|q)":\s*"([^"]+)"/);
          if (match) queryTarget = match[1];
        }
      }
    } catch {}

    if (lower.includes('omdbapi.com') || (lower.includes('/api/media/omdb') && !lower.includes('tvmaze'))) {
      return { category: 'metadata-primary', isMetadataRequest: true, queryTarget };
    }
    if (lower.includes('tvmaze.com') || lower.includes('themoviedb.org') || lower.includes('tmdb') || lower.includes('itunes.apple.com')) {
      return { category: 'metadata-secondary', isMetadataRequest: true, queryTarget };
    }
    if (lower.includes('/api/metadata/') || lower.includes('/api/media/fetch-art')) {
      return { category: 'metadata-primary', isMetadataRequest: true, queryTarget };
    }
    if (lower.includes('/api/samba/')) {
      return { category: 'samba', isMetadataRequest: false, queryTarget };
    }
    if (lower.includes('/api/')) {
      return { category: 'internal-api', isMetadataRequest: false, queryTarget };
    }
    if (/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(lower) || lower.includes('images.unsplash.com') || lower.includes('image-proxy')) {
      return { category: 'asset', isMetadataRequest: false, queryTarget };
    }

    return { category: 'other', isMetadataRequest: false, queryTarget };
  }

  private extractDomain(url: string): string {
    try {
      if (url.startsWith('/')) {
        return window.location.host;
      }
      const parsed = new URL(url);
      return parsed.host;
    } catch {
      return 'local';
    }
  }

  private addLog(entry: ApiLogEntry) {
    this.logs = [entry, ...this.logs.slice(0, this.maxLogs - 1)];
    this.notifySubscribers();
  }

  private notifySubscribers() {
    this.subscribers.forEach((fn) => {
      try {
        fn([...this.logs]);
      } catch (err) {
        console.error('API Debugger subscriber error:', err);
      }
    });
  }

  public subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    fn([...this.logs]);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  public getLogs(): ApiLogEntry[] {
    return [...this.logs];
  }

  public getFailedLogs(): ApiLogEntry[] {
    return this.logs.filter((l) => l.isFailed);
  }

  public clearLogs() {
    this.logs = [];
    this.notifySubscribers();
  }

  public setCapturing(active: boolean) {
    this.isCapturing = active;
  }

  public getIsCapturing(): boolean {
    return this.isCapturing;
  }

  public recordCustomLog(entry: Partial<ApiLogEntry>): ApiLogEntry {
    const fullEntry: ApiLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      startTime: performance.now(),
      durationMs: 0,
      method: 'TEST',
      url: 'diagnostic://internal',
      targetDomain: 'diagnostic',
      category: 'metadata-secondary',
      requestHeaders: {},
      status: 200,
      statusText: 'OK',
      redirected: false,
      responseHeaders: {},
      responseType: 'json',
      isFailed: false,
      isMetadataRequest: true,
      ...entry,
    };
    this.addLog(fullEntry);
    return fullEntry;
  }
}

// Global Singleton Instance
export const apiDebugger = new ApiDebuggerStore();

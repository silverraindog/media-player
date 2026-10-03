import { sanitizeSambaPath, diagnoseSambaPath, sanitizeFilename } from './pathSanitizer';

/**
 * Comprehensive unit tests for diagnoseSambaPath and sanitizeSambaPath.
 * Covers:
 * 1. Problematic '//192.168.1.25/media/Series' path prefix
 * 2. Mixed slash directions (e.g. backslashes and forward slashes)
 * 3. Trailing slash edge cases (e.g. '/Volumes/media/Series/')
 * 4. Unclosed parentheses and bracket balancing
 */
export function runPathSanitizerTests(): { passed: number; failed: number; results: Array<{ name: string; success: boolean; error?: string }> } {
  const tests = [
    {
      name: 'Sanitize UNC prefix with IP: //192.168.1.25/media/Series/Stranger Things (2016',
      fn: () => {
        const res = sanitizeSambaPath('//192.168.1.25/media/Series/Stranger Things (2016');
        if (res !== 'Series/Stranger Things (2016)') {
          throw new Error(`Expected 'Series/Stranger Things (2016)', got '${res}'`);
        }
      },
    },
    {
      name: 'Diagnose UNC prefix and double slash anomaly',
      fn: () => {
        const diag = diagnoseSambaPath('//192.168.1.25/media/Series');
        if (!diag.hasDoubleSlash || !diag.isSuspicious) {
          throw new Error(`Expected doubleSlash and suspicious flags to be true`);
        }
      },
    },
    {
      name: 'Sanitize mixed slash directions: Series\\Season 1/Episode 1\\video.mkv',
      fn: () => {
        const res = sanitizeSambaPath('Series\\Season 1/Episode 1\\video.mkv');
        if (res !== 'Series/Season 1/Episode 1/video.mkv') {
          throw new Error(`Expected 'Series/Season 1/Episode 1/video.mkv', got '${res}'`);
        }
      },
    },
    {
      name: 'Diagnose mixed slash directions',
      fn: () => {
        const diag = diagnoseSambaPath('Series\\Season 1/Episode 1');
        if (!diag.hasMixedSlashes) {
          throw new Error(`Expected hasMixedSlashes to be true for mixed slash inputs`);
        }
      },
    },
    {
      name: 'Sanitize trailing slash edge cases: /Volumes/media/Series/Movies/',
      fn: () => {
        const res = sanitizeSambaPath('/Volumes/media/Series/Movies/');
        if (res !== 'Series/Movies') {
          throw new Error(`Expected 'Series/Movies', got '${res}'`);
        }
      },
    },
    {
      name: 'Sanitize filename balancing unclosed parentheses and brackets',
      fn: () => {
        const res1 = sanitizeFilename('Stranger Things (2016');
        if (res1 !== 'Stranger Things (2016)') {
          throw new Error(`Expected 'Stranger Things (2016)', got '${res1}'`);
        }
        const res2 = sanitizeFilename('Inception [2010');
        if (res2 !== 'Inception [2010]') {
          throw new Error(`Expected 'Inception [2010]', got '${res2}'`);
        }
      },
    },
  ];

  let passed = 0;
  let failed = 0;
  const results: Array<{ name: string; success: boolean; error?: string }> = [];

  for (const t of tests) {
    try {
      t.fn();
      passed++;
      results.push({ name: t.name, success: true });
    } catch (err: any) {
      failed++;
      results.push({ name: t.name, success: false, error: err?.message || String(err) });
    }
  }

  console.log(`[PathSanitizerTests] Summary: ${passed} passed, ${failed} failed.`);
  return { passed, failed, results };
}

if (typeof window !== 'undefined') {
  (window as any).__runPathSanitizerTests = runPathSanitizerTests;
}

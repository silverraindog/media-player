import {
  sanitizeSambaPath,
  diagnoseSambaPath,
  sanitizeFilename,
  calculatePathCleanlinessScore,
} from './pathSanitizer';

/**
 * Unit test suite for diagnoseSambaPath, sanitizeSambaPath, sanitizeFilename, and calculatePathCleanlinessScore.
 * Covers:
 * 1. Multiple network slashes ('//', '///', '\\\\', '\\\\\\') & UNC prefixes (e.g. '//192.168.1.25/media/Series')
 * 2. Windows drive letters ('C:\\', 'D:/', 'E:\\Movies\\')
 * 3. Trailing slashes and leading/redundant slashes ('folder///', '/share/media/')
 * 4. Mixed slash directions ('Series\\Season 1/Episode 1\\video.mkv')
 * 5. Parenthesis and bracket balancing ('Stranger Things (2016', 'Show [2020')
 * 6. Path anomaly diagnosis & cleanliness score calculations
 */
export function runPathSanitizerTests(): {
  passed: number;
  failed: number;
  results: Array<{ name: string; success: boolean; error?: string }>;
} {
  const tests = [
    // 1. Multiple network slashes & UNC prefixes
    {
      name: 'Sanitize standard UNC prefix with IP: //192.168.1.25/media/Series/Stranger Things (2016',
      fn: () => {
        const res = sanitizeSambaPath('//192.168.1.25/media/Series/Stranger Things (2016');
        if (res !== 'Series/Stranger Things (2016)') {
          throw new Error(`Expected 'Series/Stranger Things (2016)', got '${res}'`);
        }
      },
    },
    {
      name: 'Sanitize multiple triple leading slashes: ///192.168.1.25/media/Series/Breaking Bad',
      fn: () => {
        const res = sanitizeSambaPath('///192.168.1.25/media/Series/Breaking Bad');
        if (res !== 'Series/Breaking Bad') {
          throw new Error(`Expected 'Series/Breaking Bad', got '${res}'`);
        }
      },
    },
    {
      name: 'Sanitize Windows double backslash UNC: \\\\192.168.1.25\\media\\Series\\Stranger Things (2016',
      fn: () => {
        const res = sanitizeSambaPath('\\\\192.168.1.25\\media\\Series\\Stranger Things (2016');
        if (res !== 'Series/Stranger Things (2016)') {
          throw new Error(`Expected 'Series/Stranger Things (2016)', got '${res}'`);
        }
      },
    },
    {
      name: 'Sanitize smb:// URI prefix with redundant slashes: smb://vault-server/media//Movies/Dune (2021)',
      fn: () => {
        const res = sanitizeSambaPath('smb://vault-server/media//Movies/Dune (2021)');
        if (res !== 'Movies/Dune (2021)') {
          throw new Error(`Expected 'Movies/Dune (2021)', got '${res}'`);
        }
      },
    },

    // 2. Windows drive letters
    {
      name: 'Sanitize Windows drive letter path with backslashes: C:\\Users\\Media\\Movies\\Inception',
      fn: () => {
        const res = sanitizeSambaPath('C:\\Users\\Media\\Movies\\Inception');
        if (res !== 'Users/Media/Movies/Inception') {
          throw new Error(`Expected 'Users/Media/Movies/Inception', got '${res}'`);
        }
      },
    },
    {
      name: 'Sanitize Windows drive letter path with forward slashes: D:/Media/Series/Westworld (2016',
      fn: () => {
        const res = sanitizeSambaPath('D:/Media/Series/Westworld (2016');
        if (res !== 'Media/Series/Westworld (2016)') {
          throw new Error(`Expected 'Media/Series/Westworld (2016)', got '${res}'`);
        }
      },
    },
    {
      name: 'Sanitize Windows drive root with trailing slash: E:\\',
      fn: () => {
        const res = sanitizeSambaPath('E:\\');
        if (res !== '') {
          throw new Error(`Expected empty string for drive root, got '${res}'`);
        }
      },
    },

    // 3. Trailing slashes and redundant consecutive slashes
    {
      name: 'Sanitize path with trailing slash: /Volumes/media/Series/Movies/',
      fn: () => {
        const res = sanitizeSambaPath('/Volumes/media/Series/Movies/');
        if (res !== 'Series/Movies') {
          throw new Error(`Expected 'Series/Movies', got '${res}'`);
        }
      },
    },
    {
      name: 'Sanitize path with multiple trailing slashes: //192.168.1.50/vault/Music/Pink Floyd///',
      fn: () => {
        const res = sanitizeSambaPath('//192.168.1.50/vault/Music/Pink Floyd///');
        if (res !== 'Music/Pink Floyd') {
          throw new Error(`Expected 'Music/Pink Floyd', got '${res}'`);
        }
      },
    },
    {
      name: 'Sanitize redundant internal slashes: Series///Season 1////Episode 01.mkv',
      fn: () => {
        const res = sanitizeSambaPath('Series///Season 1////Episode 01.mkv');
        if (res !== 'Series/Season 1/Episode 01.mkv') {
          throw new Error(`Expected 'Series/Season 1/Episode 01.mkv', got '${res}'`);
        }
      },
    },

    // 4. Mixed slash directions
    {
      name: 'Sanitize mixed forward and backward slashes: Series\\Season 1/Episode 1\\video.mkv',
      fn: () => {
        const res = sanitizeSambaPath('Series\\Season 1/Episode 1\\video.mkv');
        if (res !== 'Series/Season 1/Episode 1/video.mkv') {
          throw new Error(`Expected 'Series/Season 1/Episode 1/video.mkv', got '${res}'`);
        }
      },
    },
    {
      name: 'Sanitize mixed UNC with backslashes and forward slashes: //192.168.1.25\\media/Series\\Show',
      fn: () => {
        const res = sanitizeSambaPath('//192.168.1.25\\media/Series\\Show');
        if (res !== 'Series/Show') {
          throw new Error(`Expected 'Series/Show', got '${res}'`);
        }
      },
    },

    // 5. diagnoseSambaPath anomaly detection
    {
      name: 'diagnoseSambaPath detects multiple network slashes on //192.168.1.25/media/Series',
      fn: () => {
        const diag = diagnoseSambaPath('//192.168.1.25/media/Series');
        if (!diag.hasDoubleSlash || !diag.isSuspicious) {
          throw new Error('Expected hasDoubleSlash=true and isSuspicious=true');
        }
        if (!diag.issues.some((i) => i.includes('double slash'))) {
          throw new Error('Expected issue message regarding double slash');
        }
      },
    },
    {
      name: 'diagnoseSambaPath detects mixed slashes on Series\\Season 1/Episode 1',
      fn: () => {
        const diag = diagnoseSambaPath('Series\\Season 1/Episode 1');
        if (!diag.hasMixedSlashes || !diag.isSuspicious) {
          throw new Error('Expected hasMixedSlashes=true and isSuspicious=true');
        }
      },
    },
    {
      name: 'diagnoseSambaPath detects unclosed parentheses in Stranger Things (2016',
      fn: () => {
        const diag = diagnoseSambaPath('Series/Stranger Things (2016/Episode 1.mkv');
        if (!diag.hasUnclosedParens || !diag.isSuspicious) {
          throw new Error('Expected hasUnclosedParens=true');
        }
      },
    },
    {
      name: 'diagnoseSambaPath validates clean path with high cleanliness score',
      fn: () => {
        const diag = diagnoseSambaPath('Series/Stranger Things (2016)/Season 1/Episode 1.mkv');
        if (diag.hasDoubleSlash || diag.hasMixedSlashes || diag.hasUnclosedParens || diag.isSuspicious) {
          throw new Error(`Expected clean path to have no anomalies, got: ${JSON.stringify(diag)}`);
        }
        if (diag.cleanlinessScore < 90) {
          throw new Error(`Expected cleanlinessScore >= 90, got ${diag.cleanlinessScore}`);
        }
      },
    },

    // 6. Filename illegal characters & bracket balancing
    {
      name: 'Sanitize filename balancing unclosed parentheses and square brackets',
      fn: () => {
        const res1 = sanitizeFilename('Stranger Things (2016');
        if (res1 !== 'Stranger Things (2016)') {
          throw new Error(`Expected 'Stranger Things (2016)', got '${res1}'`);
        }
        const res2 = sanitizeFilename('Show [2024');
        if (res2 !== 'Show [2024]') {
          throw new Error(`Expected 'Show [2024]', got '${res2}'`);
        }
      },
    },
    {
      name: 'Sanitize filename replacing colon with spaced hyphen',
      fn: () => {
        const res = sanitizeFilename('Dune: Part Two (2024)');
        if (res !== 'Dune - Part Two (2024)') {
          throw new Error(`Expected 'Dune - Part Two (2024)', got '${res}'`);
        }
      },
    },
    {
      name: 'Sanitize filename removing illegal filesystem characters: < > " ? *',
      fn: () => {
        const res = sanitizeFilename('Movie<?>*"Special".mp4');
        if (res.includes('<') || res.includes('>') || res.includes('?') || res.includes('*') || res.includes('"')) {
          throw new Error(`Filename contains forbidden characters: '${res}'`);
        }
      },
    },

    // 7. Cleanliness score penalty calculations
    {
      name: 'calculatePathCleanlinessScore penalizes double slash and mixed slashes',
      fn: () => {
        const cleanScore = calculatePathCleanlinessScore('Series/Show/Episode.mkv');
        const dirtyScore = calculatePathCleanlinessScore('//192.168.1.25\\media/Series//Show (2024');
        if (cleanScore <= dirtyScore) {
          throw new Error(`Clean score (${cleanScore}) should be strictly greater than dirty score (${dirtyScore})`);
        }
        if (dirtyScore > 50) {
          throw new Error(`Dirty score should be <= 50, got ${dirtyScore}`);
        }
      },
    },
  ];

  let passed = 0;
  let failed = 0;
  const results: Array<{ name: string; success: boolean; error?: string }> = [];

  for (const test of tests) {
    try {
      test.fn();
      passed++;
      results.push({ name: test.name, success: true });
    } catch (err: any) {
      failed++;
      results.push({ name: test.name, success: false, error: err?.message || String(err) });
    }
  }

  return { passed, failed, results };
}

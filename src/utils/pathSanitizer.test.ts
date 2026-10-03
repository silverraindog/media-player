import {
  sanitizeSambaPath,
  diagnoseSambaPath,
  sanitizeFilename,
  calculatePathCleanlinessScore,
} from './pathSanitizer';

/**
 * Unit test suite for diagnoseSambaPath, sanitizeSambaPath, sanitizeFilename, and calculatePathCleanlinessScore.
 * Comprehensive test coverage for:
 * 1. Mixed-OS environment path resolution (macOS /Volumes/, Linux /mnt/ and /media/, Windows drives C:\, D:\)
 * 2. Scanner '//' prefix resolution (UNC IPv4, hostnames, FQDNs, redundant leading/internal slashes)
 * 3. Cross-platform delimiter normalizations (mixed '/' and '\', multi-slash concatenation during recursive scans)
 * 4. Trailing slash and path boundary normalization
 * 5. Parenthesis and bracket balancing across filesystem segments
 * 6. Anomaly diagnostics (diagnoseSambaPath) & character cleanliness scoring (calculatePathCleanlinessScore)
 */
export function runPathSanitizerTests(): {
  passed: number;
  failed: number;
  results: Array<{ name: string; success: boolean; error?: string }>;
} {
  const tests = [
    // ---------------------------------------------------------
    // 1. Scanner '//' Prefix Resolution in Mixed-OS Environments
    // ---------------------------------------------------------
    {
      name: 'Mixed-OS UNC: Sanitize IPv4 double slash prefix //192.168.1.25/media/Series/Stranger Things (2016',
      fn: () => {
        const res = sanitizeSambaPath('//192.168.1.25/media/Series/Stranger Things (2016');
        if (res !== 'Series/Stranger Things (2016)') {
          throw new Error(`Expected 'Series/Stranger Things (2016)', got '${res}'`);
        }
      },
    },
    {
      name: 'Mixed-OS UNC: Sanitize hostname double slash prefix //MEDIA-SERVER/media/Movies/Dune (2021)',
      fn: () => {
        const res = sanitizeSambaPath('//MEDIA-SERVER/media/Movies/Dune (2021)');
        if (res !== 'Movies/Dune (2021)') {
          throw new Error(`Expected 'Movies/Dune (2021)', got '${res}'`);
        }
      },
    },
    {
      name: 'Mixed-OS UNC: Sanitize FQDN double slash prefix //nas.local.lan/vault/Documentaries/Planet Earth',
      fn: () => {
        const res = sanitizeSambaPath('//nas.local.lan/vault/Documentaries/Planet Earth');
        if (res !== 'Documentaries/Planet Earth') {
          throw new Error(`Expected 'Documentaries/Planet Earth', got '${res}'`);
        }
      },
    },
    {
      name: 'Mixed-OS UNC: Sanitize triple leading slashes ///192.168.1.25/media/Series/Breaking Bad',
      fn: () => {
        const res = sanitizeSambaPath('///192.168.1.25/media/Series/Breaking Bad');
        if (res !== 'Series/Breaking Bad') {
          throw new Error(`Expected 'Series/Breaking Bad', got '${res}'`);
        }
      },
    },
    {
      name: 'Mixed-OS UNC: Sanitize Windows double backslash prefix \\\\192.168.1.25\\media\\Series\\Stranger Things (2016',
      fn: () => {
        const res = sanitizeSambaPath('\\\\192.168.1.25\\media\\Series\\Stranger Things (2016');
        if (res !== 'Series/Stranger Things (2016)') {
          throw new Error(`Expected 'Series/Stranger Things (2016)', got '${res}'`);
        }
      },
    },
    {
      name: 'Mixed-OS UNC: Sanitize smb:// protocol prefix smb://192.168.1.25/media/Anime/Attack on Titan',
      fn: () => {
        const res = sanitizeSambaPath('smb://192.168.1.25/media/Anime/Attack on Titan');
        if (res !== 'Anime/Attack on Titan') {
          throw new Error(`Expected 'Anime/Attack on Titan', got '${res}'`);
        }
      },
    },
    {
      name: 'Mixed-OS UNC: Handle recursive scan join creating double slashes //192.168.1.25/media//Series//Season 1',
      fn: () => {
        const res = sanitizeSambaPath('//192.168.1.25/media//Series//Season 1');
        if (res !== 'Series/Season 1') {
          throw new Error(`Expected 'Series/Season 1', got '${res}'`);
        }
      },
    },

    // ---------------------------------------------------------
    // 2. Mixed-OS Mount Paths (macOS /Volumes/, Linux /mnt/ & /media/)
    // ---------------------------------------------------------
    {
      name: 'macOS Mount: Strip /Volumes/<share>/ prefix (/Volumes/media/Movies/Blade Runner 2049)',
      fn: () => {
        const res = sanitizeSambaPath('/Volumes/media/Movies/Blade Runner 2049');
        if (res !== 'Movies/Blade Runner 2049') {
          throw new Error(`Expected 'Movies/Blade Runner 2049', got '${res}'`);
        }
      },
    },
    {
      name: 'Linux Mount: Strip /mnt/<share>/ prefix (/mnt/vault/Series/Severance [2022])',
      fn: () => {
        const res = sanitizeSambaPath('/mnt/vault/Series/Severance [2022]');
        if (res !== 'Series/Severance [2022]') {
          throw new Error(`Expected 'Series/Severance [2022]', got '${res}'`);
        }
      },
    },
    {
      name: 'Linux Mount: Strip /media/<share>/ prefix (/media/samba_share/Music/Pink Floyd)',
      fn: () => {
        const res = sanitizeSambaPath('/media/samba_share/Music/Pink Floyd');
        if (res !== 'Music/Pink Floyd') {
          throw new Error(`Expected 'Music/Pink Floyd', got '${res}'`);
        }
      },
    },

    // ---------------------------------------------------------
    // 3. Windows Drive Letters & Cross-OS Slash Directions
    // ---------------------------------------------------------
    {
      name: 'Windows Path: Sanitize drive letter with backslashes C:\\Users\\Media\\Movies\\Inception',
      fn: () => {
        const res = sanitizeSambaPath('C:\\Users\\Media\\Movies\\Inception');
        if (res !== 'Users/Media/Movies/Inception') {
          throw new Error(`Expected 'Users/Media/Movies/Inception', got '${res}'`);
        }
      },
    },
    {
      name: 'Windows Path: Sanitize drive letter with forward slashes D:/Media/Series/Westworld (2016',
      fn: () => {
        const res = sanitizeSambaPath('D:/Media/Series/Westworld (2016');
        if (res !== 'Media/Series/Westworld (2016)') {
          throw new Error(`Expected 'Media/Series/Westworld (2016)', got '${res}'`);
        }
      },
    },
    {
      name: 'Windows Path: Sanitize drive root with trailing slash E:\\',
      fn: () => {
        const res = sanitizeSambaPath('E:\\');
        if (res !== '') {
          throw new Error(`Expected empty string for drive root, got '${res}'`);
        }
      },
    },
    {
      name: 'Mixed Slashes: Sanitize alternating slashes Series\\Season 1/Episode 1\\video.mkv',
      fn: () => {
        const res = sanitizeSambaPath('Series\\Season 1/Episode 1\\video.mkv');
        if (res !== 'Series/Season 1/Episode 1/video.mkv') {
          throw new Error(`Expected 'Series/Season 1/Episode 1/video.mkv', got '${res}'`);
        }
      },
    },
    {
      name: 'Mixed Slashes: Sanitize UNC with backslashes & forward slashes //192.168.1.25\\media/Series\\Show',
      fn: () => {
        const res = sanitizeSambaPath('//192.168.1.25\\media/Series\\Show');
        if (res !== 'Series/Show') {
          throw new Error(`Expected 'Series/Show', got '${res}'`);
        }
      },
    },

    // ---------------------------------------------------------
    // 4. Trailing Slashes and Redundant Consecutives
    // ---------------------------------------------------------
    {
      name: 'Trailing Slashes: Sanitize single trailing slash /Volumes/media/Series/Movies/',
      fn: () => {
        const res = sanitizeSambaPath('/Volumes/media/Series/Movies/');
        if (res !== 'Series/Movies') {
          throw new Error(`Expected 'Series/Movies', got '${res}'`);
        }
      },
    },
    {
      name: 'Trailing Slashes: Sanitize multiple trailing slashes //192.168.1.50/vault/Music/Pink Floyd///',
      fn: () => {
        const res = sanitizeSambaPath('//192.168.1.50/vault/Music/Pink Floyd///');
        if (res !== 'Music/Pink Floyd') {
          throw new Error(`Expected 'Music/Pink Floyd', got '${res}'`);
        }
      },
    },
    {
      name: 'Redundant Slashes: Sanitize excessive internal slashes Series///Season 1////Episode 01.mkv',
      fn: () => {
        const res = sanitizeSambaPath('Series///Season 1////Episode 01.mkv');
        if (res !== 'Series/Season 1/Episode 01.mkv') {
          throw new Error(`Expected 'Series/Season 1/Episode 01.mkv', got '${res}'`);
        }
      },
    },

    // ---------------------------------------------------------
    // 5. diagnoseSambaPath Anomaly Diagnostics & Anomaly Flags
    // ---------------------------------------------------------
    {
      name: 'diagnoseSambaPath: Detects double slash anomaly on //192.168.1.25/media/Series',
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
      name: 'diagnoseSambaPath: Detects mixed slashes on Series\\Season 1/Episode 1',
      fn: () => {
        const diag = diagnoseSambaPath('Series\\Season 1/Episode 1');
        if (!diag.hasMixedSlashes || !diag.isSuspicious) {
          throw new Error('Expected hasMixedSlashes=true and isSuspicious=true');
        }
      },
    },
    {
      name: 'diagnoseSambaPath: Detects unclosed parentheses in Stranger Things (2016',
      fn: () => {
        const diag = diagnoseSambaPath('Series/Stranger Things (2016/Episode 1.mkv');
        if (!diag.hasUnclosedParens || !diag.isSuspicious) {
          throw new Error('Expected hasUnclosedParens=true');
        }
      },
    },
    {
      name: 'diagnoseSambaPath: Validates clean normalized path with high cleanliness score',
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

    // ---------------------------------------------------------
    // 6. Filename Sanitization & Illegal Character Replacement
    // ---------------------------------------------------------
    {
      name: 'Sanitize Filename: Balance unclosed parentheses and square brackets',
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
      name: 'Sanitize Filename: Replace colons with spaced hyphen for SMB compatibility',
      fn: () => {
        const res = sanitizeFilename('Dune: Part Two (2024)');
        if (res !== 'Dune - Part Two (2024)') {
          throw new Error(`Expected 'Dune - Part Two (2024)', got '${res}'`);
        }
      },
    },
    {
      name: 'Sanitize Filename: Strip illegal Windows/Samba characters (< > " ? *)',
      fn: () => {
        const res = sanitizeFilename('Movie<?>*"Special".mp4');
        if (res.includes('<') || res.includes('>') || res.includes('?') || res.includes('*') || res.includes('"')) {
          throw new Error(`Filename contains forbidden characters: '${res}'`);
        }
      },
    },

    // ---------------------------------------------------------
    // 7. Cleanliness Scoring Tests
    // ---------------------------------------------------------
    {
      name: 'Cleanliness Score: Penalize leading double slashes and mixed slashes',
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

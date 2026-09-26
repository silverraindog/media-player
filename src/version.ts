/**
 * Application Versioning & Release Tag Configuration
 * 
 * Tracks the current semantic version and release tags for SambaVault.
 * Release tags follow semver format: 0.0.1, 0.0.2, etc.
 */

export const APP_VERSION = '0.0.1';
export const APP_RELEASE_TAG = '0.0.1';
export const APP_NAME = 'SambaVault';

export interface ReleaseIncrement {
  version: string;
  tag: string;
  buildNumber: number;
  releaseDate: string;
  status: 'active' | 'next_push' | 'queued' | 'baseline' | 'released';
  title: string;
  highlights: string[];
  commitSha?: string;
  gitCommand?: string;
}

export const BUILD_INCREMENTS: ReleaseIncrement[] = [
  {
    version: '0.0.3',
    tag: '0.0.3',
    buildNumber: 3,
    releaseDate: 'Planned / Queued',
    status: 'queued',
    title: 'Advanced Multi-Share Sync & Auto-Failover',
    highlights: [
      'Multi-share concurrent indexing with automatic offline share failover',
      'Dynamic network latency graph & bandwidth throttling controls',
      'Automated background scheduled sync with desktop push notifications'
    ],
    gitCommand: 'git tag 0.0.3 && git push origin 0.0.3'
  },
  {
    version: '0.0.2',
    tag: '0.0.2',
    buildNumber: 2,
    releaseDate: 'Staged / Next Push',
    status: 'next_push',
    title: 'Custom Mount Paths & Release Version Tracking',
    highlights: [
      'Persistent Custom Mount Paths section in SambaMountHub for manual local directories',
      'SambaConfig persistence with prioritized sync scan fallbacks',
      'Header & Footer active release tag badges (v0.0.1 -> v0.0.2)',
      'Release Version Tracker in Settings displaying all build increments'
    ],
    gitCommand: 'git tag 0.0.2 && git push origin 0.0.2'
  },
  {
    version: '0.0.1',
    tag: '0.0.1',
    buildNumber: 1,
    releaseDate: 'Current Active Build',
    status: 'active',
    title: 'Initial Desktop Release & Automated Tag Pipeline',
    highlights: [
      'Automated GitHub Actions release pipeline for cross-platform desktop installers',
      'Universal Samba network explorer with deep directory traversal',
      'Embedded SQLite media vault, watch progress tracker & Recharts analytics',
      'Kodi/Plex/Jellyfin compatible NFO generator & artwork downloader'
    ],
    gitCommand: 'git tag 0.0.1 && git push origin 0.0.1'
  },
  {
    version: '0.0.0',
    tag: '0.0.0',
    buildNumber: 0,
    releaseDate: 'Baseline Initial Commit',
    status: 'baseline',
    title: 'Initial Project Architecture Bootstrap',
    highlights: [
      'Initial Vite + React + Tailwind + TypeScript architecture',
      'Basic SMB probe mock & file classification prototype'
    ],
    gitCommand: 'git tag 0.0.0'
  }
];

/**
 * Calculates the next sequential patch release tag.
 * e.g., "0.0.1" -> "0.0.2"
 */
export function getNextReleaseTag(current: string = APP_VERSION): string {
  const clean = current.replace(/^v/, '');
  const parts = clean.split('.').map(p => parseInt(p, 10));
  if (parts.length >= 3 && !isNaN(parts[2])) {
    return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
  return `${clean}.1`;
}

/**
 * Normalizes version tag for display or git operations.
 */
export function formatReleaseTag(tag: string, withPrefix: boolean = false): string {
  const clean = tag.replace(/^v/, '');
  return withPrefix ? `v${clean}` : clean;
}

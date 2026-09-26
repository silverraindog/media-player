import { CustomMountPath, SambaConfig } from '../types';

/**
 * Normalizes raw custom mount paths (which might be strings or objects)
 * into a typed array of CustomMountPath items with unique IDs, enabled states, and priorities.
 */
export function normalizeCustomMountPaths(
  rawPaths?: (CustomMountPath | string)[]
): CustomMountPath[] {
  if (!rawPaths || !Array.isArray(rawPaths)) {
    return [];
  }

  const result: CustomMountPath[] = [];

  rawPaths.forEach((item, index) => {
    if (typeof item === 'string') {
      const clean = item.trim();
      if (clean) {
        result.push({
          id: `mount-${Date.now()}-${index}`,
          path: clean,
          alias: clean.split(/[/\\]/).filter(Boolean).pop() || 'Custom Share',
          enabled: true,
          priority: index + 1,
          addedAt: new Date().toISOString(),
          status: 'unverified' as const,
        });
      }
    } else if (item && typeof item === 'object' && item.path) {
      result.push({
        id: item.id || `mount-${Date.now()}-${index}`,
        path: item.path.trim(),
        alias: item.alias || item.path.split(/[/\\]/).filter(Boolean).pop() || 'Custom Share',
        enabled: item.enabled !== false,
        priority: typeof item.priority === 'number' ? item.priority : index + 1,
        addedAt: item.addedAt || new Date().toISOString(),
        lastVerified: item.lastVerified,
        status: item.status || 'unverified',
        itemCount: item.itemCount,
      });
    }
  });

  return result.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
}

/**
 * Returns prioritized scan paths from SambaConfig.
 * Priority hierarchy:
 * 1. Enabled custom mount paths registered in SambaConfig (sorted by priority)
 * 2. sambaConfig.mountPath
 * 3. Default volume (/Volumes/${shareName})
 */
export function getPrioritizedScanPaths(
  config: SambaConfig,
  customScanPath?: string
): { primaryPath: string; allCandidates: string[]; hasCustomPrioritized: boolean } {
  if (customScanPath && customScanPath.trim()) {
    return {
      primaryPath: customScanPath.trim(),
      allCandidates: [customScanPath.trim()],
      hasCustomPrioritized: true,
    };
  }

  const normalized = normalizeCustomMountPaths(config.customMountPaths);
  const enabledCustoms = normalized.filter((p) => p.enabled);

  const candidateSet = new Set<string>();

  // 1. Add all enabled custom mount paths first
  for (const item of enabledCustoms) {
    if (item.path) {
      candidateSet.add(item.path);
    }
  }

  const hasCustomPrioritized = candidateSet.size > 0;

  // 2. Add sambaConfig.mountPath if specified
  if (config.mountPath && config.mountPath.trim()) {
    candidateSet.add(config.mountPath.trim());
  }

  // 3. Add default auto-discovered share volume path
  const defaultShare = `/Volumes/${config.share || 'media'}`;
  candidateSet.add(defaultShare);

  const allCandidates = Array.from(candidateSet);
  const primaryPath = allCandidates[0] || defaultShare;

  return {
    primaryPath,
    allCandidates,
    hasCustomPrioritized,
  };
}

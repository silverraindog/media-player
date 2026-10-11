import { useCallback } from 'react';
import { sanitizeSambaPath } from '../utils/pathSanitizer';

export const usePathSanitizer = () => {
  const sanitizePath = useCallback((path: string): string => {
    if (!path) return '';
    
    // Remove unsupported protocols like 'asset://' or 'file://'
    let sanitized = path.replace(/^(asset|file):\/\//i, '');
    
    // Decode URI components if they were encoded (e.g. %2FVolumes%2F...)
    try {
      sanitized = decodeURIComponent(sanitized);
    } catch (e) {
      console.warn('[usePathSanitizer] Failed to decode path:', sanitized);
    }

    // Use existing utility for further sanitization and normalization
    return sanitizeSambaPath(sanitized, { preserveAbsolutePrefix: true });
  }, []);

  return { sanitizePath };
};

import { useCallback } from 'react';
import { sanitizeMediaSourcePath } from '../utils/pathSanitizer';

export const usePathSanitizer = () => {
  const sanitizePath = useCallback((path: string): string => {
    if (!path) return '';
    return sanitizeMediaSourcePath(path, { preserveAbsolutePrefix: true });
  }, []);

  const sanitizeMediaUrl = useCallback((url: string): string => {
    if (!url) return '';
    return sanitizeMediaSourcePath(url, { preserveAbsolutePrefix: true });
  }, []);

  return { sanitizePath, sanitizeMediaUrl };
};


import { useState, useCallback } from 'react';

export function useSambaErrorMonitor() {
  const [suggestTestConnection, setSuggestTestConnection] = useState<boolean>(false);
  const [mountFailureReason, setMountFailureReason] = useState<string | null>(null);

  const evaluateError = useCallback((errorMsg: string, statusCode?: number) => {
    if (!errorMsg && !statusCode) return;

    const lower = (errorMsg || '').toLowerCase();
    const isNetworkOrMountIssue =
      statusCode === 404 ||
      statusCode === 500 ||
      statusCode === 502 ||
      statusCode === 504 ||
      lower.includes('network') ||
      lower.includes('mount') ||
      lower.includes('samba') ||
      lower.includes('smb') ||
      lower.includes('connection') ||
      lower.includes('refused') ||
      lower.includes('timed out') ||
      lower.includes('permission denied') ||
      lower.includes('not found') ||
      lower.includes('offline');

    if (isNetworkOrMountIssue) {
      setSuggestTestConnection(true);
      setMountFailureReason(errorMsg || `Network mount error (Status ${statusCode || 'unknown'})`);
    }
  }, []);

  const resetMonitor = useCallback(() => {
    setSuggestTestConnection(false);
    setMountFailureReason(null);
  }, []);

  return {
    suggestTestConnection,
    mountFailureReason,
    evaluateError,
    resetMonitor,
  };
}

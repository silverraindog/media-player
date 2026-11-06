interface ReloadCallbacks {
  onSuccess: () => void;
  onFailure: (reason: string) => void;
}

export function reloadDirectMedia(
  video: HTMLVideoElement,
  callbacks: ReloadCallbacks,
  timeoutMs = 15000,
): () => void {
  const source = video.getAttribute('src');
  if (!source?.trim()) {
    callbacks.onFailure('The direct player has no media source to reload.');
    return () => {};
  }

  const savedTime = video.currentTime;
  const resumePlayback = !video.paused;
  let metadataLoaded = false;
  let finished = false;
  let timeout: ReturnType<typeof setTimeout>;

  const cleanup = () => {
    clearTimeout(timeout);
    video.removeEventListener('loadedmetadata', onMetadata);
    video.removeEventListener('playing', onPlaying);
    video.removeEventListener('error', onError);
  };
  const finish = (error?: string) => {
    if (finished) return;
    finished = true;
    cleanup();
    if (error) callbacks.onFailure(error);
    else callbacks.onSuccess();
  };
  const onMetadata = () => {
    metadataLoaded = true;
    try {
      if (savedTime > 0) video.currentTime = savedTime;
    } catch (error) {
      finish(`Could not restore the playback position: ${String(error)}`);
      return;
    }
    if (!resumePlayback) {
      finish();
      return;
    }
    video.play().catch((error: unknown) => finish(`Could not resume playback: ${String(error)}`));
  };
  const onPlaying = () => {
    if (metadataLoaded) finish();
  };
  const onError = () => {
    finish(`Media reload failed${video.error ? ` (error ${video.error.code}: ${video.error.message})` : ''}.`);
  };

  video.addEventListener('loadedmetadata', onMetadata);
  video.addEventListener('playing', onPlaying);
  video.addEventListener('error', onError);
  timeout = setTimeout(() => finish('Media reload timed out before playback resumed.'), timeoutMs);
  try {
    video.load();
  } catch (error) {
    finish(`Could not reload media: ${String(error)}`);
  }

  return () => {
    finished = true;
    cleanup();
  };
}

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Hls from 'hls.js';
import { HLSPlayer } from '../../src/components/HLSPlayer';
import { VlcPlayer } from '../../src/components/VlcPlayer';
import { reloadDirectMedia } from '../../src/utils/reloadDirectMedia';

Object.assign(window, { reloadDirectMedia });

if (location.search === '?hlsjs') {
  const handlers: Array<(_event: string, data: { details: { totalduration: number } }) => void> = [];
  const originalOn = Hls.prototype.on;
  Hls.prototype.on = function (event, listener, context, once) {
    if (event === Hls.Events.LEVEL_LOADED) {
      handlers.push(listener as unknown as typeof handlers[number]);
      return this;
    }
    return originalOn.call(this, event, listener, context, once);
  };
  Hls.prototype.attachMedia = function () {};
  (window as Window & { emitLevel: () => void }).emitLevel = () => {
    handlers.at(-1)?.(Hls.Events.LEVEL_LOADED, { details: { totalduration: 120 } });
  };
} else {
  Hls.isSupported = () => false;
}
HTMLMediaElement.prototype.canPlayType = () => 'probably';
HTMLMediaElement.prototype.load = () => {};
HTMLMediaElement.prototype.play = () => Promise.resolve();

function Fixture() {
  const [updates, setUpdates] = useState(0);
  return (
    <>
      <button onClick={() => setUpdates(updates + 1)}>Rerender parent</button>
      {location.search === '?vlc' ? (
        <VlcPlayer mediaId="test" filePath="/movie.mkv" onFallback={() => {}} />
      ) : (
        <HLSPlayer mediaId="test" filePath="/movie.mkv" title="Test" />
      )}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);

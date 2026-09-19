import JSZip from 'jszip';
import { MediaMetadata } from '../types';
import { generateMetadataFile, generateEpisodeNfo } from './nfoGenerator';

// Helper to fetch image binary safely through server proxy
async function fetchImageBlob(imageUrl: string): Promise<Blob | null> {
  if (!imageUrl) return null;
  try {
    // Direct blob conversion for data: URIs
    if (imageUrl.startsWith('data:image/')) {
      const res = await fetch(imageUrl);
      return await res.blob();
    }

    // Proxy through server to avoid CORS or hotlinking 403 blocks
    const proxyUrl = `/api/media/image-proxy?url=${encodeURIComponent(imageUrl)}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      return await res.blob();
    }

    // Direct fallback
    const directRes = await fetch(imageUrl, { mode: 'cors' });
    if (directRes.ok) {
      return await directRes.blob();
    }
    return null;
  } catch (err) {
    console.warn('Failed to fetch image blob for packaging:', imageUrl, err);
    return null;
  }
}

// Download artwork directly to the browser as a standalone image file (.jpg)
export async function downloadMediaArtwork(imageUrl: string, filename: string = 'poster.jpg'): Promise<void> {
  if (!imageUrl) return;
  try {
    if (imageUrl.startsWith('data:image/')) {
      const a = document.createElement('a');
      a.href = imageUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    // Use backend download endpoint to force attachment headers
    const downloadUrl = `/api/media/download-art?url=${encodeURIComponent(imageUrl)}&filename=${encodeURIComponent(filename)}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.error('Failed to trigger artwork download:', err);
  }
}

export async function downloadMediaBundleZip(media: MediaMetadata): Promise<void> {
  const zip = new JSZip();
  const folderName = `${media.title.replace(/[/\\?%*:|"<>]/g, '_')} (${media.year})`;
  const root = zip.folder(folderName);

  if (!root) return;

  // 1. Primary NFO file
  const nfoContent = generateMetadataFile(media);
  if (media.type === 'movie') {
    root.file(`${folderName}.nfo`, nfoContent);
    root.file('movie.nfo', nfoContent);
  } else if (media.type === 'series') {
    root.file('tvshow.nfo', nfoContent);

    // Add individual episode NFOs if available
    if (media.seasons) {
      media.seasons.forEach((season) => {
        const sPad = String(season.seasonNumber).padStart(2, '0');
        const seasonFolder = root.folder(`Season ${sPad}`);
        if (seasonFolder && season.episodes) {
          season.episodes.forEach((ep) => {
            const ePad = String(ep.episodeNumber).padStart(2, '0');
            const epNfo = generateEpisodeNfo(media, season.seasonNumber, ep.episodeNumber, ep.title, ep.plot);
            seasonFolder.file(`${media.title} - S${sPad}E${ePad} - ${ep.title.replace(/[/\\?%*:|"<>]/g, '_')}.nfo`, epNfo);
          });
        }
      });
    }
  } else {
    root.file('album.nfo', nfoContent);
    root.file('artist.nfo', nfoContent);
  }

  // 2. Fetch and package Artwork Images (poster.jpg, fanart.jpg, folder.jpg)
  const posterUrl = media.posterUrl;
  const fanartUrl = media.fanartUrl;

  if (posterUrl) {
    const posterBlob = await fetchImageBlob(posterUrl);
    if (posterBlob) {
      if (media.type === 'album') {
        root.file('folder.jpg', posterBlob);
        root.file('cover.jpg', posterBlob);
      } else {
        root.file('poster.jpg', posterBlob);
        root.file(`${folderName}-poster.jpg`, posterBlob);
      }
    }
  }

  if (fanartUrl) {
    const fanartBlob = await fetchImageBlob(fanartUrl);
    if (fanartBlob) {
      root.file('fanart.jpg', fanartBlob);
      root.file('backdrop.jpg', fanartBlob);
      root.file(`${folderName}-fanart.jpg`, fanartBlob);
    }
  }

  // 3. Metadata JSON Summary
  root.file('metadata.json', JSON.stringify(media, null, 2));

  // 4. README with Samba and Kodi/Plex Instructions
  const readmeContent = `# ${media.title} (${media.year}) - Media & Metadata Package
Type: ${media.type.toUpperCase()}
Rating: ${media.rating}/10
Genres: ${media.genres.join(', ')}

## Included Artwork:
${posterUrl ? `- poster.jpg / folder.jpg (Official Cover Art)` : `- [No poster available]`}
${fanartUrl ? `- fanart.jpg / backdrop.jpg (Cinematic Background Banner)` : `- [No fanart available]`}

## Samba (SMB) Transfer Instructions:
- **macOS**: Copy this folder to \`/Volumes/media/${media.type === 'movie' ? 'Movies' : media.type === 'series' ? 'TV Shows' : 'Music'}/\`
- **Linux**: Copy this folder to \`/mnt/media/${media.type === 'movie' ? 'Movies' : media.type === 'series' ? 'TV Shows' : 'Music'}/\`
- **Windows**: Copy this folder to \`Z:\\${media.type === 'movie' ? 'Movies' : media.type === 'series' ? 'TV Shows' : 'Music'}\\\`

## Compatible Players:
- Plex Media Server (Local Media Assets agent)
- Jellyfin Media Server (NFO Metadata Provider)
- Kodi Entertainment Center (Direct NFO reader)
- Emby Server (NFO reader)
- MusicBrainz Picard / Foobar2000 (Music tags)
`;
  root.file('README.txt', readmeContent);

  // 5. Subtitle sample file
  if (media.type === 'movie') {
    root.file(`${folderName}.en.srt`, `1\n00:00:01,000 --> 00:00:04,000\n[${media.title} - English Subtitles]\n`);
  }

  // Generate Blob and trigger download
  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${folderName}_media_package.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

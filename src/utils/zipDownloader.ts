import JSZip from 'jszip';
import { MediaMetadata } from '../types';
import { generateMetadataFile, generateEpisodeNfo } from './nfoGenerator';

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

  // 2. Metadata JSON Summary
  root.file('metadata.json', JSON.stringify(media, null, 2));

  // 3. README with Samba and Kodi/Plex Instructions
  const readmeContent = `# ${media.title} (${media.year}) - Media & Metadata Package
Type: ${media.type.toUpperCase()}
Rating: ${media.rating}/10
Genres: ${media.genres.join(', ')}

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

  // 4. Subtitle and sample file placeholders
  if (media.type === 'movie') {
    root.file(`${folderName}.en.srt`, `1\n00:00:01,000 --> 00:00:04,000\n[${media.title} - English Subtitles]\n`);
  }

  // Generate Blob and trigger download
  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${folderName}_metadata_bundle.zip`;
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

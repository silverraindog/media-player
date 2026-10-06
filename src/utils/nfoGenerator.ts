import { MediaMetadata } from '../types';

export function escapeXml(unsafe: string | number | undefined): string {
  if (unsafe === undefined || unsafe === null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateMovieNfo(movie: MediaMetadata): string {
  const genresXml = movie.genres.map(g => `  <genre>${escapeXml(g)}</genre>`).join('\n');
  const directorsXml = (movie.directors || []).map(d => `  <director>${escapeXml(d)}</director>`).join('\n');
  const castXml = (movie.studio ? `  <studio>${escapeXml(movie.studio)}</studio>\n` : '');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<movie>
  <title>${escapeXml(movie.title)}</title>
  <originaltitle>${escapeXml(movie.originalTitle || movie.title)}</originaltitle>
  <sorttitle>${escapeXml(movie.title)}</sorttitle>
  <rating>${movie.rating.toFixed(1)}</rating>
  <votes>${movie.votes || 15400}</votes>
  <year>${movie.year}</year>
  <premiered>${escapeXml(movie.premiered || `${movie.year}-01-01`)}</premiered>
  <plot>${escapeXml(movie.overview)}</plot>
  <outline>${escapeXml(movie.tagline || movie.overview.substring(0, 150))}</outline>
  <tagline>${escapeXml(movie.tagline || '')}</tagline>
  <runtime>${escapeXml(movie.runtime || '120 min')}</runtime>
  <mpaa>${escapeXml(movie.certification || 'PG-13')}</mpaa>
  <id>${escapeXml(movie.imdbId || 'tt' + Math.floor(1000000 + Math.random() * 9000000))}</id>
  <tmdbid>${escapeXml(movie.tmdbId || String(Math.floor(10000 + Math.random() * 90000)))}</tmdbid>
${genresXml}
${directorsXml}
${castXml}  <thumb aspect="poster">${escapeXml(movie.posterUrl)}</thumb>
  <fanart>
    <thumb>${escapeXml(movie.fanartUrl || movie.posterUrl)}</thumb>
  </fanart>
</movie>`;
}

export function generateTvShowNfo(series: MediaMetadata): string {
  const genresXml = series.genres.map(g => `  <genre>${escapeXml(g)}</genre>`).join('\n');
  const seasonsCount = series.seasons ? series.seasons.length : 1;
  const totalEpisodes = series.seasons 
    ? series.seasons.reduce((acc, s) => acc + (s.episodeCount || 0), 0) 
    : 10;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<tvshow>
  <title>${escapeXml(series.title)}</title>
  <originaltitle>${escapeXml(series.originalTitle || series.title)}</originaltitle>
  <rating>${series.rating.toFixed(1)}</rating>
  <year>${series.year}</year>
  <premiered>${escapeXml(series.premiered || `${series.year}-01-01`)}</premiered>
  <plot>${escapeXml(series.overview)}</plot>
  <tagline>${escapeXml(series.tagline || '')}</tagline>
  <studio>${escapeXml(series.studio || 'Network')}</studio>
  <status>Ended</status>
  <season>${seasonsCount}</season>
  <episode>${totalEpisodes}</episode>
  <mpaa>${escapeXml(series.certification || 'TV-MA')}</mpaa>
  <imdbid>${escapeXml(series.imdbId || 'tt' + Math.floor(1000000 + Math.random() * 9000000))}</imdbid>
${genresXml}
  <thumb aspect="poster">${escapeXml(series.posterUrl)}</thumb>
  <fanart>
    <thumb>${escapeXml(series.fanartUrl || series.posterUrl)}</thumb>
  </fanart>
</tvshow>`;
}

export function generateEpisodeNfo(series: MediaMetadata, seasonNum: number, epNum: number, epTitle?: string, epPlot?: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<episodedetails>
  <title>${escapeXml(epTitle || `Episode ${epNum}`)}</title>
  <showtitle>${escapeXml(series.title)}</showtitle>
  <rating>${series.rating.toFixed(1)}</rating>
  <season>${seasonNum}</season>
  <episode>${epNum}</episode>
  <plot>${escapeXml(epPlot || series.overview)}</plot>
  <aired>${escapeXml(series.premiered || `${series.year}-01-01`)}</aired>
  <runtime>${escapeXml(series.runtime || '45 min')}</runtime>
</episodedetails>`;
}

export function generateMusicAlbumNfo(album: MediaMetadata): string {
  const genresXml = album.genres.map(g => `  <genre>${escapeXml(g)}</genre>`).join('\n');
  const tracksXml = (album.tracks || []).map(t => 
    `  <track>\n    <position>${t.trackNumber}</position>\n    <title>${escapeXml(t.title)}</title>\n    <duration>${escapeXml(t.duration)}</duration>\n  </track>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<album>
  <title>${escapeXml(album.title)}</title>
  <artist>${escapeXml((album.artists && album.artists[0]) || album.title)}</artist>
  <year>${album.year}</year>
  <releasedate>${escapeXml(album.premiered || `${album.year}-01-01`)}</releasedate>
  <review>${escapeXml(album.overview)}</review>
  <rating>${album.rating.toFixed(1)}</rating>
  <label>${escapeXml(album.recordLabel || 'Independent')}</label>
  <musicbrainzalbumid>${escapeXml(album.musicBrainzId || 'mb-' + Math.floor(100000 + Math.random() * 900000))}</musicbrainzalbumid>
${genresXml}
${tracksXml}
</album>`;
}

export function generateMetadataFile(media: MediaMetadata): string {
  if (media.type === 'movie') {
    return generateMovieNfo(media);
  } else if (media.type === 'series') {
    return generateTvShowNfo(media);
  } else {
    return generateMusicAlbumNfo(media);
  }
}

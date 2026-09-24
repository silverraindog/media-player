// src/services/youtubeService.ts

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeSubscription {
  id: string;
  snippet: {
    title: string;
    description: string;
    resourceId: {
      channelId: string;
    };
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
}

export interface YouTubeVideo {
  id: string | { videoId?: string };
  snippet: {
    title: string;
    description: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
    resourceId?: {
      videoId?: string;
    };
  };
}

/**
 * Fetch the authenticated user's YouTube subscriptions.
 */
export const fetchSubscriptions = async (token: string): Promise<YouTubeSubscription[]> => {
  const response = await fetch(`${YOUTUBE_API_BASE}/subscriptions?part=snippet&mine=true&maxResults=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to fetch YouTube subscriptions.');
  }

  const data = await response.json();
  return data.items || [];
};

/**
 * Fetch latest videos from a specific channel using its uploads playlist.
 */
export const fetchChannelUploads = async (token: string, channelId: string, maxResults = 4): Promise<YouTubeVideo[]> => {
  const uploadsPlaylistId = 'UU' + channelId.slice(2);
  const response = await fetch(
    `${YOUTUBE_API_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!response.ok) {
    // Some channels might not have public uploads playlists, log warning and return empty
    console.warn(`Failed to fetch uploads for channel ${channelId}`);
    return [];
  }

  const data = await response.json();
  return data.items || [];
};

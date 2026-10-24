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

/**
 * Curated sample YouTube channels and trailers to explore immediately without OAuth.
 */
export const getCuratedSampleFeeds = (): { subscriptions: YouTubeSubscription[]; videos: YouTubeVideo[] } => {
  const subscriptions: YouTubeSubscription[] = [
    {
      id: 'sub-movieclips',
      snippet: {
        title: 'Rotten Tomatoes Movieclips',
        description: 'The Rotten Tomatoes Trailers channel is your destination for hot new movie trailers and clips.',
        resourceId: { channelId: 'UCi8e0iOVk1fEOogdfu4YgfA' },
        thumbnails: {
          default: { url: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=120&h=120&fit=crop' },
          medium: { url: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=240&h=240&fit=crop' },
        },
      },
    },
    {
      id: 'sub-warnerbros',
      snippet: {
        title: 'Warner Bros. Pictures',
        description: 'Official Warner Bros. Pictures YouTube channel featuring upcoming theatrical releases.',
        resourceId: { channelId: 'UCjmJDM5pRKbUlVIzDYYWb6g' },
        thumbnails: {
          default: { url: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=120&h=120&fit=crop' },
          medium: { url: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=240&h=240&fit=crop' },
        },
      },
    },
    {
      id: 'sub-universal',
      snippet: {
        title: 'Universal Pictures',
        description: 'Universal Pictures official trailers, teasers, and exclusive film featurettes.',
        resourceId: { channelId: 'UCq0OueAsWh5KXN45L1yQKvw' },
        thumbnails: {
          default: { url: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=120&h=120&fit=crop' },
          medium: { url: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=240&h=240&fit=crop' },
        },
      },
    },
    {
      id: 'sub-ign',
      snippet: {
        title: 'IGN Movie Trailers',
        description: 'The latest official game and cinema trailers in 4K from IGN.',
        resourceId: { channelId: 'UCKy1dAqELo0zrOtPkf0eTMw' },
        thumbnails: {
          default: { url: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=120&h=120&fit=crop' },
          medium: { url: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=240&h=240&fit=crop' },
        },
      },
    },
  ];

  const videos: YouTubeVideo[] = [
    {
      id: { videoId: 'd9MyW72ELq0' },
      snippet: {
        title: 'Avatar: The Way of Water | Official Teaser Trailer',
        description: 'Set more than a decade after the events of the first film, experience Pandora in stunning resolution.',
        channelId: 'UCi8e0iOVk1fEOogdfu4YgfA',
        channelTitle: 'Rotten Tomatoes Movieclips',
        publishedAt: '2024-02-15T18:00:00Z',
        thumbnails: {
          default: { url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=320&h=180&fit=crop' },
          medium: { url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=480&h=360&fit=crop' },
          high: { url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&h=450&fit=crop' },
        },
        resourceId: { videoId: 'd9MyW72ELq0' },
      },
    },
    {
      id: { videoId: 'uYPbbksJxIg' },
      snippet: {
        title: 'Oppenheimer | New 5-Minute Opening Look',
        description: 'Directed by Christopher Nolan, starring Cillian Murphy. The story of J. Robert Oppenheimer.',
        channelId: 'UCq0OueAsWh5KXN45L1yQKvw',
        channelTitle: 'Universal Pictures',
        publishedAt: '2024-03-01T14:30:00Z',
        thumbnails: {
          default: { url: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=320&h=180&fit=crop' },
          medium: { url: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=480&h=360&fit=crop' },
          high: { url: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=800&h=450&fit=crop' },
        },
        resourceId: { videoId: 'uYPbbksJxIg' },
      },
    },
    {
      id: { videoId: 'Way9Dexny3w' },
      snippet: {
        title: 'Dune: Part Two | Official Trailer 3',
        description: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators.',
        channelId: 'UCjmJDM5pRKbUlVIzDYYWb6g',
        channelTitle: 'Warner Bros. Pictures',
        publishedAt: '2024-03-12T16:00:00Z',
        thumbnails: {
          default: { url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=320&h=180&fit=crop' },
          medium: { url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=480&h=360&fit=crop' },
          high: { url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&h=450&fit=crop' },
        },
        resourceId: { videoId: 'Way9Dexny3w' },
      },
    },
    {
      id: { videoId: 'r51cYVZWKdY' },
      snippet: {
        title: 'Spider-Man: Across the Spider-Verse | The Final Trailer',
        description: 'Miles Morales returns for the next chapter of the Oscar-winning Spider-Verse saga.',
        channelId: 'UCKy1dAqELo0zrOtPkf0eTMw',
        channelTitle: 'IGN Movie Trailers',
        publishedAt: '2024-03-20T12:00:00Z',
        thumbnails: {
          default: { url: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=320&h=180&fit=crop' },
          medium: { url: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=480&h=360&fit=crop' },
          high: { url: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&h=450&fit=crop' },
        },
        resourceId: { videoId: 'r51cYVZWKdY' },
      },
    },
  ];

  return { subscriptions, videos };
};


import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Youtube,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  Play,
  ExternalLink,
  Calendar,
  Tv,
  AlertCircle,
  Key,
  ShieldCheck,
  User as UserIcon,
  BarChart3,
  Terminal,
} from 'lucide-react';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProvider, User } from '../lib/firebase';
import { fetchSubscriptions, fetchChannelUploads, YouTubeSubscription, YouTubeVideo } from '../services/youtubeService';

interface SyncLog {
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'warning';
}

const YouTubeSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="h-32 bg-slate-800 rounded-2xl"></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-64 bg-slate-800 rounded-2xl"></div>
      ))}
    </div>
  </div>
);

export const YouTubeTab: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string>(() => localStorage.getItem('youtube_access_token') || '');
  const [manualToken, setManualToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [subscriptions, setSubscriptions] = useState<YouTubeSubscription[]>([]);
  const [recentVideos, setRecentVideos] = useState<YouTubeVideo[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);

  const addLog = (message: string, type: SyncLog['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setSyncLogs((prev) => [{ timestamp, message, type }, ...prev].slice(0, 50));
  };

  // Monitor Firebase Auth session state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Sync Timer: 30 minutes
  useEffect(() => {
    if (!accessToken) return;

    const intervalId = setInterval(() => {
      console.log('[YouTubeTab] Triggering background sync...');
      fetchYouTubeData(accessToken);
    }, 30 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [accessToken]);

  const handleFirebaseGoogleSignIn = async () => {
    setErrorMsg(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      if (token) {
        setAccessToken(token);
        localStorage.setItem('youtube_access_token', token);
        fetchYouTubeData(token);
      } else {
        // Fallback to GIS client or prompt user
        handleGoogleIdentityLogin();
      }
    } catch (e: any) {
      console.error('Firebase Auth popup error:', e);
      setErrorMsg(`Firebase authentication failed: ${e?.message || e}`);
      handleGoogleIdentityLogin();
    }
  };

  const handleGoogleIdentityLogin = () => {
    if (!(window as any).google?.accounts?.oauth2) {
      setErrorMsg('Google Identity Services script not loaded. Please paste an OAuth Access Token manually below.');
      return;
    }

    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: '152448014679-5ppmkrq192enef9tivfum5pg90a3olaf.apps.googleusercontent.com',
        scope: 'https://www.googleapis.com/auth/youtube.readonly',
        callback: (response: any) => {
          if (response && response.access_token) {
            setAccessToken(response.access_token);
            localStorage.setItem('youtube_access_token', response.access_token);
            setErrorMsg(null);
            fetchYouTubeData(response.access_token);
          } else {
            setErrorMsg('Failed to acquire Google OAuth access token.');
          }
        },
      });
      client.requestAccessToken();
    } catch (e: any) {
      console.error('OAuth token client error:', e);
      setErrorMsg(`OAuth initialization failed: ${e?.message || e}`);
    }
  };

  const handleSaveManualToken = () => {
    if (!manualToken.trim()) return;
    const token = manualToken.trim();
    setAccessToken(token);
    localStorage.setItem('youtube_access_token', token);
    setManualToken('');
    setErrorMsg(null);
    fetchYouTubeData(token);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {}
    setAccessToken('');
    localStorage.removeItem('youtube_access_token');
    setSubscriptions([]);
    setRecentVideos([]);
  };

  const fetchYouTubeData = async (token: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    addLog('Starting YouTube data sync...', 'info');
    try {
      const subs = await fetchSubscriptions(token);
      setSubscriptions(subs);
      addLog(`Fetched ${subs.length} subscriptions.`, 'info');

      const allVideos: YouTubeVideo[] = [];
      for (const sub of subs.slice(0, 15)) {
        const channelId = sub.snippet.resourceId.channelId;
        const vids = await fetchChannelUploads(token, channelId);
        allVideos.push(...vids);
      }

      // Sort by publishedAt descending
      allVideos.sort((a, b) => new Date(b.snippet.publishedAt).getTime() - new Date(a.snippet.publishedAt).getTime());
      setRecentVideos(allVideos);
      addLog('YouTube data sync completed successfully.', 'info');
    } catch (err: any) {
      console.error('YouTube API error:', err);
      const msg = err?.message || 'Failed to connect to YouTube API. Please re-authenticate.';
      setErrorMsg(msg);
      addLog(`Sync error: ${msg}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredVideos = recentVideos.filter((video) => {
    if (selectedChannelId !== 'all' && video.snippet.channelId !== selectedChannelId) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const title = (video.snippet.title || '').toLowerCase();
      const channel = (video.snippet.channelTitle || '').toLowerCase();
      return title.includes(q) || channel.includes(q);
    }
    return true;
  });

  // Calculate daily upload frequency (last 7 days)
  const chartData = React.useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    const freqMap = last7Days.reduce((acc, date) => ({ ...acc, [date]: 0 }), {} as Record<string, number>);

    recentVideos.forEach((v) => {
      const date = v.snippet.publishedAt.split('T')[0];
      if (freqMap[date] !== undefined) {
        freqMap[date]++;
      }
    });

    return last7Days.map((date) => ({
      name: new Date(date).toLocaleDateString(undefined, { weekday: 'short' }),
      uploads: freqMap[date],
    }));
  }, [recentVideos]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-950/80 via-slate-900 to-indigo-950/80 border border-red-500/30 p-6 sm:p-8 shadow-xl">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Youtube className="w-48 h-48 text-red-500" />
        </div>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-semibold">
              <Youtube className="w-3.5 h-3.5" /> Firebase Authenticated YouTube Feed
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              YouTube Channel Updates
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Securely sign in with Firebase Authentication & Google OAuth to inspect new video uploads and updates across your subscribed YouTube channels.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {currentUser || accessToken ? (
              <div className="flex items-center gap-3">
                {currentUser && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-200">
                    {currentUser.photoURL ? (
                      <img src={currentUser.photoURL} alt="" className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <UserIcon className="w-4 h-4 text-red-400" />
                    )}
                    <span className="font-semibold truncate max-w-[140px]">{currentUser.displayName || currentUser.email}</span>
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-red-400 font-bold text-xs transition border border-red-500/30 cursor-pointer shadow-lg"
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={handleFirebaseGoogleSignIn}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition shadow-lg shadow-red-600/30 cursor-pointer active:scale-95"
              >
                <LogIn className="w-4 h-4" /> Sign In with Firebase & Google
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Activity Graph */}
      {(currentUser || accessToken) && recentVideos.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="w-5 h-5 text-red-400" />
            <h3 className="text-sm font-bold text-white">Upload Activity (Last 7 Days)</h3>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={10} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', fontSize: '12px' }}
                />
                <Line type="monotone" dataKey="uploads" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Authentication / Token Input Box if not connected */}
      {!currentUser && !accessToken && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 max-w-xl mx-auto shadow-xl text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 text-red-400 flex items-center justify-center mx-auto border border-red-500/20">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Secure Firebase & YouTube Login</h3>
            <p className="text-xs text-slate-400">
              Authenticate securely via Firebase to manage your active session and load your private channel subscriptions.
            </p>
          </div>

          <div className="pt-2 flex flex-col gap-3">
            <button
              onClick={handleFirebaseGoogleSignIn}
              className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition shadow-lg shadow-red-600/30 cursor-pointer flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" /> Sign In with Google & Firebase Auth
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-4 text-[10px] text-slate-500 uppercase tracking-widest">or paste access token</span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="Paste OAuth access token..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 transition"
                />
              </div>
              <button
                onClick={handleSaveManualToken}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition cursor-pointer"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl p-4 flex items-center gap-3 text-rose-300 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Subscribed Channels & Feed */}
      {(currentUser || accessToken) && (
        <div className="space-y-6">
          {/* Controls Bar: Channel Filter & Search */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search recent updates by title or channel..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 transition"
              />
            </div>

            <div className="flex items-center gap-3">
              <select
                value={selectedChannelId}
                onChange={(e) => setSelectedChannelId(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-red-500 transition cursor-pointer"
              >
                <option value="all">All Subscribed Channels ({subscriptions.length})</option>
                {subscriptions.map((sub) => (
                  <option key={sub.id} value={sub.snippet.resourceId.channelId}>
                    {sub.snippet.title}
                  </option>
                ))}
              </select>

              <button
                onClick={() => fetchYouTubeData(accessToken)}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition border border-slate-700 cursor-pointer disabled:opacity-50"
                title="Sync Now"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sync Now</span>
              </button>
            </div>
          </div>

          {/* Videos Grid */}
          {isLoading && recentVideos.length === 0 ? (
            <YouTubeSkeleton />
          ) : filteredVideos.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto border border-red-500/20">
                <Youtube className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">No Video Updates Found</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  No recent uploads matched your filter. Try selecting a different channel or refreshing your feed.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredVideos.map((video, index) => {
                const videoId = typeof video.id === 'string' ? video.id : video.id?.videoId || video.snippet.resourceId?.videoId;
                const thumb = video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url;
                const pubDate = new Date(video.snippet.publishedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });

                return (
                  <div
                    key={videoId || index}
                    className="group bg-slate-900 border border-slate-800 hover:border-red-500/40 rounded-2xl overflow-hidden shadow-xl transition-all duration-300 flex flex-col"
                  >
                    {/* Thumbnail Cover */}
                    <div className="relative aspect-video overflow-hidden bg-slate-950">
                      <img
                        src={thumb || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80'}
                        alt={video.snippet.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />

                      {/* Play Button Overlay */}
                      {videoId && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
                          <button
                            onClick={() => setActiveVideoUrl(`https://www.youtube.com/embed/${videoId}?autoplay=1`)}
                            className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-2xl hover:scale-110 transition cursor-pointer"
                            title="Play Video"
                          >
                            <Play className="w-5 h-5 fill-white ml-0.5" />
                          </button>
                        </div>
                      )}

                      {/* Published Date Badge */}
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-950/80 backdrop-blur-md border border-red-500/30 text-[10px] font-bold text-red-300">
                        <Calendar className="w-3 h-3" />
                        <span>{pubDate}</span>
                      </div>
                    </div>

                    {/* Content Info */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div className="space-y-1.5">
                        <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-red-300 transition line-clamp-2 leading-snug">
                          {video.snippet.title}
                        </h3>
                        <p className="text-[11px] font-medium text-slate-400 truncate flex items-center gap-1">
                          <Tv className="w-3 h-3 text-red-400 shrink-0" />
                          <span>{video.snippet.channelTitle}</span>
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                        {videoId ? (
                          <a
                            href={`https://www.youtube.com/watch?v=${videoId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-slate-400 hover:text-white transition text-[11px]"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-red-400" />
                            <span>Open on YouTube</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-500">YouTube Upload</span>
                        )}

                        {videoId && (
                          <button
                            onClick={() => setActiveVideoUrl(`https://www.youtube.com/embed/${videoId}?autoplay=1`)}
                            className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[11px] flex items-center gap-1 transition cursor-pointer shadow-md shadow-red-600/30"
                          >
                            <Play className="w-3 h-3 fill-white" />
                            <span>Watch</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Video Player Modal */}
      {activeVideoUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2">
                <Youtube className="w-5 h-5 text-red-500" />
                <h3 className="text-sm font-bold text-white">YouTube Video Player</h3>
              </div>
              <button
                onClick={() => setActiveVideoUrl(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="relative aspect-video bg-black">
              <iframe
                src={activeVideoUrl}
                title="YouTube video player"
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}

      {/* Log Viewer */}
      {(currentUser || accessToken) && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mt-6">
          <div className="flex justify-between items-center mb-3">
             <div className="flex items-center gap-2">
               <Terminal className="w-4 h-4 text-slate-400" />
               <h4 className="text-xs font-bold text-slate-300">Sync Events Log</h4>
             </div>
             <button onClick={() => setSyncLogs([])} className="text-[10px] text-slate-500 hover:text-red-400 transition cursor-pointer">Clear</button>
          </div>
          <div className="text-[10px] font-mono text-slate-400 max-h-40 overflow-y-auto space-y-1">
             {syncLogs.length === 0 ? (
               <p className="text-slate-600 italic">No sync events logged yet.</p>
             ) : (
               syncLogs.map((log, i) => (
                  <div key={i} className={log.type === 'error' ? 'text-rose-400' : log.type === 'warning' ? 'text-amber-400' : 'text-slate-400'}>
                     [{log.timestamp}] {log.message}
                  </div>
               ))
             )}
          </div>
        </div>
      )}
    </div>
  );
};

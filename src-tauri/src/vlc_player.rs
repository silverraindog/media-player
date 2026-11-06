//! Native libvlc playback for formats the webview cannot play (MKV, HEVC, ...).
//!
//! libvlc renders into a native NSView stacked above the webview, positioned over a
//! placeholder element in the UI. Playback controls stay in the HTML UI and talk to
//! these commands. Only implemented on macOS; elsewhere the commands report that
//! libvlc is unavailable so the frontend falls back to the FFmpeg HLS pipeline.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{State, Window};

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct VlcTrack {
    pub id: i32,
    pub name: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VlcStatus {
    pub state: String,
    pub time_ms: i64,
    pub length_ms: i64,
    pub seekable: bool,
    pub volume: i32,
    pub muted: bool,
    pub audio_tracks: Vec<VlcTrack>,
    pub subtitle_tracks: Vec<VlcTrack>,
    pub audio_track: i32,
    pub subtitle_track: i32,
}

/// Position of the video placeholder in CSS pixels relative to the webview's top-left corner.
#[derive(Deserialize, Clone, Copy)]
pub struct VlcRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Default)]
pub struct VlcPlayerState(Mutex<imp::Inner>);

#[cfg(target_os = "macos")]
#[allow(unexpected_cfgs)]
mod imp {
    use super::{VlcRect, VlcStatus, VlcTrack};
    use cocoa::base::{id, nil, BOOL, NO, YES};
    use cocoa::foundation::{NSPoint, NSRect, NSSize};
    use objc::{class, msg_send, sel, sel_impl};
    use std::ffi::{c_void, CStr, CString};
    use std::path::PathBuf;
    use std::sync::mpsc;
    use tauri::{Manager, Window};
    use vlc::{sys, Instance, Media, MediaPlayer, MediaPlayerAudioEx, State};

    const NS_WINDOW_ABOVE: isize = 1;

    pub struct Session {
        pub player: MediaPlayer,
        // Raw NSView pointer, only ever touched on the main thread
        view: usize,
    }

    #[derive(Default)]
    pub struct Inner {
        instance: Option<Instance>,
        session: Option<Session>,
    }

    // libvlc objects are thread-safe C handles; the NSView pointer is only dereferenced on the main thread.
    unsafe impl Send for Inner {}

    fn plugin_dir(window: &Window) -> Option<PathBuf> {
        let bundled = window
            .app_handle()
            .path_resolver()
            .resource_dir()
            .map(|d| d.join("vlc").join("plugins"));
        let candidates = [
            bundled,
            Some(PathBuf::from("/Applications/VLC.app/Contents/MacOS/plugins")),
        ];
        candidates.into_iter().flatten().find(|p| p.is_dir())
    }

    fn ensure_instance(inner: &mut Inner, window: &Window) -> Result<(), String> {
        if inner.instance.is_some() {
            return Ok(());
        }
        let plugins = plugin_dir(window).ok_or("libvlc plugins not found")?;
        std::env::set_var("VLC_PLUGIN_PATH", &plugins);
        let instance = Instance::new().ok_or("libvlc failed to initialise")?;
        inner.instance = Some(instance);
        Ok(())
    }

    pub fn is_available(window: &Window) -> bool {
        plugin_dir(window).is_some()
    }

    fn run_on_main<T: Send + 'static>(
        window: &Window,
        f: impl FnOnce() -> T + Send + 'static,
    ) -> Result<T, String> {
        let (tx, rx) = mpsc::channel();
        window
            .run_on_main_thread(move || {
                let _ = tx.send(f());
            })
            .map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())
    }

    // Converts the placeholder rect to a frame in the content view's coordinate space.
    unsafe fn frame_for(content: id, rect: VlcRect) -> NSRect {
        let bounds: NSRect = msg_send![content, bounds];
        let flipped: BOOL = msg_send![content, isFlipped];
        let y = if flipped == YES {
            rect.y
        } else {
            bounds.size.height - rect.y - rect.height
        };
        NSRect::new(
            NSPoint::new(rect.x, y),
            NSSize::new(rect.width.max(1.0), rect.height.max(1.0)),
        )
    }

    fn create_view(window: &Window, rect: VlcRect) -> Result<usize, String> {
        let ns_window = window.ns_window().map_err(|e| e.to_string())? as usize;
        run_on_main(window, move || unsafe {
            let ns_window = ns_window as id;
            let content: id = msg_send![ns_window, contentView];
            if content == nil {
                return Err("window has no content view".to_string());
            }
            let view: id = msg_send![class!(NSView), alloc];
            let view: id = msg_send![view, initWithFrame: frame_for(content, rect)];
            let _: () = msg_send![view, setWantsLayer: YES];
            let layer: id = msg_send![view, layer];
            let black: id = msg_send![class!(NSColor), blackColor];
            let cg: *mut c_void = msg_send![black, CGColor];
            let _: () = msg_send![layer, setBackgroundColor: cg];
            let _: () = msg_send![content, addSubview: view positioned: NS_WINDOW_ABOVE relativeTo: nil];
            Ok(view as usize)
        })?
    }

    pub fn set_rect(window: &Window, view: usize, rect: VlcRect, visible: bool) -> Result<(), String> {
        let ns_window = window.ns_window().map_err(|e| e.to_string())? as usize;
        run_on_main(window, move || unsafe {
            let content: id = msg_send![ns_window as id, contentView];
            let view = view as id;
            let _: () = msg_send![view, setFrame: frame_for(content, rect)];
            let hidden: BOOL = if visible { NO } else { YES };
            let _: () = msg_send![view, setHidden: hidden];
        })
    }

    fn destroy_view(window: &Window, view: usize) {
        let _ = run_on_main(window, move || unsafe {
            let view = view as id;
            let _: () = msg_send![view, removeFromSuperview];
            let _: () = msg_send![view, release];
        });
    }

    pub fn open(
        inner: &mut Inner,
        window: &Window,
        path: &str,
        start_ms: i64,
        rect: VlcRect,
    ) -> Result<(), String> {
        close(inner, window);
        if !std::path::Path::new(path).exists() {
            return Err(format!("media file not found: {path}"));
        }
        ensure_instance(inner, window)?;
        let instance = inner.instance.as_ref().unwrap();

        let media = Media::new_path(instance, path).ok_or("libvlc could not open the file")?;
        if start_ms > 0 {
            let opt = CString::new(format!(":start-time={:.3}", start_ms as f64 / 1000.0))
                .map_err(|e| e.to_string())?;
            unsafe { sys::libvlc_media_add_option(media.raw(), opt.as_ptr()) };
        }
        let player = MediaPlayer::new(instance).ok_or("libvlc could not create a player")?;
        player.set_media(&media);

        let view = create_view(window, rect)?;
        player.set_nsobject(view as *mut c_void);
        if player.play().is_err() {
            destroy_view(window, view);
            return Err("libvlc failed to start playback".to_string());
        }
        inner.session = Some(Session { player, view });
        Ok(())
    }

    pub fn close(inner: &mut Inner, window: &Window) {
        if let Some(session) = inner.session.take() {
            session.player.stop();
            let view = session.view;
            // Release the player (waits for the video output to shut down) before removing its view
            drop(session);
            destroy_view(window, view);
        }
    }

    pub fn session<'a>(inner: &'a Inner) -> Result<&'a Session, String> {
        inner.session.as_ref().ok_or_else(|| "no active libvlc session".to_string())
    }

    pub fn view_of(session: &Session) -> usize {
        session.view
    }

    pub fn toggle_pause(session: &Session, pause: bool) {
        session.player.set_pause(pause);
    }

    pub fn seek(session: &Session, ms: i64) {
        session.player.set_time(ms.max(0));
    }

    pub fn set_volume(session: &Session, volume: i32) {
        let _ = session.player.set_volume(volume.clamp(0, 200));
    }

    pub fn set_muted(session: &Session, muted: bool) {
        session.player.set_mute(muted);
    }

    pub fn set_rate(session: &Session, rate: f32) {
        let _ = session.player.set_rate(rate.clamp(0.25, 4.0));
    }

    pub fn set_audio_track(session: &Session, id: i32) {
        unsafe { sys::libvlc_audio_set_track(session.player.raw(), id) };
    }

    pub fn set_subtitle_track(session: &Session, id: i32) {
        unsafe { sys::libvlc_video_set_spu(session.player.raw(), id) };
    }

    unsafe fn read_tracks(head: *mut sys::libvlc_track_description_t) -> Vec<VlcTrack> {
        let mut tracks = Vec::new();
        let mut node = head;
        while !node.is_null() {
            let name = if (*node).psz_name.is_null() {
                String::new()
            } else {
                CStr::from_ptr((*node).psz_name).to_string_lossy().into_owned()
            };
            tracks.push(VlcTrack { id: (*node).i_id, name });
            node = (*node).p_next;
        }
        if !head.is_null() {
            sys::libvlc_track_description_list_release(head);
        }
        tracks
    }

    pub fn status(session: &Session) -> VlcStatus {
        let player = &session.player;
        let raw = player.raw();
        let state = match player.state() {
            State::Opening => "opening",
            State::Buffering => "buffering",
            State::Playing => "playing",
            State::Paused => "paused",
            State::Stopped => "stopped",
            State::Ended => "ended",
            State::Error => "error",
            State::NothingSpecial => "idle",
        };
        unsafe {
            VlcStatus {
                state: state.to_string(),
                time_ms: player.get_time().unwrap_or(0).max(0),
                length_ms: player
                    .get_media()
                    .and_then(|m| m.duration())
                    .unwrap_or(0)
                    .max(0),
                seekable: player.is_seekable(),
                volume: player.get_volume(),
                muted: player.get_mute().unwrap_or(false),
                audio_tracks: read_tracks(sys::libvlc_audio_get_track_description(raw)),
                subtitle_tracks: read_tracks(sys::libvlc_video_get_spu_description(raw)),
                audio_track: sys::libvlc_audio_get_track(raw),
                subtitle_track: sys::libvlc_video_get_spu(raw),
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    #[derive(Default)]
    pub struct Inner;
}

#[cfg(target_os = "macos")]
fn lock<'a>(state: &'a State<'_, VlcPlayerState>) -> Result<std::sync::MutexGuard<'a, imp::Inner>, String> {
    state.0.lock().map_err(|_| "libvlc state poisoned".to_string())
}

#[tauri::command]
pub async fn vlc_available(window: Window) -> bool {
    #[cfg(target_os = "macos")]
    {
        imp::is_available(&window)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        false
    }
}

#[tauri::command]
pub async fn vlc_open(
    window: Window,
    state: State<'_, VlcPlayerState>,
    path: String,
    start_ms: i64,
    rect: VlcRect,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut inner = lock(&state)?;
        imp::open(&mut inner, &window, &path, start_ms, rect)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, state, path, start_ms, rect);
        Err("libvlc playback is only available on macOS".to_string())
    }
}

#[tauri::command]
pub async fn vlc_set_rect(
    window: Window,
    state: State<'_, VlcPlayerState>,
    rect: VlcRect,
    visible: bool,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let inner = lock(&state)?;
        let view = imp::view_of(imp::session(&inner)?);
        drop(inner);
        imp::set_rect(&window, view, rect, visible)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, state, rect, visible);
        Ok(())
    }
}

#[tauri::command]
pub async fn vlc_status(state: State<'_, VlcPlayerState>) -> Result<VlcStatus, String> {
    #[cfg(target_os = "macos")]
    {
        let inner = lock(&state)?;
        Ok(imp::status(imp::session(&inner)?))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = state;
        Err("libvlc playback is only available on macOS".to_string())
    }
}

/// action: "play" | "pause" | "seek" | "volume" | "mute" | "unmute" | "rate" | "audioTrack" | "subtitleTrack"
#[tauri::command]
pub async fn vlc_control(
    state: State<'_, VlcPlayerState>,
    action: String,
    value: Option<f64>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let inner = lock(&state)?;
        let session = imp::session(&inner)?;
        let v = value.unwrap_or(0.0);
        match action.as_str() {
            "play" => imp::toggle_pause(session, false),
            "pause" => imp::toggle_pause(session, true),
            "seek" => imp::seek(session, v as i64),
            "volume" => imp::set_volume(session, v as i32),
            "mute" => imp::set_muted(session, true),
            "unmute" => imp::set_muted(session, false),
            "rate" => imp::set_rate(session, v as f32),
            "audioTrack" => imp::set_audio_track(session, v as i32),
            "subtitleTrack" => imp::set_subtitle_track(session, v as i32),
            other => return Err(format!("unknown libvlc action: {other}")),
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (state, action, value);
        Err("libvlc playback is only available on macOS".to_string())
    }
}

#[tauri::command]
pub async fn vlc_stop(window: Window, state: State<'_, VlcPlayerState>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut inner = lock(&state)?;
        imp::close(&mut inner, &window);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, state);
    }
    Ok(())
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use std::ffi::CString;
    use vlc::{sys, Media, MediaPlayer};

    // Needs VLC.app and ffmpeg; run with `cargo test vlc_smoke -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn vlc_smoke() {
        let sample = std::env::temp_dir().join("vlc_smoke_hevc.mkv");
        let ok = std::process::Command::new("ffmpeg")
            .args(["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=duration=20:size=320x240:rate=24",
                   "-f", "lavfi", "-i", "sine=duration=20", "-c:v", "libx265", "-c:a", "aac"])
            .arg(&sample)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        assert!(ok, "ffmpeg could not create the sample");

        std::env::set_var("VLC_PLUGIN_PATH", "/Applications/VLC.app/Contents/MacOS/plugins");
        let args: Vec<CString> = ["--vout=dummy", "--aout=dummy", "--no-xlib"]
            .iter()
            .map(|a| CString::new(*a).unwrap())
            .collect();
        let argv: Vec<*const std::os::raw::c_char> = args.iter().map(|a| a.as_ptr()).collect();
        let raw = unsafe { sys::libvlc_new(argv.len() as i32, argv.as_ptr()) };
        assert!(!raw.is_null(), "libvlc_new failed");
        let instance = unsafe { std::mem::transmute::<*mut sys::libvlc_instance_t, vlc::Instance>(raw) };

        let media = Media::new_path(&instance, &sample).expect("media");
        let player = MediaPlayer::new(&instance).expect("player");
        player.set_media(&media);
        player.play().unwrap();
        std::thread::sleep(std::time::Duration::from_secs(2));
        println!("state={:?} len={:?}", player.state(), player.get_media().and_then(|m| m.duration()));
        player.set_time(15_000);
        std::thread::sleep(std::time::Duration::from_secs(1));
        let t = player.get_time().unwrap_or(0);
        println!("time after seek = {t}");
        assert!(t >= 14_000, "seek did not land near 15s");
        assert!(player.get_media().and_then(|m| m.duration()).unwrap_or(0) > 19_000);
        player.stop();
    }
}

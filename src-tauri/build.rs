#[cfg(target_os = "macos")]
use std::path::PathBuf;

// Directory holding libvlc.dylib / libvlccore.dylib, used for linking and the dev-time rpath.
// Override with VLC_LIB_DIR; otherwise the lib copied by scripts/prepare-vlc.cjs, then VLC.app.
#[cfg(target_os = "macos")]
fn find_vlc_lib_dir() -> Option<PathBuf> {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let mut candidates = Vec::new();
    if let Ok(dir) = std::env::var("VLC_LIB_DIR") {
        candidates.push(PathBuf::from(dir));
    }
    candidates.push(manifest.join("vlc").join("lib"));
    candidates.push(PathBuf::from("/Applications/VLC.app/Contents/MacOS/lib"));
    candidates.into_iter().find(|d| d.join("libvlc.dylib").exists())
}

fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-env-changed=VLC_LIB_DIR");
        match find_vlc_lib_dir() {
            Some(dir) => {
                println!("cargo:rustc-link-search=native={}", dir.display());
                // Dev builds load libvlc from where it was found; packaged apps ship it in Resources/vlc/lib
                println!("cargo:rustc-link-arg=-Wl,-rpath,{}", dir.display());
                println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Resources/vlc/lib");
            }
            None => panic!(
                "libvlc not found. Install VLC.app (https://www.videolan.org/vlc/), run `node scripts/prepare-vlc.cjs`, or set VLC_LIB_DIR to the folder containing libvlc.dylib"
            ),
        }
    }
    tauri_build::build();
}

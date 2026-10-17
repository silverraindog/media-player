/**
 * Optional helper script to download pre-compiled FFmpeg & FFprobe binaries
 * for the current host architecture into src-tauri/binaries/
 *
 * Usage: node scripts/download-ffmpeg.cjs
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const binariesDir = path.join(rootDir, 'src-tauri', 'binaries');

if (!fs.existsSync(binariesDir)) {
  fs.mkdirSync(binariesDir, { recursive: true });
}

const platform = os.platform(); // 'darwin', 'win32', 'linux'
const arch = os.arch(); // 'arm64', 'x64'

console.log(`[FFmpeg Downloader] Detected host platform: ${platform} (${arch})`);

// Calculate target triple for Tauri sidecar
let targetTriple = '';
if (platform === 'darwin') {
  targetTriple = arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
} else if (platform === 'win32') {
  targetTriple = arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
} else if (platform === 'linux') {
  targetTriple = arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
}

console.log(`[FFmpeg Downloader] Target triple: ${targetTriple}`);

const ext = platform === 'win32' ? '.exe' : '';
const ffmpegTargetName = `ffmpeg-${targetTriple}${ext}`;
const ffprobeTargetName = `ffprobe-${targetTriple}${ext}`;

const ffmpegDest = path.join(binariesDir, ffmpegTargetName);
const ffprobeDest = path.join(binariesDir, ffprobeTargetName);

// Check if system FFmpeg is available and can be copied or linked
function tryCopySystemFfmpeg() {
  try {
    let sysFfmpeg = '';
    let sysFfprobe = '';
    if (platform === 'darwin' || platform === 'linux') {
      sysFfmpeg = execSync('which ffmpeg 2>/dev/null || true').toString().trim();
      sysFfprobe = execSync('which ffprobe 2>/dev/null || true').toString().trim();
      if (!sysFfmpeg && fs.existsSync('/opt/homebrew/bin/ffmpeg')) {
        sysFfmpeg = '/opt/homebrew/bin/ffmpeg';
      }
      if (!sysFfprobe && fs.existsSync('/opt/homebrew/bin/ffprobe')) {
        sysFfprobe = '/opt/homebrew/bin/ffprobe';
      }
    } else if (platform === 'win32') {
      sysFfmpeg = execSync('where ffmpeg.exe 2>nul || true').toString().trim().split('\r\n')[0];
      sysFfprobe = execSync('where ffprobe.exe 2>nul || true').toString().trim().split('\r\n')[0];
    }

    if (sysFfmpeg && fs.existsSync(sysFfmpeg)) {
      console.log(`[FFmpeg Downloader] Copying system FFmpeg (${sysFfmpeg}) -> ${ffmpegDest}`);
      fs.copyFileSync(sysFfmpeg, ffmpegDest);
      fs.chmodSync(ffmpegDest, 0o755);
    }
    if (sysFfprobe && fs.existsSync(sysFfprobe)) {
      console.log(`[FFmpeg Downloader] Copying system FFprobe (${sysFfprobe}) -> ${ffprobeDest}`);
      fs.copyFileSync(sysFfprobe, ffprobeDest);
      fs.chmodSync(ffprobeDest, 0o755);
    }
  } catch (err) {
    console.warn('[FFmpeg Downloader] Could not copy system ffmpeg:', err.message);
  }
}

tryCopySystemFfmpeg();

if (fs.existsSync(ffmpegDest)) {
  console.log(`[FFmpeg Downloader] ✅ Successfully prepared ${ffmpegTargetName}`);
} else {
  console.log(`[FFmpeg Downloader] ℹ️ Sidecar binaries are optional. If not present, SambaVault uses system FFmpeg (Homebrew / PATH) or in-browser Matroska streaming.`);
}

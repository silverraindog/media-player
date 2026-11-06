// Copies libvlc and its plugins into src-tauri/vlc so Tauri bundles them as app resources.
// Source defaults to VLC.app; override with VLC_APP_DIR (path to the Contents/MacOS folder).
const fs = require('fs');
const os = require('os');
const path = require('path');

const destination = path.resolve(__dirname, '..', 'src-tauri', 'vlc');
const source = process.env.VLC_APP_DIR || '/Applications/VLC.app/Contents/MacOS';

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });

if (os.platform() !== 'darwin') {
  // libvlc playback is macOS-only; keep the resource folder non-empty so bundling succeeds
  fs.writeFileSync(path.join(destination, '.keep'), '');
  console.log('Skipping libvlc bundling (macOS only).');
  process.exit(0);
}

const libSource = path.join(source, 'lib');
const pluginSource = path.join(source, 'plugins');
if (!fs.existsSync(path.join(libSource, 'libvlc.dylib')) || !fs.existsSync(pluginSource)) {
  console.error(`libvlc not found in ${source}. Install VLC.app or set VLC_APP_DIR.`);
  process.exit(1);
}

fs.cpSync(libSource, path.join(destination, 'lib'), { recursive: true, verbatimSymlinks: true });
fs.cpSync(pluginSource, path.join(destination, 'plugins'), { recursive: true, verbatimSymlinks: true });
console.log(`Bundled libvlc from ${source} into ${destination}`);

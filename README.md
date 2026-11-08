# Samba Media Vault & Metadata Downloader

**SambaVault** is a cross-platform media metadata manager, downloader, and Samba (SMB) network share synchronization hub for Movies, TV Series, and Music Albums. Built with React, TypeScript, Tailwind CSS, Express, and SQLite, it offers seamless network share exploration, automated metadata retrieval, synopses, and robust watch progress tracking.

---

## 🌟 Core Features

- **Media Vault Management**: Organize and catalog Movies, TV Series, and Music Albums with rich metadata (ratings, genres, release years, cover artwork, and director/artist info).
- **Embedded SQLite Persistence**: Reliable local storage for titles, synopses, custom tags, and episode watch progress.
- **Samba (SMB) Share Sync & Mount Hub**: Connect to local or remote SMB network shares, view folder trees, sync media files, and generate native OS mount commands (`mount_smbfs` for macOS, UNC paths for Windows).
- **Metadata Downloader**: Search and fetch professional posters, backdrops, synopses, cast lists, and tracklists.
- **Fetch All library metadata**: In Web Search & Categorize, open **Missing & Unfetched** and select **Fetch All** to check items missing a synopsis or poster. Items that already have both appear under **Has metadata**, where they can be reviewed or manually matched. Known category folder labels are excluded without removing anything from the library; standalone files with the same names remain eligible. Existing metadata and local playback information are preserved. A no-match result can also mean providers were unavailable; retry or use manual matching. Stopping or closing the dialog stops the batch after any current save.
- **Universe Matcher**: From All Media, open **Universe Matcher** and select **Match library**. It sends cleaned movie and series titles to TMDB, uses movie collections and a small curated cross-media mapping, and leaves uncertain matches for review. Choose a suggested title, or enter a universe name to create or change a virtual group. Manual assignments and removals are kept on subsequent runs. This does not move or delete files; albums are excluded. Results and overrides are stored in the backend data directory. This product uses the TMDB API but is not endorsed or certified by TMDB.
- **Series Watch Progress Tracker**: Track seasons, episodes, and completed watch states across your TV library.
- **Cross-Platform Desktop Bundling**: Native Tauri integration for macOS (`.dmg`, `.app`) and Windows (`.msi`, `.exe`) via GitHub Actions.

---

## 🚀 Getting Started (Local Development)

### Prerequisites
- Node.js (v18+)
- npm

### Installation & Run
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/samba-media-vault.git
   cd samba-media-vault
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server (runs Express backend + Vite frontend on port 3000):
   ```bash
   npm run dev
   ```

4. Open your browser at **`http://localhost:3000`**.

### TMDB setup

Obtain a TMDB **API Read Access Token** (not the shorter API key) and enter it under Settings → API keys. The same section supports OMDb and Gemini keys. Saved values take effect immediately, override environment values, and are not displayed again. Removing a saved value restores any environment value. Settings are available only from the computer running the backend. Keys are stored unencrypted in `~/.media-player/api-keys.json`, or in `SAMBA_VAULT_DATA_DIR` when configured, with owner-only file permissions. Protect the file and do not include it in backups or share it.

Alternatively, set `TMDB_READ_ACCESS_TOKEN` in the backend environment or in `~/.media-player/.env` (or `.env` inside `SAMBA_VAULT_DATA_DIR`), then restart the backend. `.env.example` is only a template and is not loaded. Existing environment variables and the project `.env` take precedence over the private `.env`; a saved Settings value takes precedence over all of them. The desktop app inherits environment variables from its launcher. Never commit or share tokens. TMDB requires attribution and its own usage terms apply.

### TVMaze and OMDb search

The categorizer and Universe Matcher provide an additional search for reviewing TVMaze and OMDb results. TVMaze searches TV series without a key. OMDb searches movies and series and requires your own `OMDB_API_KEY` in Settings or the backend environment as described above. These searches do not automatically change metadata or universe assignments, and neither provider establishes general universe relationships.

In **Web Search & Media Categorizer → Missing & Unfetched**, Fetch All displays a per-item diagnostic log with provider outcomes, returned titles and years, available fields, and reasons a match was rejected. It uses OMDb, TVMaze for series, and iTunes fallbacks, not TMDB. The log is cleared on the next Fetch All run and contains library titles; review it before sharing.

---

## 📦 Production Build

To build the Tauri desktop app with its backend, Node.js runtime, frontend assets, and media tools bundled:
```bash
npm run tauri -- build
```

The packaged app starts the local backend automatically and stops it when the app exits. Desktop release builds require FFmpeg and FFprobe on the build machine. `npm run dev` remains the development command and starts the backend alongside Vite.

---

## 🤖 GitHub Actions CI/CD & Automated Release Tags

This repository includes an automated GitHub Actions release workflow in `.github/workflows/release.yml` with cross-platform desktop bundling for **macOS** (`.dmg`), **Windows** (`.msi`), and **Linux** (`.deb`, `.AppImage`).

### Release Versioning (`0.0.1` → next push `0.0.2`):
- The header displays the version embedded in the running app, not the latest GitHub release. Release builds synchronize this version to the selected release tag; local builds use the version in `src/version.ts`. Click the badge to open version settings. A differing backend version is shown as a mismatch, not as an available update.
- **Automated Push Tagging**: Whenever you push code to `main`, GitHub Actions automatically:
  1. Inspects the latest release tag in the repository.
  2. Bumps the patch version: `0.0.1` on first release, then next push `0.0.2`, `0.0.3`, etc.
  3. Tags the commit on GitHub and creates the GitHub Release with the version tag (`0.0.1`, `0.0.2`).
  4. Automatically synchronizes `package.json` and `src-tauri/tauri.conf.json`.
  5. Compiles and uploads native desktop bundles for macOS, Windows, and Linux to the release assets.

- **Manual Tag Release**: You can also push custom release tags directly:
  ```bash
  git tag 0.0.1
  git push origin 0.0.1
  ```
  Or using `v` prefix:
  ```bash
  git tag v0.0.2
  git push origin v0.0.2
  ```

- **Local Version Bump Helpers**:
  ```bash
  npm run bump:patch    # Increments patch (e.g. 0.0.1 -> 0.0.2) across all files
  npm run bump:minor    # Increments minor (e.g. 0.0.2 -> 0.1.0)
  npm run bump:major    # Increments major (e.g. 0.1.0 -> 1.0.0)
  npm run version:sync 0.0.3  # Syncs all files to explicit version
  ```

---

## 📁 Project Structure

- `/src`: Frontend React application (Components, Views, State management, Tailwind CSS styling)
- `/server.ts`: Express backend API & SQLite database service
- `/src-tauri`: Tauri desktop configuration and Rust native bridge
- `/.github/workflows`: CI/CD release pipeline
- `/metadata.json`: Application metadata and capabilities

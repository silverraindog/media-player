# Samba Media Vault & Metadata Downloader

**SambaVault** is a cross-platform media metadata manager, downloader, and Samba (SMB) network share synchronization hub for Movies, TV Series, and Music Albums. Built with React, TypeScript, Tailwind CSS, Express, and SQLite, it offers seamless network share exploration, automated metadata retrieval, synopses, and robust watch progress tracking.

---

## 🌟 Core Features

- **Media Vault Management**: Organize and catalog Movies, TV Series, and Music Albums with rich metadata (ratings, genres, release years, cover artwork, and director/artist info).
- **Embedded SQLite Persistence**: Reliable local storage for titles, synopses, custom tags, and episode watch progress.
- **Samba (SMB) Share Sync & Mount Hub**: Connect to local or remote SMB network shares, view folder trees, sync media files, and generate native OS mount commands (`mount_smbfs` for macOS, UNC paths for Windows).
- **Metadata Downloader**: Search and fetch professional posters, backdrops, synopses, cast lists, and tracklists.
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

---

## 📦 Production Build

To compile the application into a standalone production server bundle:
```bash
npm run build
npm start
```

---

## 🤖 GitHub Actions CI/CD & Automated Release Tags

This repository includes an automated GitHub Actions release workflow in `.github/workflows/release.yml` with cross-platform desktop bundling for **macOS** (`.dmg`), **Windows** (`.msi`), and **Linux** (`.deb`, `.AppImage`).

### Release Versioning (`0.0.1` → next push `0.0.2`):
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

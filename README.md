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

## 🤖 GitHub Actions CI/CD (Tauri Desktop Bundling)

This repository includes a pre-configured GitHub Actions workflow in `.github/workflows/release.yml` that automatically builds native desktop installers for **macOS** and **Windows** using Tauri and Rust.

To build installers:
1. Push your code to GitHub (`main` or `master` branch).
2. Navigate to the **Actions** tab in your GitHub repository.
3. Once the workflow completes, download your `.dmg` (macOS) or `.msi/.exe` (Windows) installer binaries from the workflow artifacts.

---

## 📁 Project Structure

- `/src`: Frontend React application (Components, Views, State management, Tailwind CSS styling)
- `/server.ts`: Express backend API & SQLite database service
- `/src-tauri`: Tauri desktop configuration and Rust native bridge
- `/.github/workflows`: CI/CD release pipeline
- `/metadata.json`: Application metadata and capabilities

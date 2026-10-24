#!/usr/bin/env bash
set -e

echo "🧹 1) Removing node_modules, package-lock.json, dist, and target..."
rm -rf node_modules package-lock.json dist src-tauri/target

echo "🗑️ 2) Clearing npm cache..."
npm cache clean --force

echo "📦 3) Running npm install (--include=optional --force)..."
npm install --include=optional --force

echo "🚀 4) Attempting npm run tauri build..."
npm run tauri build

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// Retrieve target version from argument or fallback to package.json
let targetVersion = process.argv[2];
const commitSha = process.argv[3] || 'local-dev';
const buildDate = process.argv[4] || new Date().toISOString();

const packageJsonPath = path.join(rootDir, 'package.json');
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const tauriCargoPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
const rootCargoPath = path.join(rootDir, 'Cargo.toml');
const versionTsPath = path.join(rootDir, 'src', 'version.ts');
const packageLockPath = path.join(rootDir, 'package-lock.json');
const publicDir = path.join(rootDir, 'public');
const versionJsonPath = path.join(publicDir, 'version.json');

if (!targetVersion) {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    targetVersion = pkg.version;
  } catch (err) {
    targetVersion = '0.0.1';
  }
}

// Clean any leading 'v'
targetVersion = targetVersion.replace(/^v/, '').trim();

if (!/^\d+\.\d+\.\d+.*$/.test(targetVersion)) {
  console.error(`[Error] Invalid version format: "${targetVersion}". Expected semver like "0.0.1" or "0.0.2".`);
  process.exit(1);
}

console.log(`\n📦 Synchronizing project release version to: ${targetVersion}`);
console.log(`  Commit SHA: ${commitSha}`);
console.log(`  Build Date: ${buildDate}`);

// 0. Generate public/version.json
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const versionData = {
  version: targetVersion,
  commit: commitSha,
  buildDate: buildDate,
};

fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2) + '\n');
console.log(`  ✓ Generated public/version.json`);

// 1. Update package.json
if (fs.existsSync(packageJsonPath)) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  pkg.version = targetVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`  ✓ Updated package.json -> version "${targetVersion}"`);
}

// 1.1 Update package-lock.json
if (fs.existsSync(packageLockPath)) {
  try {
    const lock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
    lock.version = targetVersion;
    if (lock.packages && lock.packages['']) {
      lock.packages[''].version = targetVersion;
    }
    fs.writeFileSync(packageLockPath, JSON.stringify(lock, null, 2) + '\n');
    console.log(`  ✓ Updated package-lock.json -> version "${targetVersion}"`);
  } catch (err) {
    console.warn(`  ⚠ Could not update package-lock.json: ${err.message}`);
  }
}

// 2. Update src-tauri/tauri.conf.json
if (fs.existsSync(tauriConfPath)) {
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  if (tauriConf.package) {
    tauriConf.package.version = targetVersion;
  }
  fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
  console.log(`  ✓ Updated src-tauri/tauri.conf.json -> version "${targetVersion}"`);
}

// 3. Update src-tauri/Cargo.toml
if (fs.existsSync(tauriCargoPath)) {
  let cargoContent = fs.readFileSync(tauriCargoPath, 'utf8');
  cargoContent = cargoContent.replace(
    /(\[package\][\s\S]*?version\s*=\s*)"[^"]+"/,
    `$1"${targetVersion}"`
  );
  fs.writeFileSync(tauriCargoPath, cargoContent);
  console.log(`  ✓ Updated src-tauri/Cargo.toml -> version "${targetVersion}"`);
}

// 4. Update root Cargo.toml (if present)
if (fs.existsSync(rootCargoPath)) {
  let rootCargo = fs.readFileSync(rootCargoPath, 'utf8');
  rootCargo = rootCargo.replace(
    /(\[package\][\s\S]*?version\s*=\s*)"[^"]+"/,
    `$1"${targetVersion}"`
  );
  fs.writeFileSync(rootCargoPath, rootCargo);
  console.log(`  ✓ Updated Cargo.toml -> version "${targetVersion}"`);
}

// 5. Update src/version.ts
if (fs.existsSync(versionTsPath)) {
  let tsContent = fs.readFileSync(versionTsPath, 'utf8');
  tsContent = tsContent.replace(
    /export const APP_VERSION = '[^']+';/,
    `export const APP_VERSION = '${targetVersion}';`
  );
  tsContent = tsContent.replace(
    /export const APP_RELEASE_TAG = '[^']+';/,
    `export const APP_RELEASE_TAG = '${targetVersion}';`
  );
  fs.writeFileSync(versionTsPath, tsContent);
  console.log(`  ✓ Updated src/version.ts -> version "${targetVersion}"`);
}

console.log(`✨ All configuration files synchronized to version ${targetVersion}.\n`);

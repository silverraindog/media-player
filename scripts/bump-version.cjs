const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');

const bumpType = process.argv[2] || 'patch';

let currentVersion = '0.0.1';
try {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (pkg.version && pkg.version !== '0.0.0') {
    currentVersion = pkg.version.replace(/^v/, '');
  }
} catch (e) {
  currentVersion = '0.0.1';
}

let nextVersion = '';

if (/^\d+\.\d+\.\d+.*$/.test(bumpType)) {
  nextVersion = bumpType.replace(/^v/, '');
} else {
  const parts = currentVersion.split('.').map(n => parseInt(n, 10));
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    parts[0] = parts[0] || 0;
    parts[1] = parts[1] || 0;
    parts[2] = parts[2] || 1;
  }

  if (bumpType === 'major') {
    parts[0] += 1;
    parts[1] = 0;
    parts[2] = 0;
  } else if (bumpType === 'minor') {
    parts[1] += 1;
    parts[2] = 0;
  } else {
    // Default to patch: e.g. 0.0.1 -> 0.0.2
    parts[2] += 1;
  }
  nextVersion = `${parts[0]}.${parts[1]}.${parts[2]}`;
}

console.log(`\n🚀 Bumping release version: ${currentVersion} -> ${nextVersion} (${bumpType})`);

// Run sync script
try {
  execSync(`node "${path.join(__dirname, 'sync-version.cjs')}" "${nextVersion}"`, {
    stdio: 'inherit',
    cwd: rootDir,
  });
} catch (e) {
  console.error('Failed to synchronize version:', e.message);
  process.exit(1);
}

// Check if git is available to suggest or create tag
try {
  const gitStatus = execSync('git status --porcelain', { cwd: rootDir, stdio: 'pipe' }).toString();
  console.log(`\n💡 To push this release tag to GitHub, run:`);
  console.log(`   git commit -am "chore(release): bump version to ${nextVersion}"`);
  console.log(`   git tag ${nextVersion}`);
  console.log(`   git push origin main --tags`);
} catch (e) {
  console.log(`\n💡 Git tag ready: ${nextVersion}`);
  console.log(`   When pushed to GitHub, GitHub Actions will build and release desktop binaries for tag "${nextVersion}".`);
}

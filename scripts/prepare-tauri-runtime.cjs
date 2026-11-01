const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const runtimeDir = path.join(rootDir, 'src-tauri', 'backend-runtime');
const backendBundle = path.join(rootDir, 'dist', 'server.cjs');
const frontendBundle = path.join(rootDir, 'dist-frontend');
const nodeVersion = '22.23.4';

function getTargetTriple() {
  const platform = os.platform();
  const arch = os.arch();
  const triples = {
    darwin: {
      arm64: 'aarch64-apple-darwin',
      x64: 'x86_64-apple-darwin',
    },
    linux: {
      arm64: 'aarch64-unknown-linux-gnu',
      x64: 'x86_64-unknown-linux-gnu',
    },
    win32: {
      x64: 'x86_64-pc-windows-msvc',
      arm64: 'aarch64-pc-windows-msvc',
    },
  };
  const triple = triples[platform]?.[arch];
  if (!triple) {
    throw new Error(`Unsupported backend runtime platform: ${platform}/${arch}`);
  }

  const requestedTriple = process.env.TAURI_ENV_TARGET_TRIPLE;
  if (requestedTriple && requestedTriple !== triple) {
    throw new Error(
      `Cannot package the host Node runtime for target ${requestedTriple}; build on the target platform (${triple}) or provide a matching runtime.`,
    );
  }

  return triple;
}

function findSystemBinary(name) {
  const executableName = os.platform() === 'win32' ? `${name}.exe` : name;
  const candidates = [
    process.env[`${name.toUpperCase()}_PATH`],
    path.join(path.dirname(process.execPath), executableName),
    `/opt/homebrew/bin/${executableName}`,
    `/usr/local/bin/${executableName}`,
    `/opt/local/bin/${executableName}`,
    `/usr/bin/${executableName}`,
    `/bin/${executableName}`,
    ...(process.env.PATH || '')
      .split(path.delimiter)
      .map((directory) => path.join(directory, executableName)),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  throw new Error(
    `Could not find ${executableName}. Install FFmpeg and FFprobe before creating a production app, or set ${name.toUpperCase()}_PATH.`,
  );
}

function isPlaceholderBinary(filePath) {
  if (!fs.existsSync(filePath)) return true;
  const header = fs.readFileSync(filePath).subarray(0, 16).toString('utf8').toLowerCase();
  return header.startsWith('#!') || header.startsWith('@echo off');
}

function copyExecutable(source, destination) {
  fs.copyFileSync(source, destination);
  fs.chmodSync(destination, 0o755);
}

function download(url, redirects = 0) {
  if (redirects > 5) {
    return Promise.reject(new Error(`Too many redirects downloading ${url}`));
  }
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        resolve(download(new URL(response.headers.location, url).toString(), redirects + 1));
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed (${response.statusCode}): ${url}`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function prepareNodeRuntime(destination) {
  const platformNames = {
    darwin: 'darwin',
    linux: 'linux',
    win32: 'win',
  };
  const archNames = {
    arm64: 'arm64',
    x64: 'x64',
  };
  const archivePlatform = platformNames[os.platform()];
  const archiveArch = archNames[os.arch()];
  const archiveExtension = os.platform() === 'win32' ? 'zip' : 'tar.gz';
  const archiveName = `node-v${nodeVersion}-${archivePlatform}-${archiveArch}.${archiveExtension}`;
  const archiveUrl = `https://nodejs.org/dist/v${nodeVersion}/${archiveName}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sambavault-node-'));

  try {
    const [checksumList, archive] = await Promise.all([
      download(`https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt`),
      download(archiveUrl),
    ]);
    const checksumLine = checksumList
      .toString('utf8')
      .split(/\r?\n/)
      .find((line) => line.endsWith(`  ${archiveName}`));
    if (!checksumLine) {
      throw new Error(`Node checksum is missing for ${archiveName}`);
    }

    const expectedHash = checksumLine.split(/\s+/)[0];
    const actualHash = crypto.createHash('sha256').update(archive).digest('hex');
    if (actualHash !== expectedHash) {
      throw new Error(`Node runtime checksum verification failed for ${archiveName}`);
    }

    const archivePath = path.join(tempDir, archiveName);
    fs.writeFileSync(archivePath, archive);
    const extractionDir = path.join(tempDir, 'unpacked');
    fs.mkdirSync(extractionDir);
    const archiveRoot = `node-v${nodeVersion}-${archivePlatform}-${archiveArch}`;

    if (os.platform() === 'win32') {
      const quote = (value) => `'${value.replace(/'/g, "''")}'`;
      const result = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${quote(archivePath)} -DestinationPath ${quote(extractionDir)} -Force`],
        { stdio: 'inherit' },
      );
      if (result.status !== 0) {
        throw new Error('Could not extract the Node runtime archive with PowerShell');
      }
      fs.copyFileSync(path.join(extractionDir, archiveRoot, 'node.exe'), destination);
    } else {
      const result = spawnSync(
        'tar',
        ['-xzf', archivePath, '-C', extractionDir, '--strip-components=1', `${archiveRoot}/bin/node`],
        { stdio: 'inherit' },
      );
      if (result.status !== 0) {
        throw new Error('Could not extract the Node runtime archive with tar');
      }
      fs.copyFileSync(path.join(extractionDir, 'bin', 'node'), destination);
      fs.chmodSync(destination, 0o755);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const targetTriple = getTargetTriple();
  const extension = os.platform() === 'win32' ? '.exe' : '';
  const ffmpegSidecar = path.join(
    rootDir,
    'src-tauri',
    'binaries',
    `ffmpeg-${targetTriple}${extension}`,
  );
  const ffprobeSidecar = path.join(
    rootDir,
    'src-tauri',
    'binaries',
    `ffprobe-${targetTriple}${extension}`,
  );

  if (!fs.existsSync(backendBundle)) {
    throw new Error(`Backend bundle was not built: ${backendBundle}`);
  }
  if (!fs.existsSync(path.join(frontendBundle, 'index.html'))) {
    throw new Error(`Frontend bundle was not built: ${frontendBundle}`);
  }

  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.copyFileSync(backendBundle, path.join(runtimeDir, 'server.cjs'));
  fs.cpSync(frontendBundle, path.join(runtimeDir, 'dist-frontend'), { recursive: true });

  const nodeExecutable = path.join(runtimeDir, os.platform() === 'win32' ? 'node.exe' : 'node');
  const existingNodeVersion = fs.existsSync(nodeExecutable)
    ? spawnSync(nodeExecutable, ['--version'], { encoding: 'utf8' }).stdout?.trim()
    : null;
  if (existingNodeVersion !== `v${nodeVersion}`) {
    await prepareNodeRuntime(nodeExecutable);
  }

  for (const [name, sidecar] of [['ffmpeg', ffmpegSidecar], ['ffprobe', ffprobeSidecar]]) {
    const source = fs.existsSync(sidecar) && fs.statSync(sidecar).isFile() && !isPlaceholderBinary(sidecar)
      ? sidecar
      : findSystemBinary(name);
    const destination = path.join(runtimeDir, `${name}${extension}`);
    copyExecutable(source, destination);
  }

  console.log(`[Tauri Runtime] Prepared packaged Node backend for ${targetTriple}.`);
}

main().catch((error) => {
  console.error(`[Tauri Runtime] ${error.message}`);
  process.exitCode = 1;
});

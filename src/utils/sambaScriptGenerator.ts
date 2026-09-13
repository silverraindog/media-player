import { SambaConfig } from '../types';

export interface OsMountInstructions {
  platform: 'macos' | 'linux' | 'windows';
  title: string;
  quickCommand: string;
  terminalScript: string;
  guiSteps: string[];
  fstabOrPermanentConfig?: string;
  fileExtension: string;
  downloadFilename: string;
}

export function generateSambaMountConfigs(config: SambaConfig): {
  macos: OsMountInstructions;
  linux: OsMountInstructions;
  windows: OsMountInstructions;
} {
  const { server, share, username, password, isGuest, port } = config;
  const safeUser = isGuest ? 'guest' : username || 'user';
  const safePass = isGuest ? '' : password || 'password';

  // macOS
  const macUri = isGuest
    ? `smb://${server}/${share}`
    : `smb://${encodeURIComponent(safeUser)}:${encodeURIComponent(safePass)}@${server}/${share}`;
  const macMountPoint = `/Volumes/${share}`;
  const macTerminalScript = `#!/bin/bash
# ==============================================================================
# Samba (SMB) Mount Script for macOS
# Share: //${server}/${share}
# ==============================================================================

echo "Connecting to Samba Share on macOS..."

# Method 1: Using macOS Finder open command
open "${macUri}"

# Method 2: Command-line mount_smbfs to dedicated mountpoint
# mkdir -p "${macMountPoint}"
# mount_smbfs "//${safeUser}:${safePass}@${server}/${share}" "${macMountPoint}"

if [ $? -eq 0 ]; then
  echo "✅ Successfully mounted //${server}/${share} to ${macMountPoint}"
else
  echo "❌ Mount failed. Check network connectivity and credentials."
fi
`;

  // Linux (CIFS)
  const linuxMountPoint = `/mnt/${share}`;
  const linuxCredentialsFile = `/etc/samba/credentials_${share}`;
  const linuxTerminalScript = `#!/bin/bash
# ==============================================================================
# Samba (CIFS) Mount Script for Linux (Ubuntu/Debian/Arch/Fedora)
# Share: //${server}/${share}
# ==============================================================================

# Ensure cifs-utils is installed
if ! command -v mount.cifs &> /dev/null; then
  echo "Installing cifs-utils..."
  if command -v apt-get &> /dev/null; then
    sudo apt-get update && sudo apt-get install -y cifs-utils smbclient
  elif command -v dnf &> /dev/null; then
    sudo dnf install -y cifs-utils samba-client
  elif command -v pacman &> /dev/null; then
    sudo pacman -S --noconfirm cifs-utils smbclient
  fi
fi

# Create mount destination
sudo mkdir -p "${linuxMountPoint}"

echo "Mounting //${server}/${share} to ${linuxMountPoint}..."
${
  isGuest
    ? `sudo mount -t cifs "//${server}/${share}" "${linuxMountPoint}" -o guest,uid=$(id -u),gid=$(id -g),iocharset=utf8,vers=3.0`
    : `sudo mount -t cifs "//${server}/${share}" "${linuxMountPoint}" -o username="${safeUser}",password="${safePass}",uid=$(id -u),gid=$(id -g),iocharset=utf8,vers=3.0`
}

if [ $? -eq 0 ]; then
  echo "✅ Samba share mounted successfully at ${linuxMountPoint}"
  ls -lah "${linuxMountPoint}"
else
  echo "❌ Mount failed. Ensure server IP (${server}) and port (${port}) are reachable."
fi
`;

  const linuxFstab = isGuest
    ? `//${server}/${share} ${linuxMountPoint} cifs guest,uid=1000,gid=1000,iocharset=utf8,vers=3.0 0 0`
    : `//${server}/${share} ${linuxMountPoint} cifs credentials=${linuxCredentialsFile},uid=1000,gid=1000,iocharset=utf8,vers=3.0 0 0`;

  // Windows
  const winUncPath = `\\\\${server}\\${share}`;
  const winDriveLetter = 'Z:';
  const winBatchScript = `@echo off
:: ==============================================================================
:: Samba (SMB) Network Drive Map for Windows
:: Share: ${winUncPath}
:: ==============================================================================
title Samba Network Share Connect - ${share}
echo Connecting to Samba Share on Windows (${winUncPath})...

:: Remove any existing mapping on Z:
net use ${winDriveLetter} /delete /y >nul 2>&1

:: Map network drive
${
  isGuest
    ? `net use ${winDriveLetter} "${winUncPath}" /persistent:yes`
    : `net use ${winDriveLetter} "${winUncPath}" /user:"${safeUser}" "${safePass}" /persistent:yes`
}

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =======================================================
    echo [SUCCESS] Network drive mapped to ${winDriveLetter} successfully!
    echo Explorer is opening the media folder...
    echo =======================================================
    explorer.exe ${winDriveLetter}
) else (
    echo.
    echo [ERROR] Failed to map ${winUncPath}. Please check credentials and firewall.
)
pause
`;

  const winPowerShellScript = `# PowerShell Samba Connector
$remotePath = "${winUncPath}"
$driveLetter = "${winDriveLetter}"
$username = "${safeUser}"
$password = "${safePass}"

Write-Host "Mapping $remotePath to $driveLetter..." -ForegroundColor Cyan

${
  isGuest
    ? `New-SmbMapping -RemotePath $remotePath -LocalPath $driveLetter -Persistent $true`
    : `$secPassword = ConvertTo-SecureString $password -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential ($username, $secPassword)
New-SmbMapping -RemotePath $remotePath -LocalPath $driveLetter -UserName $username -Password $password -Persistent $true`
}

Write-Host "Drive mapped! Opening..." -ForegroundColor Green
Start-Process explorer.exe -ArgumentList $driveLetter
`;

  return {
    macos: {
      platform: 'macos',
      title: 'macOS (Finder & mount_smbfs)',
      quickCommand: `open "${macUri}"`,
      terminalScript: macTerminalScript,
      guiSteps: [
        'Open Finder on your Mac (or click Desktop).',
        'Press keyboard shortcut Command (⌘) + K (or Go → Connect to Server...).',
        `Enter Server Address: smb://${server}/${share}`,
        isGuest ? 'Select "Connect As Guest".' : `Select "Registered User", enter Username "${safeUser}" and Password.`,
        `Click "Connect". The share will appear under Locations in Finder sidebar at /Volumes/${share}.`
      ],
      fileExtension: 'command',
      downloadFilename: `mount_samba_${share}_macos.command`
    },
    linux: {
      platform: 'linux',
      title: 'Linux (CIFS / fstab / smbclient)',
      quickCommand: isGuest
        ? `sudo mount -t cifs "//${server}/${share}" "/mnt/${share}" -o guest,uid=$(id -u),gid=$(id -g),vers=3.0`
        : `sudo mount -t cifs "//${server}/${share}" "/mnt/${share}" -o username="${safeUser}",password="${safePass}",uid=$(id -u),gid=$(id -g),vers=3.0`,
      terminalScript: linuxTerminalScript,
      fstabOrPermanentConfig: linuxFstab,
      guiSteps: [
        'Open your file manager (Nautilus / Dolphin / Thunar).',
        'Click "+ Other Locations" (or press Ctrl + L).',
        `Enter address: smb://${server}/${share}`,
        isGuest ? 'Choose "Anonymous / Guest".' : `Choose "Registered User", enter Username "${safeUser}" and Domain "${config.workgroup}".`,
        'Click "Connect" to browse and transfer media directly.'
      ],
      fileExtension: 'sh',
      downloadFilename: `mount_samba_${share}_linux.sh`
    },
    windows: {
      platform: 'windows',
      title: 'Windows 10/11 (Map Network Drive & PowerShell)',
      quickCommand: isGuest
        ? `net use ${winDriveLetter} "${winUncPath}" /persistent:yes`
        : `net use ${winDriveLetter} "${winUncPath}" /user:"${safeUser}" "${safePass}" /persistent:yes`,
      terminalScript: winBatchScript,
      fstabOrPermanentConfig: winPowerShellScript,
      guiSteps: [
        'Press Windows Key + E to open File Explorer.',
        'Click "This PC" in the left sidebar.',
        'In the top ribbon, click "..." or "Map network drive".',
        `Select Drive letter (e.g. Z:) and enter Folder: ${winUncPath}`,
        isGuest ? 'Click Finish.' : 'Check "Connect using different credentials" and enter your username and password.',
        'Click Finish. The network drive will show under "Network locations".'
      ],
      fileExtension: 'bat',
      downloadFilename: `mount_samba_${share}_windows.bat`
    }
  };
}

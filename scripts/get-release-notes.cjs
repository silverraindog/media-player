const fs = require('fs');
const path = require('path');

const versionTsPath = path.join(__dirname, '..', 'src', 'version.ts');
const targetVersion = process.argv[2];

if (!fs.existsSync(versionTsPath)) {
  console.error('src/version.ts not found');
  process.exit(1);
}

const content = fs.readFileSync(versionTsPath, 'utf8');

// Simple regex to find the highlights for a version
// This assumes the structure in src/version.ts stays relatively consistent
const versionRegex = new RegExp(`version:\\s*'${targetVersion.replace(/\./g, '\\.')}',[\\s\\S]*?highlights:\\s*\\[([\\s\\S]*?)\\]`, 'm');
const match = content.match(versionRegex);

if (match && match[1]) {
  const highlights = match[1]
    .split(',')
    .map(h => h.trim().replace(/^['"]|['"]$/g, ''))
    .filter(h => h.length > 0)
    .map(h => `- ${h}`)
    .join('\n');
  
  console.log(`### Highlights for v${targetVersion}\n\n${highlights}`);
} else {
  console.log(`### Release v${targetVersion}\n\nAutomated desktop release.`);
}

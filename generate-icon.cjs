const fs = require('fs');
const zlib = require('zlib');

function createPng(width, height, r, g, b) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  const scanlineLength = 1 + width * 3;
  const rawData = Buffer.alloc(scanlineLength * height);
  for (let y = 0; y < height; y++) {
    rawData[y * scanlineLength] = 0;
    for (let x = 0; x < width; x++) {
      const idx = y * scanlineLength + 1 + x * 3;
      rawData[idx] = r;
      rawData[idx + 1] = g;
      rawData[idx + 2] = b;
    }
  }
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return ~crc >>> 0;
}

const crcTable = [];
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

const pngBuffer = createPng(512, 512, 15, 23, 42);
fs.writeFileSync('src-tauri/icon.png', pngBuffer);
console.log('Valid 512x512 PNG icon generated successfully.');

const { execSync } = require('child_process');
try {
  execSync('npx tauri icon src-tauri/icon.png', { stdio: 'inherit' });
  console.log('Tauri icon suite generated successfully.');
} catch (e) {
  console.warn('Failed to invoke tauri icon command automatically:', e.message);
}

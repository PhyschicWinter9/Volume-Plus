// Builds dist/volume-plus-v<version>.zip containing ONLY the runtime files (manifest.json, src/, icons/).
// Runs the manifest validator first. No dependencies (uses node:zlib; needs Node >= 22.2 for zlib.crc32).
// Usage: npm run pack
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';
import { execFileSync } from 'node:child_process';

execFileSync(process.execPath, ['scripts/validate-manifest.mjs'], { stdio: 'inherit' });

const version = JSON.parse(readFileSync('manifest.json', 'utf8')).version;

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p.split('\\').join('/'));
  }
};
files.push('manifest.json');
walk('src');
walk('icons');

const dosTime = 0, dosDate = (2026 - 1980) << 9 | 1 << 5 | 1; // fixed timestamp => reproducible zip
const local = [], central = [];
let offset = 0;
for (const f of files) {
  const data = readFileSync(f), comp = deflateRawSync(data, { level: 9 });
  const name = Buffer.from(posix.normalize(f)), crc = crc32(data);
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
  h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12); h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26);
  local.push(h, name, comp);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
  c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28);
  c.writeUInt32LE(offset, 42);
  central.push(c, name);
  offset += 30 + name.length + comp.length;
}
const cdSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);

mkdirSync('dist', { recursive: true });
const out = `dist/volume-plus-v${version}.zip`;
writeFileSync(out, Buffer.concat([...local, ...central, end]));
console.log(`${out}: ${files.length} files, ${statSync(out).size} bytes`);
files.forEach((f) => console.log('  ' + f));

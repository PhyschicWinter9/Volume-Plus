// Manifest / package validation: least privilege, referenced files exist, versions agree, no remote code.
// Usage: node scripts/validate-manifest.mjs   (exit 1 on any failure)
import { readFileSync, existsSync } from 'node:fs';

const errors = [];
const fail = (m) => errors.push(m);
const read = (p) => readFileSync(p, 'utf8');

const m = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));

if (m.manifest_version !== 3) fail('manifest_version must be 3');
if (m.version !== pkg.version) fail(`manifest version ${m.version} != package.json ${pkg.version}`);
if (!(parseInt(m.minimum_chrome_version, 10) >= 111)) fail('minimum_chrome_version must be >= 111 (world: MAIN content scripts)');

// Least privilege: the ONLY API permission is storage; the ONLY host is www.youtube.com.
if (JSON.stringify(m.permissions) !== '["storage"]') fail(`permissions must be exactly ["storage"], got ${JSON.stringify(m.permissions)}`);
if (JSON.stringify(m.host_permissions) !== '["https://www.youtube.com/*"]') fail('host_permissions must be only https://www.youtube.com/*');
if (m.optional_permissions || m.optional_host_permissions) fail('no optional permissions expected');
if (m.content_security_policy) fail('do not loosen the default extension CSP');
if (m.web_accessible_resources) fail('no web_accessible_resources expected');
if (m.externally_connectable) fail('externally_connectable must not be set');

const files = new Set([m.action?.default_popup, m.background?.service_worker, ...Object.values(m.icons || {})]);
for (const cs of m.content_scripts || []) {
  for (const f of cs.js || []) files.add(f);
  if (JSON.stringify(cs.matches) !== '["https://www.youtube.com/*"]') fail('content script matches must be only youtube.com');
}
for (const f of files) if (!f || !existsSync(f)) fail(`missing file referenced by manifest: ${f}`);

// MAIN-world script must come first and be the only MAIN one.
const main = (m.content_scripts || []).filter((c) => c.world === 'MAIN');
if (main.length !== 1 || main[0].run_at !== 'document_start' || main[0].js.join() !== 'src/injected.js') fail('exactly one MAIN-world script (src/injected.js @ document_start) expected');

// Chrome allows at most 4 suggested shortcuts.
const suggested = Object.values(m.commands || {}).filter((c) => c.suggested_key).length;
if (suggested > 4) fail(`${suggested} suggested shortcuts (max 4)`);
for (const [name, c] of Object.entries(m.commands || {})) if (!c.description) fail(`command ${name} lacks a description`);

// No remote code / fonts in extension pages and scripts.
for (const f of ['src/popup.html', 'src/popup.js', 'src/content.js', 'src/injected.js', 'src/background.js', 'src/lib/state.js', 'src/lib/settings.js', 'src/lib/audio-graph.js']) {
  const t = read(f);
  if (/<(script|link)[^>]+(src|href)=["']https?:/i.test(t)) fail(`${f}: external script/stylesheet`);
  if (/fonts\.googleapis|fonts\.gstatic/.test(t)) fail(`${f}: references Google Fonts`);
  if (/\beval\s*\(|new Function\s*\(/.test(t)) fail(`${f}: eval/new Function`);
  if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(t)) fail(`${f}: network API use (no telemetry allowed)`);
}

if (errors.length) { console.error('MANIFEST VALIDATION FAILED:\n - ' + errors.join('\n - ')); process.exit(1); }
console.log(`manifest OK: v${m.version}, permissions=${JSON.stringify(m.permissions)}, hosts=${JSON.stringify(m.host_permissions)}, ${suggested} suggested shortcuts, ${files.size} referenced files`);

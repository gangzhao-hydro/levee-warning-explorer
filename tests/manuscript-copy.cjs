const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const root = process.argv[2] || 'site';
const html = fs.readFileSync(root + '/index.html', 'utf8');
const app = fs.readFileSync(root + '/app.js', 'utf8');
assert(html.includes('aria-label="River Flood Emergence Explorer"'));
assert(html.includes('<title>River Flood Emergence Explorer ·'));
assert(html.includes('<span>RIVER FLOOD<span class="brand-sub">EMERGENCE EXPLORER</span></span>'));
assert(!html.includes('One event, two warning sequences'));
assert(html.includes('One shared RET, two warning sequences'));
assert(app.includes('one shared RET, two warning sequences'));
for (const phrase of [
  '20,000 synthetic 86-year historical sequences',
  'Years are resampled as blocks',
  'at least one threshold exceedance',
  'at least two of the 11 models',
  'upgrades, deterioration and structural failure are not represented',
  'not all tributary, pluvial, urban or interior drainage processes',
  'mean annual routed outflow',
  'equivalent depth over upstream catchment area'
]) assert(html.includes(phrase), phrase);
assert(!html.includes('pale gold'));
assert(html.includes('Windows starting in 2006–2014 cross the historical / SSP5-8.5 boundary.'));
const manifest = JSON.parse(fs.readFileSync(root + '/figures/manuscript-20261107.json'));
assert.equal(manifest.figures.length, 4);
for (const figure of manifest.figures) {
  const file = root + '/figures/' + figure.file;
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.subarray(0,4).toString(), 'RIFF');
  assert.equal(bytes.subarray(8,12).toString(), 'WEBP');
  assert.equal(bytes.length, figure.bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), figure.sha256);
  assert(bytes.length <= 4 * 1024 ** 2);
  assert(html.includes('src="figures/' + figure.file + '?v=manuscript-20261107"'));
}
console.log('PASS: current site name, manuscript-aligned definitions and scope, retained historical context, and all four current figure checksums.');

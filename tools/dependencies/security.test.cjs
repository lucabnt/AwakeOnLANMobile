'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

test('installs the reviewed local replacements rather than the vulnerable packages', () => {
  for (const [name, replacement] of [
    ['minimatch', '@awakeonlan/minimatch-compat'],
    ['image-size', '@awakeonlan/image-size-compat'],
    ['deepmerge', '@awakeonlan/deepmerge-hardened'],
  ]) {
    const metadata = JSON.parse(
      fs.readFileSync(path.join('node_modules', name, 'package.json'), 'utf8'),
    );
    assert.equal(metadata.name, replacement);
  }
});

test('minimatch keeps callable, named, constructor, defaults, and glob 7 APIs', async () => {
  const matcher = require('minimatch');
  assert.equal(matcher('src/App.tsx', '**/*.tsx'), true);
  assert.equal(matcher('src/App.tsx', '**/*.ts'), false);
  assert.equal(
    new matcher.Minimatch('**/*.tsx', { dot: true }).match(
      'src/.hidden/App.tsx',
    ),
    true,
  );
  assert.equal(matcher.defaults({ nocase: true })('APP.TSX', '*.tsx'), true);
  assert.deepEqual(matcher.braceExpand('{a,b}.tsx'), ['a.tsx', 'b.tsx']);
  assert.equal((await import('minimatch')).Minimatch, matcher.Minimatch);
  assert.ok(
    require('glob')
      .sync('src/**/*.tsx')
      .some(file => file.replace(/\\/g, '/') === 'src/App.tsx'),
  );
});

test('patched minimatch handles globparts amplification without hanging', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
    const { Minimatch } = require('minimatch');
    new Minimatch('**/../'.repeat(40) + 'x', { optimizationLevel: 2 }).match('x');
  `,
    ],
    { cwd: process.cwd(), timeout: 3000, encoding: 'utf8' },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

test('deepmerge does not poison the result prototype from either input', () => {
  const merge = require('deepmerge');
  const payload = JSON.parse(
    '{"__proto__":{"polluted":true},"nested":{"__proto__":{"polluted":true}}}',
  );
  for (const merged of [
    merge(payload, {}),
    merge({}, payload),
    merge(Object.create(null), payload),
  ]) {
    assert.equal(Object.getPrototypeOf(merged), Object.prototype);
    assert.equal(merged.polluted, undefined);
    assert.equal(Object.getPrototypeOf(merged.nested), Object.prototype);
    assert.equal(merged.nested.polluted, undefined);
  }
  assert.equal({}.polluted, undefined);
});

test('deepmerge retains array, symbol, custom merge, clone, and all semantics', () => {
  const merge = require('deepmerge');
  const symbol = Symbol('setting');
  const original = { nested: { keep: 1 }, items: [1], [symbol]: 'original' };
  const result = merge.all([
    original,
    { nested: { next: 2 }, items: [2], [symbol]: 'new' },
  ]);
  assert.deepEqual(result.nested, { keep: 1, next: 2 });
  assert.deepEqual(result.items, [1, 2]);
  assert.equal(result[symbol], 'new');
  assert.notEqual(result.nested, original.nested);
  assert.equal(merge({}, original, { clone: false }).nested, original.nested);
  assert.deepEqual(
    merge({ items: [1] }, { items: [2] }, { arrayMerge: (_, source) => source })
      .items,
    [2],
  );
  assert.deepEqual(
    merge(
      { nested: { a: 1 } },
      { nested: { b: 2 } },
      {
        customMerge: key =>
          key === 'nested' ? () => ({ custom: true }) : undefined,
      },
    ).nested,
    { custom: true },
  );
});

test('Metro can read PNG buffers and asset filenames through the corrected parsers', async () => {
  const imageSize = require('image-size');
  const png = fs.readFileSync(
    'fastlane/metadata/android/en-US/images/icon.png',
  );
  const expected = imageSize(png);
  assert.ok(expected.width > 0 && expected.height > 0);
  assert.deepEqual(
    imageSize('fastlane/metadata/android/en-US/images/icon.png'),
    expected,
  );
  assert.deepEqual(
    require('metro/src/Assets').getAssetSize('png', png, 'icon.png'),
    {
      width: expected.width,
      height: expected.height,
    },
  );
  const asset = await require('metro/src/Assets').getAssetData(
    path.resolve('fastlane/metadata/android/en-US/images/icon.png'),
    'icon.png',
    [],
    'android',
    '/assets',
  );
  assert.equal(asset.width, expected.width);
  assert.equal(asset.height, expected.height);
});

test('malformed ICNS chunks cannot hang the image parser', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
    const imageSize = require('image-size');
    const input = Buffer.alloc(16);
    input.write('icns', 0); input.writeUInt32BE(16, 4);
    input.write('ic07', 8); input.writeUInt32BE(0, 12);
    try { imageSize(input); } catch {}
  `,
    ],
    { cwd: process.cwd(), timeout: 3000, encoding: 'utf8' },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

test('updated XML parser preserves Android manifest attributes used by the CLI', () => {
  const { XMLParser } = require('fast-xml-parser');
  const xml = fs.readFileSync(
    'android/app/src/main/AndroidManifest.xml',
    'utf8',
  );
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
  assert.equal(
    parsed.manifest.application['@_android:name'],
    '.MainApplication',
  );
  assert.equal(
    parsed.manifest.application.activity['@_android:name'],
    '.MainActivity',
  );
});

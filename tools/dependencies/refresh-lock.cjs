'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// npm 11 can resolve directory overrides relative to a transitive consumer when
// updating an existing tree. Resolve in a clean directory to avoid stale metadata.
const root = path.resolve(__dirname, '../..');
const npmCli = process.env.npm_execpath;
if (!npmCli)
  throw new Error('Run this command with npm run refresh:dependencies.');
const tempBase = fs.realpathSync(os.tmpdir());
const temporary = fs.mkdtempSync(
  path.join(tempBase, 'awakeonlan-dependencies-'),
);
const nextLock = path.join(root, 'package-lock.json.next');

try {
  fs.copyFileSync(
    path.join(root, 'package.json'),
    path.join(temporary, 'package.json'),
  );
  fs.copyFileSync(path.join(root, '.npmrc'), path.join(temporary, '.npmrc'));
  fs.mkdirSync(path.join(temporary, 'tools'));
  fs.cpSync(
    path.join(root, 'tools/dependencies'),
    path.join(temporary, 'tools/dependencies'),
    { recursive: true },
  );
  const result = spawnSync(
    process.execPath,
    [
      npmCli,
      'install',
      '--package-lock-only',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ],
    { cwd: temporary, env: process.env, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      'Dependency resolution failed; the existing lockfile was preserved.',
    );
  const resolved = fs.readFileSync(path.join(temporary, 'package-lock.json'));
  JSON.parse(resolved); // Never replace the lockfile with partial output.
  fs.writeFileSync(nextLock, resolved);
  fs.renameSync(nextLock, path.join(root, 'package-lock.json'));
  console.log(
    'Lockfile refreshed. Run npm ci, tests, and the full audit before committing.',
  );
} finally {
  // Verify the resolved target before recursively removing this private scratch directory.
  const actual = fs.realpathSync(temporary);
  if (
    path.dirname(actual) !== tempBase ||
    !path.basename(actual).startsWith('awakeonlan-dependencies-')
  ) {
    throw new Error('Unexpected temporary path; cleanup stopped.');
  }
  fs.rmSync(actual, { recursive: true, force: true });
  if (fs.existsSync(nextLock)) fs.unlinkSync(nextLock);
}

import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { test } from 'node:test';
import { PATHWAY_ROOT, PATHWAY_FILES } from '../src/pathway.mjs';

const expectedFiles = [
  'access-state.mjs', 'app.mjs', 'calculations.mjs', 'clearance.mjs', 'design.mjs',
  'export.mjs', 'index.html', 'legacy-section.mjs', 'material-reference.mjs',
  'profile-visibility.mjs', 'section.mjs', 'solver.mjs', 'steel.mjs', 'style.css',
  'theme.css', 'theme.js', 'view.mjs', 'worker.mjs',
];

test('the authenticated Pathway manifest contains exactly the intended 18 files', async () => {
  assert.equal(PATHWAY_ROOT, '/private/tools/pathway/');
  assert.deepEqual([...PATHWAY_FILES].sort(), expectedFiles);
  assert.equal(new Set(PATHWAY_FILES).size, 18);
  const files = await readdir(new URL('../_assets/private/tools/pathway/', import.meta.url));
  assert.deepEqual(files.sort(), expectedFiles);
});

test('Wrangler always invokes authentication before assets and exposes no workers.dev or preview URL', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.assets.binding, 'ASSETS');
  assert.equal(config.assets.directory, './_assets');
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.assets.html_handling, 'none');
  assert.equal(config.assets.not_found_handling, 'none');
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.vars.SITE_ORIGIN, 'https://mehz.org');
  assert.deepEqual(config.routes, [{ pattern: 'mehz.org/private*', zone_name: 'mehz.org' }]);
});

test('the Pages source excludes private Worker assets and retains only a public redirect at the old tool path', async () => {
  const config = await readFile(new URL('../../_config.yml', import.meta.url), 'utf8');
  const exclusionBlock = config.match(/^exclude:\s*\r?\n((?:[ \t]+-\s+[^\r\n]+(?:\r?\n|$))*)/m)?.[1] || '';
  assert.match(exclusionBlock, /^\s+-\s+private-worker\/?\s*$/m);
  await assert.rejects(access(new URL('../../.nojekyll', import.meta.url)), { code: 'ENOENT' });
  const files = await readdir(new URL('../../tools/pathway/', import.meta.url));
  assert.deepEqual(files, ['index.html']);
  const redirect = await readFile(new URL('../../tools/pathway/index.html', import.meta.url), 'utf8');
  assert.ok(redirect.includes(PATHWAY_ROOT));
  assert.doesNotMatch(redirect, /<script\b|app\.mjs|id=["']scene["']/i);
});

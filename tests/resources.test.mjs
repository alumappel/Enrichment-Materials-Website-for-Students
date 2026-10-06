import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertData, isResourceUrl, resolveContentUrl, selectItems, TYPES } from '../src/core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readData = async () => assertData(JSON.parse(await readFile(resolve(root, 'data/content.json'), 'utf8')));

test('the actual content data validates and all local resource references point to nonempty files', async () => {
  const data = await readData();
  for (const item of data.items.filter(item => isResourceUrl(item.url))) {
    const pathname = decodeURIComponent(new URL(resolveContentUrl(item.url, 'https://example.org/')).pathname);
    const path = resolve(root, `.${pathname}`);
    assert.ok(path.startsWith(resolve(root, 'resources') + sep));
    const info = await stat(path);
    assert.ok(info.isFile() && info.size > 0, `${item.id}: ${item.url}`);
  }
});
test('new courses stay in the dataset and every content type can be filtered without changing raw records', async () => {
  const data = await readData(); const original = JSON.stringify(data);
  for (const id of ['design', 'learning-skills', 'other', 'computer-science']) assert.ok(data.courses.some(course => course.id === id));
  for (const type of Object.keys(TYPES)) {
    assert.equal(selectItems(data, { type }).length, data.items.filter(item => item.type === type && item.status === 'published').length);
  }
  assert.equal(JSON.stringify(data), original);
});
test('external anchors and local file links remain intact on repository-subdirectory hosting', async () => {
  const data = await readData();
  for (const item of data.items) {
    const url = resolveContentUrl(item.url, 'https://owner.github.io/enrichment/editor.html');
    if (isResourceUrl(item.url)) assert.ok(url.startsWith('https://owner.github.io/enrichment/resources/'));
    else assert.equal(url, item.url);
  }
});

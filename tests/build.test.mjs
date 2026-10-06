import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('built HTML uses local content-hashed assets with no unresolved placeholders', async () => {
  for (const name of ['index', 'editor']) {
    const html = await readFile(new URL(`../${name}.html`, import.meta.url), 'utf8');
    assert.ok(html.includes('lang="he" dir="rtl"')); assert.ok(!html.includes('{{'));
    const refs = [...html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map(match => match[1]);
    assert.equal(refs.filter(ref => ref.endsWith('.css')).length, 3);
    assert.equal(refs.filter(ref => ref.endsWith('.js')).length, 1);
    assert.ok(refs.some(ref => ref.endsWith('.png')));
    for (const ref of refs) {
      assert.match(ref, /\.[a-f0-9]{12}\.(css|js|png)$/);
      await access(new URL(`../${ref}`, import.meta.url));
    }
    assert.ok(html.indexOf('icon-credit') > html.indexOf('materials-grid') || name === 'editor');
  }
});
test('all asset hashes match their contents and all generated module imports resolve', async () => {
  const manifest = JSON.parse(await readFile(new URL('../assets/manifest.json', import.meta.url), 'utf8'));
  for (const filename of manifest.files) {
    const content = await readFile(new URL(`../assets/${filename}`, import.meta.url));
    const expected = createHash('sha256').update(content).digest('hex').slice(0, 12);
    assert.ok(filename.includes(`.${expected}.`));
    if (filename.endsWith('.js')) {
      for (const match of content.toString().matchAll(/from ['"]\.\/([^'"]+)['"]/g)) await access(new URL(`../assets/${match[1]}`, import.meta.url));
    }
    if (filename.endsWith('.css')) {
      assert.ok(!content.toString().includes('{{'));
      for (const match of content.toString().matchAll(/url\(["']\.\/([^"']+)["']\)/g)) await access(new URL(`../assets/${match[1]}`, import.meta.url));
    }
  }
});

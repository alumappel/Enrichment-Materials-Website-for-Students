import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertData } from '../src/core.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const path = resolve(root, 'data/content.json');
  const data = JSON.parse(await readFile(path, 'utf8'));
  data.revision = `import-${randomUUID()}`; data.updatedAt = new Date().toISOString();
  assertData(data);
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
  console.log(`Data validated; new revision: ${data.revision}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateData } from '../src/core.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const path = process.argv[2] ? resolve(process.argv[2]) : resolve(root, 'data/content.json');
  const data = JSON.parse(await readFile(path, 'utf8'));
  const errors = validateData(data);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log(`Valid data: ${data.courses.length} courses, ${data.items.length} items, ${data.synonymGroups.length} synonym groups.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }

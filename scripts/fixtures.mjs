import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertData } from '../src/core.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function createFixture(count = 31) {
  if (!Number.isInteger(count) || count < 0 || count > 10000) throw new Error('Fixture count must be an integer between 0 and 10000');
  const data = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/sample-content.json'), 'utf8'));
  data.items.push({ ...data.items[0], id: 'sample-file', type: 'file', title: 'קובץ מצגת לדוגמה',
    description: 'פריט לבדיקת סינון קבצים ופתיחת קובץ מקומי.', url: '/resources/scenes-001.pptx', keywords: [] });
  const templates = data.items.filter(item => item.status === 'published');
  data.items = Array.from({ length: count }, (_, i) => {
    const source = templates[i % templates.length];
    const date = new Date(Date.UTC(2026, 9, 5, 9, 0) - i * 3600000).toISOString();
    return { ...source, id: `fixture-${String(i + 1).padStart(4, '0')}`, title: `${source.title} — ${i + 1}`,
      addedAt: date, updatedAt: date, courseIds: ['unity', 'web-development'],
      keywords: [...source.keywords, i === 30 ? 'פריט אחרון לבדיקה' : 'פריט בדיקה'] };
  });
  data.revision = `fixture-${count}`; data.updatedAt = '2026-10-05T09:00:00Z';
  return assertData(data);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const count = Number(process.argv[2] || 31);
  console.log(JSON.stringify(createFixture(count), null, 2));
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalize, courseScope, selectItems, searchTerms, validateData, assertData, applyChange,
  safeUrl, isResourceUrl, resolveContentUrl, canonicalUrl, localDateInput, israelInputToIso, embedLink, embedCode, fetchJson
} from '../src/core.mjs';
import { createFixture } from '../scripts/fixtures.mjs';

const sample = () => JSON.parse(readFileSync(new URL('./fixtures/sample-content.json', import.meta.url), 'utf8'));
const item = (id, fields = {}) => ({
  id, addedAt: '2026-10-05T09:00:00Z', updatedAt: '2026-10-05T09:00:00Z',
  title: 'Unity editor', description: 'נגישות לתוכן', type: 'website',
  url: 'https://example.org/', courseIds: ['unity'], keywords: ['game tools'], status: 'published', ...fields
});
const dataset = items => ({ ...sample(), items });

test('sample data meets the schema and includes all six types and an archive record', () => {
  const data = assertData(sample()); assert.equal(data.courses.length, 5);
  assert.equal(new Set(data.items.map(entry => entry.type)).size, 6);
  assert.ok(data.items.some(entry => entry.status === 'archived'));
});
test('URL scope trims spaces, deduplicates, skips empty components, and does not broaden invalid IDs', () => {
  const courses = sample().courses;
  assert.deepEqual(courseScope('?course=%20unity%20,,unity,web-development,bad', courses), {
    restricted: true, valid: ['unity', 'web-development'], unknown: ['bad']
  });
  assert.equal(courseScope('?course=%20,', courses).restricted, false);
  const bad = courseScope('?course=unknown', courses);
  assert.equal(selectItems(sample(), { courseIds: bad.valid }).length, 0);
});
test('a course union is deduplicated before filtering; archived records stay private', () => {
  const shared = item('shared', { courseIds: ['unity', 'web-development'] });
  const data = dataset([shared, shared, item('old', { status: 'archived' }), item('other', { courseIds: ['web-design'] })]);
  assert.deepEqual(selectItems(data, { courseIds: ['unity', 'web-development'] }).map(entry => entry.id), ['shared']);
  assert.equal(selectItems(data, { courseIds: [] }).length, 0);
});
test('search is insensitive to Hebrew marks, punctuation, English case, and extra whitespace', () => {
  const data = dataset([item('match')]);
  assert.equal(normalize('  נְגִישׁוּת  / UNITY! '), 'נגישות unity');
  assert.equal(selectItems(data, { query: ' יוּנִיטִי, ACCESSIBILITY! ' }).length, 1);
  assert.equal(selectItems(data, { query: 'unity missing' }).length, 0);
  assert.equal(selectItems(data, { query: 'editor game' }).length, 1);
  assert.equal(selectItems(data, { query: 'unity', type: 'video' }).length, 0);
});
test('multiword synonyms are recognized before splitting and equivalent in both directions', () => {
  const data = dataset([item('he', { title: 'עיצוב רספונסיבי', description: 'מסכים גמישים' })]);
  assert.equal(selectItems(data, { query: 'responsive design מסכים' }).length, 1);
  data.items[0].title = 'Responsive design';
  assert.equal(selectItems(data, { query: 'עיצוב רספונסיבי' }).length, 1);
  const groups = [{ terms: ['a', 'b'] }, { terms: ['b', 'c'] }];
  assert.deepEqual(new Set(searchTerms('c', groups)[0].choices), new Set(['a', 'b', 'c']));
});
test('multiple content types form a union combined with course, search and published status', () => {
  const data = dataset([
    item('video', { type: 'video' }), item('file', { type: 'file', url: '/resources/grid.pdf' }),
    item('website'), item('other-course', { type: 'file', courseIds: ['web-design'] }),
    item('archived-file', { type: 'file', status: 'archived' }),
    item('different-query', { type: 'video', title: 'CSS', keywords: [] })
  ]);
  assert.deepEqual(selectItems(data, { types: ['video', 'file', 'video'], courseIds: ['unity'], query: 'Unity' }).map(entry => entry.id), ['file', 'video']);
  assert.deepEqual(selectItems(data, { types: [] }).map(entry => entry.id), selectItems(data).map(entry => entry.id));
  assert.equal(selectItems(data, { types: ['file', 'video'], courseIds: [] }).length, 0);
  assert.equal(selectItems(data, { types: ['file', 'video'], query: 'missing' }).length, 0);
});
test('sort uses addition date with a stable ID tie break, regardless of edit date', () => {
  const data = dataset([item('z'), item('a'), item('old', { addedAt: '2026-09-01T10:00:00Z', updatedAt: '2026-12-01T10:00:00Z' })]);
  assert.deepEqual(selectItems(data).map(entry => entry.id), ['a', 'z', 'old']);
});
test('search scans beyond the first page and fixtures exercise exact pagination boundaries', () => {
  for (const count of [0, 1, 15, 16, 30, 31]) {
    const data = createFixture(count);
    assert.equal(selectItems(data).length, count);
    const ordered = selectItems(data);
    const pages = [ordered.slice(0, 15), ordered.slice(15, 30), ordered.slice(30, 45)].flat();
    assert.equal(new Set(pages.map(entry => entry.id)).size, count);
  }
  assert.deepEqual(selectItems(createFixture(31), { query: 'פריט אחרון לבדיקה' }).map(entry => entry.id), ['fixture-0031']);
});
test('schema errors identify broken associations, dates, unsafe links, lengths, and duplicate IDs', () => {
  const data = dataset([item('one', { courseIds: ['missing'], url: 'javascript:alert(1)', addedAt: '2026-10-05', title: 'x'.repeat(101) }), item('one')]);
  const errors = validateData(data).join('\n');
  for (const field of ['courseIds', 'url', 'addedAt', 'title', 'id']) assert.ok(errors.includes(field));
  assert.throws(() => assertData(data));
  assert.equal(validateData(dataset([item('same'), item('same')]), { allowDuplicateItems: true }).length, 0);
  assert.ok(validateData(dataset([item('invalid-calendar', { addedAt: '2026-02-30T09:00:00Z' })])).some(error => error.includes('addedAt')));
});
test('updates and archive restore preserve addition dates and identities', () => {
  const data = dataset([item('same')]);
  const change = { kind: 'item', value: { ...data.items[0], title: 'עריכה', status: 'archived' }, operationId: 'op-one', timestamp: '2026-10-06T09:00:00Z' };
  const archived = applyChange(data, change);
  assert.equal(archived.items.length, 1); assert.equal(archived.items[0].addedAt, data.items[0].addedAt);
  assert.equal(selectItems(archived).length, 0); assert.equal(data.items[0].status, 'published');
  assert.equal(applyChange(archived, { ...change, value: { ...change.value, status: 'published' } }).items.length, 1);
});
test('renaming a course preserves embedding ID and validates duplicate names', () => {
  const data = sample();
  const changed = applyChange(data, { kind: 'course', value: { ...data.courses[0], name: 'שם חדש' }, operationId: 'rename', timestamp: data.updatedAt });
  assert.equal(changed.courses[0].id, 'unity'); assert.equal(changed.items[0].courseIds[0], 'unity');
  assert.throws(() => applyChange(data, { kind: 'course', value: { ...data.courses[0], name: data.courses[1].name }, operationId: 'dup', timestamp: data.updatedAt }));
});
test('Israel input works in winter and summer, rejects DST gaps, and ignores host timezone', () => {
  assert.equal(israelInputToIso('2026-01-05T12:00'), '2026-01-05T10:00:00.000Z');
  assert.equal(israelInputToIso('2026-07-05T12:00'), '2026-07-05T09:00:00.000Z');
  assert.equal(localDateInput('2026-10-05T09:00:00Z'), '2026-10-05T12:00');
  assert.throws(() => israelInputToIso('2026-03-27T02:30'));
  assert.throws(() => israelInputToIso('2026-02-30T12:00'));
});
test('embeds retain the Pages repository subdirectory, escape titles and validate outbound schemes', () => {
  const base = 'https://owner.github.io/repo/';
  assert.equal(new URL(embedLink(base, ['unity', 'web-development', 'unity'])).searchParams.get('course'), 'unity,web-development');
  const code = embedCode(base, [{ id: 'unity', name: 'קורס "חדש" <script>' }], 600);
  assert.ok(code.includes('/repo/?course=unity')); assert.ok(code.includes('&quot;')); assert.ok(code.includes('&lt;script&gt;'));
  assert.equal(safeUrl('data:text/html,bad'), false); assert.equal(safeUrl('https://secret@example.org/'), false);
  assert.equal(safeUrl('https://example.org/'), true);
  assert.notEqual(canonicalUrl('https://example.org/#one'), canonicalUrl('https://example.org/#two'));
  assert.equal(canonicalUrl('https://example.org/'), canonicalUrl('https://example.org'));
});
test('resource URLs are site-relative under root and GitHub Pages repository hosting', () => {
  for (const input of ['/resources/grid-005.pdf', 'resources/grid-005.pdf']) {
    assert.equal(safeUrl(input), true); assert.equal(isResourceUrl(input), true);
    assert.equal(resolveContentUrl(input, 'http://localhost:8080/editor.html'), 'http://localhost:8080/resources/grid-005.pdf');
    assert.equal(resolveContentUrl(input, 'https://owner.github.io/repo/?course=unity'), 'https://owner.github.io/repo/resources/grid-005.pdf');
  }
  assert.equal(resolveContentUrl('/resources/grid-005.pdf#page=2', 'https://owner.github.io/repo/index.html'), 'https://owner.github.io/repo/resources/grid-005.pdf#page=2');
  assert.equal(canonicalUrl('/resources/grid-005.pdf'), canonicalUrl('resources/grid-005.pdf'));
});
test('resource URL support rejects navigation outside resources and disguised external URLs', () => {
  for (const input of ['//evil.example/resources/a', '/other/a', '/resources/', '/resources/../config.json',
    '/resources/%2e%2e/config.json', '/resources/%2F..%2Fconfig.json', '/resources/%252e%252e/a',
    '/resources/a\\b', '/resources/%5cb', '/resources/%00a', '/resources/%ZZ', 'javascript:alert(1)', 'data:text/html,bad']) {
    assert.equal(safeUrl(input), false, input); assert.throws(() => resolveContentUrl(input), undefined, input);
  }
});
test('file items validate, filter, archive and restore through the same publication model', () => {
  const record = item('file-one', { type: 'file', url: '/resources/scenes-001.pptx' });
  const data = assertData(dataset([record, item('website-one')]));
  assert.deepEqual(selectItems(data, { type: 'file' }).map(entry => entry.id), ['file-one']);
  const archived = applyChange(data, { kind: 'item', value: { ...record, status: 'archived' }, operationId: 'file-archive', timestamp: data.updatedAt });
  assert.equal(selectItems(archived, { type: 'file' }).length, 0);
  const restored = applyChange(archived, { kind: 'item', value: record, operationId: 'file-restore', timestamp: data.updatedAt });
  assert.equal(selectItems(restored, { type: 'file' })[0].addedAt, record.addedAt);
});
test('every data request uses no-store and a unique cache-busting URL', async () => {
  const calls = []; const fetcher = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({}) }; };
  await fetchJson('https://example.org/repo/data/content.json', { fetcher });
  await fetchJson('https://example.org/repo/data/content.json', { fetcher });
  assert.notEqual(calls[0].url, calls[1].url); assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(new URL(calls[0].url).pathname, '/repo/data/content.json');
});

export const TYPES = Object.freeze({
  website: 'אתר', video: 'סרטון', article: 'כתבה',
  course: 'קורס דיגיטלי', game: 'משחק', tool: 'כלי', file: 'קובץ'
});
export const PAGE_SIZE = 15;
export const clone = value => structuredClone(value);
export const uniqueId = prefix => `${prefix}-${crypto.randomUUID()}`;

export function normalize(value = '') {
  return String(value).normalize('NFKC').toLowerCase()
    .replace(/[\u0591-\u05BD\u05BF-\u05C7]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function isResourceUrl(value) {
  if (typeof value !== 'string' || /[\\\u0000-\u0020\u007f]/.test(value)) return false;
  const path = value.split(/[?#]/, 1)[0];
  if (!/^\/?resources\/.+/.test(path)) return false;
  try {
    return path.replace(/^\//, '').split('/').every(part => {
      const decoded = decodeURIComponent(part);
      return decoded && decoded !== '.' && decoded !== '..' && !/[\\/%\u0000-\u0020\u007f]/.test(decoded);
    });
  } catch { return false; }
}

export function safeUrl(value) {
  if (isResourceUrl(value)) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function resolveContentUrl(value, base = globalThis.location?.href || 'http://localhost/') {
  if (!safeUrl(value)) throw new Error('קישור הפריט אינו תקין');
  if (isResourceUrl(value)) {
    // A leading / in imported resource links means the root of this site, including
    // the repository subdirectory on GitHub Pages, rather than the domain root.
    return new URL(value.replace(/^\//, ''), new URL('./', base)).href;
  }
  return value;
}

export function canonicalUrl(value) {
  try { return new URL(resolveContentUrl(value)).href; }
  catch { return value; }
}

const isoDate = value => {
  if (typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))) return false;
  const day = value.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
};
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const slug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

export class DataError extends Error {
  constructor(errors) { super(errors.join('\n')); this.name = 'DataError'; this.errors = errors; }
}

export function validateData(data, { allowDuplicateItems = false } = {}) {
  const errors = [];
  const fail = (path, message) => errors.push(`${path}: ${message}`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['קובץ הנתונים חייב להיות אובייקט JSON'];
  if (data.schemaVersion !== 1) fail('schemaVersion', 'גרסת המבנה חייבת להיות 1');
  if (!text(data.revision, 150)) fail('revision', 'נדרש מזהה פרסום');
  if (!isoDate(data.updatedAt)) fail('updatedAt', 'נדרש תאריך ISO עם אזור זמן');
  for (const field of ['courses', 'synonymGroups', 'items']) {
    if (!Array.isArray(data[field])) fail(field, 'נדרש מערך');
  }
  if (errors.length) return errors;
  const courseIds = new Set(), names = new Set(), itemIds = new Set(), groupIds = new Set();
  data.courses.forEach((course, i) => {
    const path = `courses[${i}]`;
    if (!course || !slug(course.id)) fail(`${path}.id`, 'מזהה באנגלית: אותיות קטנות, ספרות ומקפים');
    if (!course || !text(course.name, 120)) fail(`${path}.name`, 'שם חובה, עד 120 תווים');
    if (courseIds.has(course?.id)) fail(`${path}.id`, 'מזהה קורס כפול');
    if (course?.name && names.has(normalize(course.name))) fail(`${path}.name`, 'שם קורס כפול');
    courseIds.add(course?.id); names.add(normalize(course?.name));
  });
  data.synonymGroups.forEach((group, i) => {
    const path = `synonymGroups[${i}]`;
    if (!group || !text(group.id, 150) || groupIds.has(group.id)) fail(`${path}.id`, 'נדרש מזהה ייחודי');
    groupIds.add(group?.id);
    if (!Array.isArray(group?.terms) || group.terms.length < 2 ||
      group.terms.some(term => !text(term, 100) || !normalize(term)) ||
      new Set(group.terms.map(normalize)).size !== group.terms.length) {
      fail(`${path}.terms`, 'נדרשים לפחות שני מונחים שונים, עד 100 תווים לכל מונח');
    }
  });
  data.items.forEach((item, i) => {
    const path = `items[${i}] (${item?.title || item?.id || 'ללא שם'})`;
    if (!item || typeof item !== 'object') { fail(path, 'פריט לא תקין'); return; }
    if (!text(item.id, 150)) fail(`${path}.id`, 'נדרש מזהה פריט');
    if (!allowDuplicateItems && itemIds.has(item.id)) fail(`${path}.id`, 'מזהה פריט כפול');
    itemIds.add(item.id);
    if (!text(item.title, 100)) fail(`${path}.title`, 'כותרת חובה, עד 100 תווים');
    if (!text(item.description, 350)) fail(`${path}.description`, 'תיאור חובה, עד 350 תווים');
    if (!Object.hasOwn(TYPES, item.type)) fail(`${path}.type`, 'בחרו אחד מסוגי התוכן המותרים');
    if (typeof item.url !== 'string' || !safeUrl(item.url)) fail(`${path}.url`, 'נדרש קישור http או https, או נתיב לקובץ בתוך /resources/');
    if (!Array.isArray(item.courseIds) || !item.courseIds.length ||
      item.courseIds.some(id => !courseIds.has(id)) || new Set(item.courseIds).size !== item.courseIds.length) {
      fail(`${path}.courseIds`, 'בחרו קורס אחד לפחות, עם מזהים קיימים וללא כפילויות');
    }
    if (!Array.isArray(item.keywords) || item.keywords.some(word => !text(word, 100))) fail(`${path}.keywords`, 'מילות מפתח חייבות להיות מערך טקסטים עד 100 תווים');
    if (!['published', 'archived'].includes(item.status)) fail(`${path}.status`, 'סטטוס חייב להיות published או archived');
    for (const field of ['addedAt', 'updatedAt']) if (!isoDate(item[field])) fail(`${path}.${field}`, 'נדרש תאריך ISO עם אזור זמן');
  });
  return errors;
}

export function assertData(data, options) {
  const errors = validateData(data, options);
  if (errors.length) throw new DataError(errors);
  return data;
}

export function courseScope(search, courses) {
  const params = new URLSearchParams(search);
  const raw = params.getAll('course').join(',');
  const requested = [...new Set(raw.split(',').map(id => id.trim()).filter(Boolean))];
  const exists = new Set(courses.map(course => course.id));
  return {
    restricted: requested.length > 0,
    valid: requested.filter(id => exists.has(id)),
    unknown: requested.filter(id => !exists.has(id))
  };
}

// Connected groups are merged so a shared term remains equivalent in both directions.
export function searchTerms(query, groups = []) {
  const merged = [];
  for (const group of groups) {
    let terms = new Set(group.terms.map(normalize).filter(Boolean));
    for (let i = merged.length - 1; i >= 0; i--) {
      if ([...terms].some(term => merged[i].has(term))) {
        terms = new Set([...terms, ...merged.splice(i, 1)[0]]);
      }
    }
    merged.push(terms);
  }
  const aliases = merged.flatMap(set => [...set].map(term => ({ term, choices: [...set] })))
    .sort((a, b) => b.term.length - a.term.length);
  let remaining = normalize(query);
  const requirements = [];
  while (remaining) {
    const alias = aliases.find(({ term }) => remaining === term || remaining.startsWith(`${term} `));
    if (alias) {
      requirements.push({ choices: alias.choices, phrase: true });
      remaining = remaining.slice(alias.term.length).trim();
    } else {
      const [word] = remaining.split(' ');
      requirements.push({ choices: [word], phrase: false });
      remaining = remaining.slice(word.length).trim();
    }
  }
  return requirements;
}

export function selectItems(data, { courseIds = null, query = '', type = '', types = [], status = 'published' } = {}) {
  const requirements = searchTerms(query, data.synonymGroups);
  const allowedTypes = new Set(types);
  const seen = new Set();
  return data.items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    if (item.status !== status || (type && item.type !== type)) return false;
    if (allowedTypes.size && !allowedTypes.has(item.type)) return false;
    if (courseIds !== null && !item.courseIds.some(id => courseIds.includes(id))) return false;
    const fields = [item.title, item.description, ...item.keywords].map(normalize);
    return requirements.every(({ choices, phrase }) => choices.some(term =>
      fields.some(field => phrase ? ` ${field} `.includes(` ${term} `) : field.includes(term))));
  }).sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export async function fetchJson(url, { signal, fetcher = fetch } = {}) {
  const target = new URL(url, globalThis.location?.href || 'http://localhost/');
  target.searchParams.set('_', `${Date.now()}-${crypto.randomUUID()}`);
  const response = await fetcher(target.href, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`טעינת הקובץ נכשלה (${response.status})`);
  return response.json();
}

export function applyChange(data, change) {
  const result = clone(data);
  const collection = { item: 'items', course: 'courses', synonym: 'synonymGroups' }[change.kind];
  if (!collection) throw new Error('סוג שינוי לא מוכר');
  const index = result[collection].findIndex(entry => entry.id === change.value.id);
  if (change.remove) {
    if (change.kind !== 'synonym') throw new Error('ניתן להסיר קבוצת מונחים בלבד');
    if (index !== -1) result[collection].splice(index, 1);
  } else if (index === -1) result[collection].push(clone(change.value));
  else result[collection][index] = clone(change.value);
  result.revision = change.operationId;
  result.updatedAt = change.timestamp;
  return assertData(result);
}

export function formatDate(value) {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem', dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date(value));
}

export function localDateInput(value = new Date().toISOString()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(value));
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function israelInputToIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('בחרו תאריך ושעה תקינים');
  const wall = Date.parse(`${value}:00Z`);
  // Try both Israel offsets. Reject a missing wall time during the spring DST transition.
  for (const offset of [2, 3]) {
    const candidate = new Date(wall - offset * 3600000).toISOString();
    if (localDateInput(candidate) === value) return candidate;
  }
  throw new Error('התאריך או השעה אינם קיימים באזור הזמן של ישראל');
}

export function embedLink(base, ids) {
  const url = new URL(base);
  url.search = ''; url.hash = '';
  if (ids.length) url.searchParams.set('course', [...new Set(ids)].join(','));
  return url.href;
}

export function embedCode(base, courses, height = 900) {
  const escape = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const title = courses.length ? `חומרי העשרה — ${courses.map(course => course.name).join(', ')}` : 'חומרי העשרה מכל הקורסים';
  return `<iframe src="${escape(embedLink(base, courses.map(course => course.id)))}" title="${escape(title)}" style="width:100%;height:${height}px;border:0" loading="lazy"></iframe>`;
}

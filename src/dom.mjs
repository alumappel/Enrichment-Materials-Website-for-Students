import { TYPES, resolveContentUrl, isResourceUrl } from './core.mjs';

export const $ = selector => document.querySelector(selector);
export const $$ = selector => [...document.querySelectorAll(selector)];
export function el(tag, className = '', content = '') {
  const node = document.createElement(tag);
  node.className = className;
  if (content !== '') node.textContent = content;
  return node;
}
export const ICONS = Object.freeze({
  website: 'browser', video: 'play-alt', article: 'document', course: 'book-open-cover',
  game: 'gamepad', tool: 'wrench-simple', file: 'file-download', search: 'search', external: 'arrow-up-right-from-square',
  add: 'plus', edit: 'pencil', archive: 'box', restore: 'undo', copy: 'copy',
  settings: 'settings', close: 'cross', check: 'check', arrow: 'arrow-small-left',
  empty: 'search', library: 'books', login: 'lock', error: 'exclamation'
});
export function icon(name, className = '') {
  const node = el('i', `fi-rr-${ICONS[name] || name} icon ${className}`);
  node.setAttribute('aria-hidden', 'true');
  return node;
}
export function bilingual(value) {
  const node = el('bdi', '', value);
  node.dir = 'auto';
  if (/[A-Za-z]/.test(value) && !/[\u0590-\u05ff]/.test(value)) node.lang = 'en';
  return node;
}
export function button(label, className = 'btn btn-outline-secondary', iconName) {
  const node = el('button', className); node.type = 'button';
  if (iconName) node.append(icon(iconName));
  node.append(el('span', '', label));
  return node;
}
export function contentCard(item, data, { showCourses = true, preview = false } = {}) {
  const article = el('article', `card material-card type-${item.type}`);
  const body = el('div', 'card-body');
  const metadata = el('div', 'material-metadata');
  metadata.append(el('span', 'type-icon')); metadata.firstChild.append(icon(item.type));
  const heading = el('h2', 'card-title');
  heading.append(el('span', 'visually-hidden', `${TYPES[item.type] || 'סוג התוכן'}: `), bilingual(item.title || 'כותרת הפריט'));
  metadata.append(heading);
  const description = el('p', 'card-text'); description.append(bilingual(item.description || 'התיאור הקצר יופיע כאן.'));
  body.append(metadata, description);
  if (showCourses) {
    const names = data.courses.filter(course => item.courseIds?.includes(course.id));
    const tags = el('div', 'course-tags');
    names.forEach(course => { const tag = el('span', 'course-tag'); tag.append(bilingual(course.name)); tags.append(tag); });
    body.append(tags);
  }
  const link = el(preview ? 'span' : 'a', 'material-link material-button');
  const isFile = item.type === 'file';
  const localFile = isFile && isResourceUrl(item.url);
  const action = isFile ? 'להורדת הקובץ' : 'פתיחת הפריט';
  const noticeText = localFile ? ' (הורדת קובץ)' : isFile ? ' (בלשונית חדשה או כהורדה, בהתאם לשרת הקובץ)' : ' (בלשונית חדשה)';
  if (!preview) {
    link.href = resolveContentUrl(item.url); link.target = '_blank'; link.rel = 'noopener noreferrer';
    if (localFile) link.setAttribute('download', '');
    link.setAttribute('aria-label', `${action}: ${item.title}${noticeText}`);
  }
  link.append(el('span', '', action), icon(isFile ? 'file' : 'external'));
  const notice = el('span', 'visually-hidden', noticeText); link.append(notice);
  body.append(link); article.append(body);
  return article;
}
export function options(select, entries, initialLabel) {
  const previous = select.value;
  select.replaceChildren();
  if (initialLabel) select.append(new Option(initialLabel, ''));
  entries.forEach(([value, label]) => select.append(new Option(label, value)));
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
}
export function message(container, text, kind = 'info') {
  container.hidden = false;
  container.className = `alert alert-${kind} app-message`;
  container.textContent = text;
}
export function announce(text, target = $('#live-status')) {
  if (target) { target.textContent = ''; requestAnimationFrame(() => { target.textContent = text; }); }
}
export function showDialog(dialog) {
  const trigger = document.activeElement;
  dialog.addEventListener('close', () => {
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  }, { once: true });
  dialog.showModal();
  dialog.querySelector('[autofocus], input, button')?.focus();
}
export async function confirmAction(title, text, actionLabel = 'אישור') {
  const dialog = $('#confirm-dialog');
  $('#confirm-title').textContent = title; $('#confirm-text').textContent = text;
  $('#confirm-action').textContent = actionLabel;
  dialog.returnValue = '';
  showDialog(dialog);
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}
export async function copyText(text, field) {
  try { await navigator.clipboard.writeText(text); announce('הועתק ללוח'); }
  catch {
    field.value = text; field.focus(); field.select();
    announce('העתקה אוטומטית אינה זמינה. הטקסט נבחר; השתמשו בהעתקה במקלדת.');
  }
}

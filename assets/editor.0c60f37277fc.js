import {
  TYPES, normalize, safeUrl, resolveContentUrl, canonicalUrl, uniqueId, clone, fetchJson, assertData,
  validateData, applyChange, selectItems, formatDate, localDateInput, israelInputToIso,
  embedLink, embedCode
} from './core.7afeeec32df5.js';
import { GitHubClient, ConflictError, validateConnection } from './github.d64318d375d5.js';
import { $, $$, el, icon, button, bilingual, contentCard, options, message, announce,
  showDialog, confirmAction, copyText } from './dom.9135b63e3c57.js';

let config, data, client = null, baselineSha = null, view = 'active', busy = false;
let originalItem = null, itemId, originalDateValue, itemDirty = false;
let editedCourse = null, editedSynonym = null, synonymId, smallFormDirty = false, settingsEpoch = 0;
let pendingOperation = null, conflictLatest = null, publication = null, publicationTimer, checking = false;
const CONNECTION_KEY = 'enrichment.connection.v1';
const SESSION_KEY = 'enrichment.editor.session.v1';

function remember(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ }
}
function recalled(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function setSession(value) {
  try { if (value) sessionStorage.setItem(SESSION_KEY, config.login.passwordHash); else sessionStorage.removeItem(SESSION_KEY); }
  catch { /* Browsers can disable storage in an iframe. */ }
}
function hasSession() {
  try { return sessionStorage.getItem(SESSION_KEY) === config.login.passwordHash; } catch { return false; }
}
async function passwordHash(password) {
  const bytes = new TextEncoder().encode(`${config.login.salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function isDirty() { return itemDirty || smallFormDirty; }
async function discardChanges() {
  if (!isDirty()) return true;
  return confirmAction('יציאה בלי פרסום', 'השינויים שלא פורסמו יאבדו. להמשיך?', 'יציאה בלי פרסום');
}
function publicationLabel(edit = false) {
  return client ? edit ? 'פרסום השינויים' : 'פרסום' : 'עדכון תצוגת ההדגמה';
}
function updateConnectionDisplay() {
  $('#connection-badge').textContent = client ? 'מחובר ל־GitHub' : 'מצב הדגמה';
  $('#connection-detail').textContent = client ? `${client.config.owner}/${client.config.repo} · ${client.config.branch}` : 'השינויים נשמרים בתצוגת העורך עד רענון בלבד.';
  $('#publish-item').textContent = publicationLabel(Boolean(originalItem));
  $('#publish-course').textContent = publicationLabel(Boolean(editedCourse));
  $('#publish-synonym').textContent = publicationLabel(Boolean(editedSynonym));
}
function setBusy(value) {
  busy = value;
  $$('#editor-view button, #course-dialog button, #synonym-dialog button').forEach(node => { node.disabled = value; });
  $$('#item-form input, #item-form select, #item-form textarea, #course-form input, #synonym-form textarea').forEach(node => { node.disabled = value || (node.id === 'course-id' && Boolean(editedCourse)); });
  $('#item-form').setAttribute('aria-busy', String(value));
  $('#course-form').setAttribute('aria-busy', String(value));
  $('#synonym-form').setAttribute('aria-busy', String(value));
}
function checkboxList(container, selected, prefix) {
  container.replaceChildren();
  data.courses.forEach(course => {
    const label = el('label', 'checkbox-option');
    const input = el('input', 'form-check-input'); input.type = 'checkbox';
    input.value = course.id; input.id = `${prefix}-${course.id}`; input.checked = selected.includes(course.id);
    label.append(input, bilingual(course.name)); container.append(label);
  });
}
function checked(container) { return [...container.querySelectorAll('input:checked')].map(input => input.value); }

function refreshSelectors() {
  options($('#admin-course'), data.courses.map(course => [course.id, course.name]), 'כל הקורסים');
  options($('#admin-type'), Object.entries(TYPES), 'כל הסוגים');
  options($('#item-type'), Object.entries(TYPES), 'בחרו סוג תוכן');
}

function renderList() {
  if (!data) return;
  $('#list-title').textContent = view === 'archive' ? 'ארכיון' : 'חומרים פעילים';
  const items = selectItems(data, {
    query: $('#admin-search').value, type: $('#admin-type').value,
    courseIds: $('#admin-course').value ? [$('#admin-course').value] : null,
    status: view === 'archive' ? 'archived' : 'published'
  });
  $('#admin-count').textContent = `${items.length} חומרים`;
  $('#admin-empty').hidden = items.length > 0;
  const list = $('#records-list'); list.replaceChildren();
  items.forEach(item => {
    const record = el('article', 'record');
    const details = el('div'); const title = el('h3'); title.append(bilingual(item.title));
    const names = data.courses.filter(course => item.courseIds.includes(course.id)).map(course => course.name);
    const meta = el('p', 'record-meta', `${TYPES[item.type]} · ${names.join(' · ')}`);
    details.append(title, meta);
    const date = el('p', 'record-date mb-0', `נוסף: ${formatDate(item.addedAt)}`);
    const actions = el('div', 'record-actions');
    const edit = button('עריכה', 'btn btn-outline-secondary', 'edit');
    edit.setAttribute('aria-label', `עריכת ${item.title}`);
    edit.addEventListener('click', () => openItem(item));
    const status = button(item.status === 'archived' ? 'החזרה למאגר' : 'העברה לארכיון', 'btn btn-outline-secondary', item.status === 'archived' ? 'restore' : 'archive');
    status.setAttribute('aria-label', `${item.status === 'archived' ? 'החזרה למאגר' : 'העברה לארכיון'}: ${item.title}`);
    status.addEventListener('click', () => changeItemStatus(item));
    actions.append(edit, status); details.append(el('p', 'record-meta mt-2', item.description));
    const isFile = item.type === 'file';
    const link = el('a', 'material-link', isFile ? 'פתיחת הקובץ' : 'פתיחת הפריט'); link.href = resolveContentUrl(item.url); link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `פתיחת ${item.title} ${isFile ? 'בלשונית חדשה או כהורדה' : 'בלשונית חדשה'}`); link.append(icon(isFile ? 'file' : 'external'));
    details.append(link); record.append(details, date, actions); list.append(record);
  });
  announce(`${items.length} חומרים ברשימה`);
}

async function switchView(next, { force = false, focus = true } = {}) {
  if (busy || !data || (!force && !await discardChanges())) return;
  itemDirty = false; smallFormDirty = false; view = next;
  $('#item-view').hidden = true;
  $('#list-view').hidden = !['active', 'archive'].includes(view);
  $('#courses-view').hidden = view !== 'courses'; $('#synonyms-view').hidden = view !== 'synonyms';
  $$('[data-view]').forEach(node => {
    const active = node.dataset.view === view; node.classList.toggle('active', active);
    if (active) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
  });
  if (['active', 'archive'].includes(view)) renderList();
  if (view === 'courses') renderCourses();
  if (view === 'synonyms') renderSynonyms();
  if (focus) $('#editor-content').focus({ preventScroll: true });
}

function clearItemErrors() {
  $('#item-errors').hidden = true; $('#item-errors').replaceChildren();
  $$('#item-form .field-error').forEach(node => { node.hidden = true; node.textContent = ''; });
  $$('#item-form .is-invalid').forEach(node => { node.classList.remove('is-invalid'); node.removeAttribute('aria-invalid'); });
}

async function openItem(item = null) {
  if (busy || !data || !await discardChanges()) return;
  originalItem = item ? clone(item) : null;
  itemId = item?.id || uniqueId('item');
  $('#item-form').reset(); clearItemErrors();
  $('#item-heading').textContent = item ? 'עריכת פריט' : 'פריט חדש';
  $('#archive-edit-note').hidden = item?.status !== 'archived';
  $('#item-title').value = item?.title || ''; $('#item-description').value = item?.description || '';
  $('#item-type').value = item?.type || ''; $('#item-url').value = item?.url || '';
  $('#item-keywords').value = item?.keywords.join(', ') || '';
  originalDateValue = localDateInput(item?.addedAt);
  $('#item-added').value = originalDateValue;
  checkboxList($('#item-courses'), item?.courseIds || [], 'item-course');
  $('#item-view').hidden = false; $('#list-view').hidden = true;
  $('#courses-view').hidden = true; $('#synonyms-view').hidden = true;
  itemDirty = false; smallFormDirty = false; updateConnectionDisplay(); updatePreview();
  $('#item-title').focus();
}

function itemValue() {
  const addedAt = originalItem && $('#item-added').value === originalDateValue ? originalItem.addedAt : israelInputToIso($('#item-added').value);
  return {
    id: itemId, addedAt, updatedAt: originalItem?.updatedAt || new Date().toISOString(),
    title: $('#item-title').value.trim(), description: $('#item-description').value.trim(),
    type: $('#item-type').value, url: $('#item-url').value.trim(),
    courseIds: checked($('#item-courses')),
    keywords: [...new Set($('#item-keywords').value.split(',').map(value => value.trim()).filter(Boolean))],
    status: originalItem?.status || 'published'
  };
}
function updatePreview() {
  $('#title-count').textContent = `${$('#item-title').value.length} מתוך 100 תווים`;
  $('#description-count').textContent = `${$('#item-description').value.length} מתוך 350 תווים`;
  const preview = {
    title: $('#item-title').value, description: $('#item-description').value,
    type: $('#item-type').value || 'website', url: '#', courseIds: checked($('#item-courses'))
  };
  $('#item-preview').replaceChildren(contentCard(preview, data, { preview: true }));
}
function validateItemForm() {
  clearItemErrors();
  const errors = [];
  const add = (field, text) => errors.push({ field, text });
  if (!$('#item-title').value.trim()) add('item-title', 'יש להזין כותרת');
  if (!$('#item-description').value.trim()) add('item-description', 'יש להזין תיאור קצר');
  if (!Object.hasOwn(TYPES, $('#item-type').value)) add('item-type', 'יש לבחור סוג תוכן');
  if (!safeUrl($('#item-url').value.trim())) add('item-url', 'יש להזין קישור http או https, או נתיב לקובץ בתוך /resources/');
  if (!checked($('#item-courses')).length) add('item-courses', 'יש לבחור קורס אחד לפחות');
  if ($('#item-keywords').value.split(',').some(term => term.trim().length > 100)) add('item-keywords', 'כל מילת מפתח יכולה להכיל עד 100 תווים');
  try { israelInputToIso($('#item-added').value); } catch (error) { add('item-added', error.message); }
  if (errors.length) {
    const summary = $('#item-errors'); summary.hidden = false;
    summary.append(el('p', '', 'לא ניתן לפרסם. תקנו את השדות הבאים:'));
    const list = el('ul');
    errors.forEach(({ field, text }) => {
      const error = $(`#${field}-error`); error.textContent = text; error.hidden = false;
      const control = $(`#${field}`);
      control.classList.add('is-invalid'); control.setAttribute('aria-invalid', 'true');
      const li = el('li'); const link = el('a', '', text); link.href = `#${field}`;
      link.addEventListener('click', event => { event.preventDefault(); (control.querySelector('input') || control).focus(); });
      li.append(link); list.append(li);
    });
    summary.append(list);
    const control = $(`#${errors[0].field}`); (control.querySelector('input') || control).focus();
    return false;
  }
  return true;
}

function prepareChange(kind, value, remove = false) {
  const stable = clone(value); delete stable.updatedAt;
  const signature = JSON.stringify({ kind, value: stable, remove });
  if (pendingOperation?.signature === signature) return pendingOperation.change;
  const timestamp = new Date().toISOString();
  const change = { kind, value: { ...value }, remove, operationId: uniqueId('publication'), timestamp };
  if (kind === 'item') change.value.updatedAt = timestamp;
  pendingOperation = { signature, change };
  return change;
}

async function commitChange(kind, value, { remove = false, errorTarget = $('#editor-message') } = {}) {
  if (busy) return false;
  const change = prepareChange(kind, value, remove);
  try { applyChange(data, change); } catch (error) { message(errorTarget, error.message, 'danger'); return false; }
  setBusy(true); $('#editor-message').hidden = true;
  try {
    if (!client) {
      data = applyChange(data, change);
      message($('#editor-message'), 'תצוגת ההדגמה עודכנה בעורך בלבד. רענון יטען שוב את קובץ הדוגמה; לפרסום באתר יש לחבר GitHub.', 'info');
    } else {
      const result = await client.publish(change, baselineSha, stage => {
        message($('#editor-message'), stage, 'info'); announce(stage);
      });
      data = result.data; baselineSha = result.sha;
      $('#editor-message').hidden = true;
      publication = { client, revision: change.operationId, commit: result.commit, attempts: 0 };
      $('#publication-box').hidden = false;
      $('#publication-text').textContent = 'נשמר במאגר וממתין לעלייה לאתר';
      $('#publication-revision').textContent = change.operationId;
      $('#deployment-link').href = `https://github.com/${encodeURIComponent(client.config.owner)}/${encodeURIComponent(client.config.repo)}/actions`;
      clearTimeout(publicationTimer); publicationTimer = setTimeout(checkPublication, 2000);
    }
    pendingOperation = null; refreshSelectors(); announce(client ? 'השינוי נשמר במאגר וממתין לאימות באתר' : 'תצוגת ההדגמה עודכנה');
    return true;
  } catch (error) {
    if (error instanceof ConflictError) {
      conflictLatest = error.latest;
      const existing = change.kind === 'item' ? error.latest.data.items.find(item => item.id === change.value.id) : null;
      $('#conflict-details').replaceChildren();
      if (existing) {
        const details = $('#conflict-details');
        details.append(el('p', '', 'הערכים העדכניים במאגר:'));
        details.append(el('p', '', `כותרת: ${existing.title}`), el('p', '', `תיאור: ${existing.description}`),
          el('p', '', `סוג: ${TYPES[existing.type]} · מצב: ${existing.status === 'archived' ? 'בארכיון' : 'פעיל'}`),
          el('p', 'url-field', existing.url),
          el('p', '', `קורסים: ${error.latest.data.courses.filter(course => existing.courseIds.includes(course.id)).map(course => course.name).join(', ')}`));
      } else $('#conflict-details').textContent = 'לאחר הטעינה אפשר לבדוק את הנתונים העדכניים ולפרסם שוב את השינוי.';
      showDialog($('#conflict-dialog'));
    }
    message(errorTarget, error.message, 'danger');
    return false;
  } finally { setBusy(false); }
}

async function checkPublication() {
  if (!publication) return;
  if (checking) { publicationTimer = setTimeout(checkPublication, 3000); return; }
  checking = true; const current = publication;
  $('#check-publication').disabled = true;
  try {
    const status = await current.client.publicationStatus(current.revision, current.commit);
    if (publication !== current) return;
    $('#publication-text').textContent = status.text;
    $('#publication-box').className = `publication-box ${status.state === 'failed' ? 'alert alert-danger' : status.state === 'published' ? 'alert alert-success' : ''}`;
    $('#check-publication').hidden = status.state === 'published';
    announce(status.text);
    current.attempts++;
    if (status.state === 'pending' && current.attempts < 5) publicationTimer = setTimeout(checkPublication, 7000);
  } finally { checking = false; $('#check-publication').disabled = false; }
}

async function changeItemStatus(item) {
  if (busy) return;
  const archived = item.status === 'published';
  const confirmed = await confirmAction(`${archived ? 'העברה לארכיון' : 'החזרה למאגר'}: ${item.title}`,
    archived ? 'הפריט יוסתר מכל הקורסים וניתן יהיה להחזירו.' : 'הפריט יוצג שוב בקורסים שאליהם שויך, לפי תאריך ההוספה המקורי.', archived ? 'העברה לארכיון' : 'החזרה למאגר');
  if (!confirmed) return;
  if (await commitChange('item', { ...item, status: archived ? 'archived' : 'published' })) renderList();
}

function publicBase() {
  const saved = client?.config || recalled(CONNECTION_KEY) || config.github;
  if (saved?.pagesUrl) {
    try { if (new URL(saved.pagesUrl).protocol === 'https:') return saved.pagesUrl; } catch { /* Use local URL. */ }
  }
  return new URL('./', location.href).href;
}
function updateEmbed() {
  const courses = data.courses.filter(course => checked($('#embed-courses')).includes(course.id));
  const height = Number($('#embed-height').value);
  $('#embed-height').setCustomValidity(Number.isInteger(height) && height >= 200 && height <= 3000 ? '' : 'בחרו גובה שלם בין 200 ל־3000');
  $('#embed-url').value = embedLink(publicBase(), courses.map(course => course.id));
  $('#embed-code').value = embedCode(publicBase(), courses, Number.isInteger(height) && height >= 200 && height <= 3000 ? height : 900);
  $('#embed-hint').hidden = new URL(publicBase()).protocol === 'https:';
}
function renderCourses() {
  const list = $('#courses-list'); list.replaceChildren();
  data.courses.forEach(course => {
    const record = el('article', 'record'); const details = el('div'); const heading = el('h3'); heading.append(bilingual(course.name));
    const count = selectItems(data, { courseIds: [course.id] }).length;
    details.append(heading, el('p', 'record-meta', `${count} חומרים פעילים`));
    const id = el('bdi', 'record-date', course.id); id.dir = 'ltr';
    const actions = el('div', 'record-actions');
    const edit = button('שינוי שם', 'btn btn-outline-secondary', 'edit'); edit.addEventListener('click', () => openCourse(course));
    const link = button('העתקת קישור', 'btn btn-outline-secondary', 'copy');
    link.addEventListener('click', () => { selectEmbedCourses([course.id]); copyText(embedLink(publicBase(), [course.id]), $('#embed-url')); });
    const code = button('העתקת קוד הטמעה', 'btn btn-outline-secondary', 'copy');
    code.addEventListener('click', () => { selectEmbedCourses([course.id]); copyText(embedCode(publicBase(), [course]), $('#embed-code')); });
    for (const node of [edit, link, code]) node.setAttribute('aria-label', `${node.textContent}: ${course.name}`);
    actions.append(edit, link, code); record.append(details, id, actions); list.append(record);
  });
  const previously = checked($('#embed-courses'));
  checkboxList($('#embed-courses'), previously, 'embed-course'); updateEmbed();
}
function selectEmbedCourses(ids) {
  $('#embed-courses').querySelectorAll('input').forEach(input => { input.checked = ids.includes(input.value); }); updateEmbed();
}
function openCourse(course = null) {
  if (!data || busy) return;
  editedCourse = course ? clone(course) : null;
  $('#course-form').reset(); $('#course-error').hidden = true;
  $('#course-dialog-title').textContent = course ? 'שינוי שם קורס' : 'קורס חדש';
  $('#course-name').value = course?.name || '';
  $('#course-id').value = course?.id || `course-${crypto.randomUUID().slice(0, 8)}`;
  $('#course-id').disabled = Boolean(course);
  $('#publish-course').textContent = publicationLabel(Boolean(course)); smallFormDirty = false;
  showDialog($('#course-dialog')); $('#course-name').focus();
}

function renderSynonyms() {
  const list = $('#synonyms-list'); list.replaceChildren();
  data.synonymGroups.forEach(group => {
    const record = el('article', 'record'); const details = el('div'); const heading = el('h3');
    group.terms.forEach((term, i) => { if (i) heading.append(document.createTextNode(' · ')); heading.append(bilingual(term)); });
    details.append(heading); const actions = el('div', 'record-actions');
    const edit = button('עריכה', 'btn btn-outline-secondary', 'edit'); edit.addEventListener('click', () => openSynonym(group));
    const remove = button('הסרת קבוצה', 'btn btn-outline-secondary');
    remove.addEventListener('click', async () => {
      if (await confirmAction('הסרת קבוצת מונחים', `להסיר את הקבוצה ${group.terms.join(', ')}? החומרים עצמם לא יימחקו.`, 'הסרת הקבוצה') && await commitChange('synonym', group, { remove: true })) renderSynonyms();
    });
    actions.append(edit, remove); record.append(details, el('span'), actions); list.append(record);
  });
  if (!data.synonymGroups.length) list.append(el('p', 'text-muted', 'עדיין לא נוספו קבוצות מונחים.'));
}
function openSynonym(group = null) {
  if (!data || busy) return;
  editedSynonym = group ? clone(group) : null;
  synonymId = group?.id || uniqueId('terms');
  $('#synonym-form').reset(); $('#synonym-error').hidden = true;
  $('#synonym-terms').value = group?.terms.join('\n') || '';
  $('#publish-synonym').textContent = publicationLabel(Boolean(group)); smallFormDirty = false;
  showDialog($('#synonym-dialog')); $('#synonym-terms').focus();
}

function openSettings() {
  settingsEpoch++;
  const saved = client?.config || recalled(CONNECTION_KEY) || config.github;
  for (const [id, key] of [['github-owner', 'owner'], ['github-repo', 'repo'], ['github-branch', 'branch'], ['github-path', 'path'], ['github-pages', 'pagesUrl']]) {
    $(`#${id}`).value = saved?.[key] || (key === 'branch' ? 'main' : key === 'path' ? 'data/content.json' : '');
  }
  $('#github-token').value = ''; $('#settings-error').hidden = true;
  showDialog($('#settings-dialog'));
}

async function loadEditor() {
  $('#login-view').hidden = true; $('#editor-view').hidden = false;
  message($('#editor-message'), 'טוענים חומרי העשרה', 'info');
  setBusy(true);
  try {
    data = assertData(await fetchJson('data/content.json'));
    setBusy(false);
    $('#new-item').disabled = false; $('#editor-message').hidden = true;
    refreshSelectors(); updateConnectionDisplay(); await switchView('active', { force: true, focus: false });
    $('#new-item').focus();
  } catch (error) {
    setBusy(false);
    message($('#editor-message'), `לא הצלחנו לטעון את החומרים. ${error.message}`, 'danger');
    const retry = button('ניסיון נוסף'); retry.addEventListener('click', loadEditor); $('#editor-message').append(retry);
    $('#new-item').disabled = true;
  }
}

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('#login-error').hidden = true;
  $('#login-button').disabled = true;
  try {
    if (!config) config = await fetchJson('config.json');
    if ($('#username').value.trim() !== config.login.username || await passwordHash($('#password').value) !== config.login.passwordHash) {
      message($('#login-error'), 'שם המשתמש או הסיסמה אינם נכונים.', 'danger'); $('#username').focus(); return;
    }
    setSession(true); $('#password').value = ''; await loadEditor();
  } catch {
    message($('#login-error'), 'לא ניתן לטעון את הגדרות הכניסה. פתחו דרך שרת מקומי ונסו שוב.', 'danger');
  } finally { $('#login-button').disabled = false; }
});
$('#logout').addEventListener('click', async () => {
  if (!await discardChanges()) return;
  client = null; baselineSha = null; publication = null; clearTimeout(publicationTimer);
  pendingOperation = null; itemDirty = false; smallFormDirty = false;
  $('#github-token').value = ''; setSession(false); $('#editor-view').hidden = true; $('#login-view').hidden = false;
  $('#publication-box').hidden = true; $('#login-error').hidden = true; $('#username').focus();
});
$$('[data-view]').forEach(node => node.addEventListener('click', () => switchView(node.dataset.view)));
$('#new-item').addEventListener('click', () => openItem());
for (const id of ['admin-search', 'admin-course', 'admin-type']) $(`#${id}`).addEventListener(id === 'admin-search' ? 'input' : 'change', renderList);
$('#item-form').addEventListener('input', () => { itemDirty = true; updatePreview(); });
$('#item-form').addEventListener('change', () => { itemDirty = true; updatePreview(); });
$('#cancel-item').addEventListener('click', () => switchView(view));
$('#item-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || !validateItemForm()) return;
  const item = itemValue();
  const duplicate = data.items.find(existing => existing.id !== item.id && canonicalUrl(existing.url) === canonicalUrl(item.url));
  if (duplicate) {
    $('#duplicate-text').textContent = `הקישור משויך לפריט ״${duplicate.title}״${duplicate.status === 'archived' ? ' בארכיון' : ''}. אפשר לערוך אותו או להמשיך כפריט נפרד.`;
    const dialog = $('#duplicate-dialog'); dialog.returnValue = ''; showDialog(dialog);
    const decision = await new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true }));
    if (decision === 'edit') { itemDirty = false; await openItem(duplicate); return; }
    if (decision !== 'continue') return;
  }
  if (await commitChange('item', item)) { itemDirty = false; await switchView(view, { force: true }); }
});

$('#new-course').addEventListener('click', () => openCourse());
$('#course-name').addEventListener('input', () => {
  smallFormDirty = true;
  if (!editedCourse && /[A-Za-z]/.test($('#course-name').value)) {
    const suggestion = normalize($('#course-name').value).replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, '-');
    if (suggestion) $('#course-id').value = suggestion;
  }
});
$('#course-form').addEventListener('input', () => { smallFormDirty = true; });
$('#course-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const value = { id: editedCourse?.id || $('#course-id').value.trim(), name: $('#course-name').value.trim() };
  try { applyChange(data, { kind: 'course', value, operationId: 'validation', timestamp: new Date().toISOString() }); }
  catch (error) { message($('#course-error'), error.message, 'danger'); $('#course-name').focus(); return; }
  if (!editedCourse && data.courses.some(course => course.id === value.id)) { message($('#course-error'), 'מזהה הקורס כבר קיים. בחרו מזהה אחר.', 'danger'); $('#course-id').focus(); return; }
  if (await commitChange('course', value, { errorTarget: $('#course-error') })) {
    smallFormDirty = false; $('#course-dialog').close(); renderCourses();
  }
});
$('#embed-courses').addEventListener('change', updateEmbed); $('#embed-height').addEventListener('input', updateEmbed);
$('#copy-embed-url').addEventListener('click', () => copyText($('#embed-url').value, $('#embed-url')));
$('#copy-embed-code').addEventListener('click', () => { if ($('#embed-height').reportValidity()) copyText($('#embed-code').value, $('#embed-code')); });

$('#new-synonym').addEventListener('click', () => openSynonym());
$('#synonym-form').addEventListener('input', () => { smallFormDirty = true; });
$('#synonym-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const value = { id: synonymId, terms: $('#synonym-terms').value.split('\n').map(term => term.trim()).filter(Boolean) };
  if (await commitChange('synonym', value, { errorTarget: $('#synonym-error') })) {
    smallFormDirty = false; $('#synonym-dialog').close(); renderSynonyms();
  }
});

$('#open-settings').addEventListener('click', openSettings);
$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault(); if ($('#connect-button').disabled || busy) return;
  const settings = {
    owner: $('#github-owner').value.trim(), repo: $('#github-repo').value.trim(), branch: $('#github-branch').value.trim(),
    path: $('#github-path').value.trim(), pagesUrl: $('#github-pages').value.trim()
  };
  const errors = validateConnection(settings);
  if (!$('#github-token').value.trim()) errors.push('יש להזין מפתח גישה');
  if (errors.length) { message($('#settings-error'), errors.join('\n'), 'danger'); return; }
  $('#connect-button').disabled = true; $('#settings-error').hidden = true;
  const epoch = settingsEpoch;
  try {
    const connection = new GitHubClient(settings, $('#github-token').value.trim());
    const latest = await connection.read();
    if (epoch !== settingsEpoch || !$('#settings-dialog').open) return;
    client = connection; data = latest.data; baselineSha = latest.sha;
    remember(CONNECTION_KEY, settings); $('#github-token').value = '';
    pendingOperation = null; $('#settings-dialog').close();
    refreshSelectors(); updateConnectionDisplay();
    if (!$('#item-view').hidden) { const selected = checked($('#item-courses')); checkboxList($('#item-courses'), selected, 'item-course'); updatePreview(); }
    else { if (view === 'courses') renderCourses(); else if (view === 'synonyms') renderSynonyms(); else renderList(); }
    message($('#editor-message'), 'החיבור למאגר נבדק. פרסום יעדכן את קובץ התכנים במאגר.', 'success');
  } catch (error) { message($('#settings-error'), error.message, 'danger'); }
  finally { $('#connect-button').disabled = false; }
});
$('#demo-mode').addEventListener('click', async () => {
  if (busy || !await discardChanges()) return;
  try {
    const sample = assertData(await fetchJson('data/content.json'));
    client = null; baselineSha = null; data = sample; pendingOperation = null;
    $('#github-token').value = ''; $('#settings-dialog').close();
    refreshSelectors(); updateConnectionDisplay(); await switchView('active', { force: true });
  } catch (error) { message($('#settings-error'), error.message, 'danger'); }
});
$('#check-publication').addEventListener('click', () => { clearTimeout(publicationTimer); checkPublication(); });
$('#accept-latest').addEventListener('click', () => {
  if (!conflictLatest) return;
  // Reapply only fields the user actually changed. A concurrent archive or date correction
  // must survive when this form only edited a title or description.
  if (!$('#item-view').hidden && originalItem) {
    const latestItem = conflictLatest.data.items.find(item => item.id === originalItem.id);
    if (latestItem) {
      for (const [field, key] of [['item-title', 'title'], ['item-description', 'description'], ['item-type', 'type'], ['item-url', 'url']]) {
        if ($(`#${field}`).value === originalItem[key]) $(`#${field}`).value = latestItem[key];
      }
      if ($('#item-keywords').value === originalItem.keywords.join(', ')) $('#item-keywords').value = latestItem.keywords.join(', ');
      const selected = checked($('#item-courses'));
      const changedCourses = JSON.stringify([...selected].sort()) !== JSON.stringify([...originalItem.courseIds].sort());
      if ($('#item-added').value === originalDateValue) $('#item-added').value = localDateInput(latestItem.addedAt);
      originalDateValue = localDateInput(latestItem.addedAt); originalItem = clone(latestItem);
      data = conflictLatest.data;
      checkboxList($('#item-courses'), changedCourses ? selected : latestItem.courseIds, 'item-course');
      $('#archive-edit-note').hidden = latestItem.status !== 'archived';
    }
  }
  data = conflictLatest.data; baselineSha = conflictLatest.sha; conflictLatest = null;
  pendingOperation = null; refreshSelectors();
  if (!$('#item-view').hidden) {
    const selected = checked($('#item-courses')); checkboxList($('#item-courses'), selected, 'item-course'); updatePreview();
  } else if (view === 'courses') renderCourses(); else if (view === 'synonyms') renderSynonyms(); else renderList();
  $('#conflict-dialog').close();
  message($('#editor-message'), 'הגרסה העדכנית נטענה. השינוי שלך עדיין לא פורסם; בדקו את הטופס ולחצו שוב על פרסום.', 'info');
});

$$('[data-close-dialog]').forEach(node => node.addEventListener('click', async () => {
  const dialog = node.closest('dialog');
  if (busy || (['course-dialog', 'synonym-dialog'].includes(dialog.id) && !await discardChanges())) return;
  smallFormDirty = false; dialog.close();
}));
for (const id of ['course-dialog', 'synonym-dialog']) {
  $(`#${id}`).addEventListener('cancel', async event => {
    event.preventDefault(); if (!busy && await discardChanges()) { smallFormDirty = false; $(`#${id}`).close(); }
  });
}
$('#settings-dialog').addEventListener('close', () => { settingsEpoch++; $('#github-token').value = ''; });
window.addEventListener('beforeunload', event => {
  if (isDirty() || busy) { event.preventDefault(); event.returnValue = ''; }
});

async function boot() {
  try {
    config = await fetchJson('config.json');
    if (!config.login?.username || !config.login.passwordHash || !config.login.salt) throw new Error();
    if (hasSession()) await loadEditor();
  } catch { message($('#login-error'), 'לא ניתן לטעון את הגדרות המערכת. יש לפתוח דרך שרת מקומי לפי מדריך ההפעלה.', 'danger'); }
}
boot();

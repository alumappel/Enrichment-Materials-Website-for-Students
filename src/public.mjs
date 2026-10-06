import { TYPES, PAGE_SIZE, courseScope, selectItems, fetchJson, assertData } from './core.mjs';
import { $, el, icon, contentCard, options, message, announce } from './dom.mjs';
import { bindDropdown, bindCheckboxLabel } from './dropdown.mjs';

let data, scope, results = [], visible = PAGE_SIZE, query = '', timer, loading = false;
const selectedTypes = new Set();
const region = $('#materials-region');
const grid = $('#materials-grid');
const typeDropdown = $('#type-dropdown');
const typeToggle = $('#type-toggle');
const typeMenu = bindDropdown({ root: typeDropdown, toggle: typeToggle, panel: $('#type-filter-panel'), onOpen: positionTypeDropdown });

function currentCourses() {
  if (scope.restricted) return scope.valid;
  return $('#course-select').value ? [$('#course-select').value] : null;
}

function render({ reset = true } = {}) {
  if (!data) return;
  if (reset) {
    visible = PAGE_SIZE;
    region.scrollTop = 0;
    if (document.body.classList.contains('whole-scroll')) window.scrollTo({ top: 0, behavior: 'instant' });
    grid.replaceChildren();
  }
  const courseIds = currentCourses();
  results = selectItems(data, { courseIds, query, types: [...selectedTypes] });
  const start = reset ? 0 : grid.children.length;
  const cards = results.slice(start, visible);
  const fragment = document.createDocumentFragment();
  cards.forEach(item => {
    const col = el('div', 'col-12 col-md-6 col-lg-4 material-column');
    col.append(contentCard(item, data, { showCourses: courseIds === null || courseIds.length !== 1 }));
    fragment.append(col);
  });
  grid.append(fragment);
  $('#empty-state').hidden = results.length > 0;
  $('#load-more').hidden = visible >= results.length;
  $('#list-end').hidden = !results.length || visible < results.length;
  if (!results.length) {
    const noCourse = scope.restricted && !scope.valid.length;
    const emptyCourse = !noCourse && selectItems(data, { courseIds }).length === 0;
    $('#empty-title').textContent = noCourse ? 'לא נמצא קורס בכתובת הזו' :
      emptyCourse ? 'עדיין לא נוספו חומרי העשרה לקורס הזה' : 'לא נמצאו חומרים מתאימים';
    $('#empty-description').textContent = noCourse ? 'בדקו את הקישור שקיבלתם או פנו למרצה.' :
      emptyCourse ? 'אפשר לחזור לכאן בהמשך.' : 'אפשר לנסות מונח אחר או לנקות את החיפוש והסינון.';
    $('#reset-filters').hidden = noCourse || emptyCourse;
  }
  announce(reset ? `${results.length} חומרים מתאימים` : `נוספו ${cards.length} חומרים. מוצגים ${Math.min(visible, results.length)} מתוך ${results.length}.`);
  if (!reset) grid.children[start]?.querySelector('a')?.focus();
}

function updateQuery() {
  clearTimeout(timer);
  query = $('#search-input').value;
  $('#clear-search').hidden = !query;
  render();
}
function syncTypeFilters() {
  $('#type-filter-label').textContent = selectedTypes.size ? `סוגים (${selectedTypes.size})` : 'סוג התוכן';
  typeToggle.title = selectedTypes.size ? `סוגי התוכן שנבחרו: ${[...selectedTypes].map(type => TYPES[type]).join(', ')}` : 'סינון לפי סוג התוכן — אפשר לבחור כמה סוגים';
  typeToggle.classList.toggle('has-filter', selectedTypes.size > 0);
  $('#type-filters').querySelectorAll('input').forEach(input => { input.checked = selectedTypes.has(input.value); });
}
function applyFilters() {
  clearTimeout(timer); query = $('#search-input').value; render();
}
function closeTypeDropdown({ focus = false } = {}) {
  typeMenu.close({ focus });
}
function positionTypeDropdown() {
  if (typeToggle.getAttribute('aria-expanded') !== 'true') return;
  const bounds = typeToggle.getBoundingClientRect();
  const below = window.innerHeight - bounds.bottom - 24;
  const above = bounds.top - 24;
  const opensAbove = below < 240 && above > below;
  const placement = opensAbove ? 'above' : 'below';
  const height = `${Math.max(64, Math.min(420, opensAbove ? above : below))}px`;
  if (typeDropdown.dataset.placement !== placement) typeDropdown.dataset.placement = placement;
  if (typeDropdown.style.getPropertyValue('--type-panel-height') !== height) typeDropdown.style.setProperty('--type-panel-height', height);
}
function buildFilters() {
  const filters = $('#type-filters');
  Object.entries(TYPES).forEach(([type, label]) => {
    const option = el('div', 'type-option');
    const control = el('input', 'form-check-input');
    control.type = 'checkbox'; control.value = type; control.id = `filter-${type}`;
    const caption = el('label', 'type-option-label');
    caption.htmlFor = control.id;
    caption.append(icon(type), el('span', '', label));
    option.append(control, caption);
    bindCheckboxLabel({ control, caption });
    control.addEventListener('change', () => {
      if (control.checked) selectedTypes.add(type); else selectedTypes.delete(type);
      syncTypeFilters(); applyFilters();
    });
    filters.append(option);
  });
  syncTypeFilters();
}

async function load() {
  if (loading) return;
  loading = true; data = null;
  $('#loading-state').hidden = false; $('#error-state').hidden = true;
  $('#empty-state').hidden = true; $('#load-more').hidden = true; $('#list-end').hidden = true;
  grid.replaceChildren(); closeTypeDropdown();
  region.setAttribute('aria-busy', 'true');
  $('#search-input').disabled = true; $('#course-select').disabled = true;
  announce('טוענים חומרי העשרה');
  try {
    data = assertData(await fetchJson('data/content.json'), { allowDuplicateItems: true });
    scope = courseScope(location.search, data.courses);
    const names = data.courses.filter(course => scope.valid.includes(course.id)).map(course => course.name);
    $('#scope-title').textContent = scope.restricted ? (names.join(' · ') || 'קורס לא מוכר') : 'מכל הקורסים';
    $('#course-control').hidden = scope.restricted;
    options($('#course-select'), data.courses.map(course => [course.id, course.name]), 'כל הקורסים');
    $('#course-warning').hidden = !scope.unknown.length || !scope.valid.length;
    if (scope.unknown.length && scope.valid.length) message($('#course-warning'), `חלק מהקורסים לא נמצאו: ${scope.unknown.join(', ')}. מוצגים רק הקורסים שנמצאו.`, 'warning');
    $('#search-input').disabled = false; $('#course-select').disabled = false;
    render();
  } catch (error) {
    $('#error-state').hidden = false;
    $('#error-detail').textContent = error.name === 'DataError' ? 'קובץ התכנים אינו תקין. פנו למרצה.' :
      location.protocol === 'file:' ? 'יש לפתוח את המערכת דרך שרת מקומי, לפי מדריך ההפעלה.' : 'בדקו את חיבור הרשת ונסו שוב.';
    announce('לא הצלחנו לטעון את החומרים');
  } finally {
    loading = false; $('#loading-state').hidden = true; region.setAttribute('aria-busy', 'false');
    adaptScroll();
  }
}

function adaptScroll() {
  const available = window.innerHeight - $('#public-controls').getBoundingClientRect().height;
  document.body.classList.toggle('whole-scroll', available < 180);
  positionTypeDropdown();
}
buildFilters();
$('#clear-types').addEventListener('click', () => { selectedTypes.clear(); syncTypeFilters(); applyFilters(); });
$('#close-types').addEventListener('click', () => closeTypeDropdown({ focus: true }));
$('#search-input').addEventListener('input', () => {
  $('#clear-search').hidden = !$('#search-input').value;
  clearTimeout(timer); timer = setTimeout(updateQuery, 180);
});
$('#clear-search').addEventListener('click', () => { $('#search-input').value = ''; updateQuery(); $('#search-input').focus(); });
$('#course-select').addEventListener('change', applyFilters);
$('#reset-filters').addEventListener('click', () => {
  $('#search-input').value = ''; query = ''; selectedTypes.clear(); clearTimeout(timer);
  $('#clear-search').hidden = true;
  syncTypeFilters(); closeTypeDropdown();
  render(); $('#search-input').focus();
});
$('#load-more').addEventListener('click', () => { visible += PAGE_SIZE; render({ reset: false }); });
$('#retry-load').addEventListener('click', load);
window.addEventListener('resize', adaptScroll);
window.addEventListener('scroll', positionTypeDropdown, true);
new ResizeObserver(adaptScroll).observe($('#public-controls'));
load();

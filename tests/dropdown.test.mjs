import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as settle } from 'node:timers/promises';
import { bindDropdown, bindCheckboxLabel } from '../src/dropdown.mjs';

// Event-only test doubles; no browser or browser automation is used.
function fixture() {
  const doc = new EventTarget(), root = new EventTarget(), toggle = new EventTarget();
  const checkbox = new EventTarget(), caption = new EventTarget(), outside = {}, panel = { hidden: true };
  const attributes = new Map(), classes = new Set();
  const members = new Set([root, toggle, panel, checkbox, caption]);
  root.ownerDocument = doc;
  root.contains = node => members.has(node);
  root.classList = { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) };
  toggle.getAttribute = name => attributes.get(name);
  toggle.setAttribute = (name, value) => attributes.set(name, value);
  toggle.focus = () => { doc.activeElement = toggle; };
  checkbox.ownerDocument = doc; checkbox.checked = false;
  checkbox.focus = () => { doc.activeElement = checkbox; };
  doc.activeElement = toggle;
  let opened = 0;
  const menu = bindDropdown({ root, toggle, panel, onOpen: () => { opened++; } });
  bindCheckboxLabel({ control: checkbox, caption });
  function click(target) {
    const event = new Event('click');
    Object.defineProperty(event, 'target', { value: target });
    doc.dispatchEvent(event);
  }
  return { doc, root, toggle, checkbox, caption, outside, panel, menu, click, opened: () => opened };
}

test('a label-to-checkbox focus transfer does not hide the panel during activation', async () => {
  const f = fixture();
  f.toggle.dispatchEvent(new Event('click'));
  f.doc.activeElement = null;
  f.root.dispatchEvent(new Event('focusout'));
  assert.equal(f.panel.hidden, false, 'Label activation must be allowed to finish');
  f.click(f.caption);
  f.doc.activeElement = f.checkbox;
  f.click(f.checkbox);
  await settle(10);
  assert.equal(f.menu.isOpen(), true);
  assert.equal(f.panel.hidden, false);
  assert.equal(f.opened(), 1);
});

test('caption selection stays open even when the embedded browser temporarily loses focus', async () => {
  const f = fixture();
  let changes = 0;
  f.checkbox.addEventListener('change', () => { changes++; });
  f.toggle.dispatchEvent(new Event('click'));
  f.root.dispatchEvent(new Event('focusout'));
  const click = new Event('click', { cancelable: true, bubbles: true });
  let stoppedBeforeOutsideHandler = false;
  f.caption.addEventListener('click', event => { stoppedBeforeOutsideHandler = event.cancelBubble; });
  f.caption.dispatchEvent(click);
  f.doc.activeElement = null;
  f.root.dispatchEvent(new Event('focusout'));
  await settle(10);
  assert.equal(f.checkbox.checked, true);
  assert.equal(changes, 1);
  assert.equal(stoppedBeforeOutsideHandler, true);
  assert.equal(f.menu.isOpen(), true);
  assert.equal(f.panel.hidden, false);
  f.caption.dispatchEvent(new Event('click', { cancelable: true, bubbles: true }));
  await settle(10);
  assert.equal(f.checkbox.checked, false);
  assert.equal(changes, 2);
  assert.equal(f.menu.isOpen(), true);
});

test('an inside click with a retargeted event does not count as an outside click', () => {
  const f = fixture();
  f.toggle.dispatchEvent(new Event('click'));
  const click = new Event('click');
  Object.defineProperty(click, 'target', { value: f.outside });
  click.composedPath = () => [f.caption, f.panel, f.root, f.doc];
  f.doc.dispatchEvent(click);
  assert.equal(f.menu.isOpen(), true);
});

test('Escape and outside clicks close the panel; Escape returns focus to the toggle', () => {
  const f = fixture();
  f.toggle.dispatchEvent(new Event('click'));
  f.doc.activeElement = f.checkbox;
  const escape = new Event('keydown', { cancelable: true });
  Object.defineProperty(escape, 'key', { value: 'Escape' });
  f.doc.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);
  assert.equal(f.doc.activeElement, f.toggle);
  assert.equal(f.panel.hidden, true);
  assert.equal(f.toggle.getAttribute('aria-expanded'), 'false');
  f.toggle.dispatchEvent(new Event('click'));
  f.click(f.outside);
  assert.equal(f.menu.isOpen(), false);
});

test('tabbing outside closes after the focus transition without moving focus back', async () => {
  const f = fixture();
  f.toggle.dispatchEvent(new Event('click'));
  const tab = new Event('keydown');
  Object.defineProperty(tab, 'key', { value: 'Tab' });
  f.root.dispatchEvent(tab);
  f.doc.activeElement = f.outside;
  await settle(10);
  assert.equal(f.menu.isOpen(), false);
  assert.equal(f.doc.activeElement, f.outside);
});

test('clicking a checkbox caption selects then deselects, with one change per click', () => {
  const caption = new EventTarget(), control = new EventTarget();
  control.checked = false; control.disabled = false;
  let changes = 0, focusCalls = 0;
  control.focus = () => { focusCalls++; };
  control.click = () => { assert.fail('Caption selection must not create another click'); };
  control.addEventListener('change', () => { changes++; });
  bindCheckboxLabel({ control, caption });
  const first = new Event('click', { cancelable: true });
  caption.dispatchEvent(first);
  assert.equal(first.defaultPrevented, true, 'Native label activation must not toggle it a second time');
  assert.equal(control.checked, true);
  assert.equal(changes, 1);
  caption.dispatchEvent(new Event('click', { cancelable: true }));
  assert.equal(control.checked, false);
  assert.equal(changes, 2);
  assert.equal(focusCalls, 2);
});

test('clicking a disabled checkbox caption does not change or focus it', () => {
  const caption = new EventTarget();
  let calls = 0;
  const control = { disabled: true, focus: () => { calls++; }, click: () => { calls++; } };
  bindCheckboxLabel({ control, caption });
  caption.dispatchEvent(new Event('click', { cancelable: true }));
  assert.equal(calls, 0);
});

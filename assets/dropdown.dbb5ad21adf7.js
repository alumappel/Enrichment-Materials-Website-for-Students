export function bindCheckboxLabel({ control, caption }) {
  caption.addEventListener('click', event => {
    // Apply one change without creating a nested checkbox click that can reach
    // the dropdown's outside-click handler during label activation.
    event.preventDefault();
    event.stopPropagation();
    if (control.disabled) return;
    control.focus({ preventScroll: true });
    control.checked = !control.checked;
    const ChangeEvent = control.ownerDocument?.defaultView?.Event || Event;
    control.dispatchEvent(new ChangeEvent('change', { bubbles: true }));
  });
}

export function bindDropdown({ root, toggle, panel, onOpen = () => {} }) {
  const doc = root.ownerDocument;
  let focusTimer;
  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
  function setOpen(open, { focus = false } = {}) {
    clearTimeout(focusTimer);
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    root.classList.toggle('is-open', open);
    if (open) onOpen();
    if (focus) toggle.focus({ preventScroll: true });
  }
  toggle.addEventListener('click', () => setOpen(!isOpen()));
  // Check focus only after explicit keyboard navigation, never during a label
  // click or a temporary loss of focus in an embedded browser.
  root.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => {
      if (isOpen() && !root.contains(doc.activeElement)) setOpen(false);
    }, 0);
  });
  doc.addEventListener('click', event => {
    const path = event.composedPath?.() || [];
    if (isOpen() && !root.contains(event.target) && !path.includes(root)) setOpen(false);
  });
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen()) {
      event.preventDefault(); setOpen(false, { focus: true });
    }
  });
  setOpen(false);
  return { isOpen, close: options => setOpen(false, options) };
}

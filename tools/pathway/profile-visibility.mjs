// Display preferences only. Canonical profile IDs and design records are unchanged.
const profileAliases = Object.freeze({
  '56-7EX': 'Profile 01',
  '85-7EX': 'Profile 02',
  '85-8EX': 'Profile 03',
  '126-15EX': 'Profile 04',
  '126-20EX': 'Profile 05',
  '126-30EX': 'Profile 06',
  '85-7EXS': 'Profile 07',
  '85-9EXS': 'Profile 08',
  '126-12EXS': 'Profile 09',
  '126-14EXS': 'Profile 10',
  '91-21RO': 'Profile 11',
  '91-37RO': 'Profile 12',
  '91-22ROS': 'Profile 13',
  '91-32ROS': 'Profile 14'
});
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const profilePattern = new RegExp('\\b(?:' + Object.keys(profileAliases).sort((a, b) => b.length - a.length).map(escapePattern).join('|') + ')\\b', 'gi');
const manufacturerPattern = /\bSEKISUI(?:\s+Rib\s*Loc)?\b/gi;
const familyAPattern = /\bExpanda\b/gi;
const familyBPattern = /\bRotaloc\b/gi;
const familyCodePattern = /\bSPR\s+(EX|RO)\b/gi;
const urlPattern = /https?:\/\/[^\s<>"'\\]+/gi;
const storageKey = 'pvc-profile-names-v1';
const unlockCode = 'allyourbasearebelongtous';
let unlocked = false;
try { unlocked = globalThis.sessionStorage.getItem(storageKey) === 'unlocked'; } catch {}

export const profileNamesUnlocked = () => unlocked;

function productSourceURL(href) {
  try {
    const url = new URL(href, globalThis.location?.href || 'https://example.invalid/');
    if (/(^|\.)[^.]*sekisui[^.]*\./i.test(url.hostname)) return true;
    let path = url.pathname;
    try { path = decodeURIComponent(path); } catch {}
    return /(?:^|\/)(?:EX|RO)-Product-Brochures?(?:[_-]|\.)/i.test(path);
  } catch { return false; }
}

function maskNames(value) {
  return value.replace(urlPattern, url => productSourceURL(url) ? '[Product source available after profile names are unlocked]' : url)
    .replace(profilePattern, id => profileAliases[id.toUpperCase()])
    .replace(manufacturerPattern, 'Manufacturer')
    .replace(familyCodePattern, (_, family) => family.toUpperCase() === 'EX' ? 'Family A' : 'Family B')
    .replace(familyAPattern, 'Family A')
    .replace(familyBPattern, 'Family B');
}

export function maskProfileText(text) {
  const value = String(text ?? '');
  return unlocked ? value : maskNames(value);
}

function productSourceLink(anchor) {
  const label = [anchor.textContent, anchor.getAttribute('aria-label'), anchor.getAttribute('title')].filter(Boolean).join(' ');
  if (maskNames(label) !== label) return true;
  return productSourceURL(anchor.getAttribute('href') || '');
}

function maskTree(node) {
  if (node.nodeType === 3) {
    node.nodeValue = maskNames(node.nodeValue);
    return;
  }
  if (node.nodeType === 1) {
    const tag = node.localName.toLowerCase();
    if (tag === 'script' || tag === 'style') return;
    if (tag === 'a' && productSourceLink(node)) {
      const replacement = node.ownerDocument.createElement('span');
      replacement.textContent = 'Source link available after profile names are unlocked.';
      node.replaceWith(replacement);
      return;
    }
    for (const name of ['aria-label', 'title']) {
      if (node.hasAttribute(name)) node.setAttribute(name, maskNames(node.getAttribute(name)));
    }
    if (tag === 'input' || tag === 'textarea') return;
    // An option without a value attribute derives its value from its text.
    // Preserve that original value before changing its visible label.
    if (tag === 'option' && !node.hasAttribute('value')) node.setAttribute('value', node.value);
    if (tag === 'template') {
      maskTree(node.content);
      return;
    }
  }
  for (const child of [...node.childNodes]) maskTree(child);
}

export function presentProfileHTML(html) {
  const source = String(html ?? '');
  if (unlocked) return source;
  if (/<(?:!doctype\s+html\b|html(?:\s|>))/i.test(source)) {
    const parsed = new DOMParser().parseFromString(source, 'text/html');
    maskTree(parsed.documentElement);
    const doctype = parsed.doctype ? new XMLSerializer().serializeToString(parsed.doctype) + '\n' : '';
    return doctype + parsed.documentElement.outerHTML;
  }
  const template = document.createElement('template');
  template.innerHTML = source;
  maskTree(template.content);
  return template.innerHTML;
}

let onVisibilityChange = () => {};
let initialized = false;

export function initProfileVisibility(onChange) {
  onVisibilityChange = typeof onChange === 'function' ? onChange : () => {};
  if (initialized) {
    onVisibilityChange(unlocked);
    return;
  }
  const openButton = document.getElementById('profile-names-open');
  const dialog = document.getElementById('profile-names-dialog');
  const form = document.getElementById('profile-names-form');
  const code = document.getElementById('profile-names-code');
  const error = document.getElementById('profile-names-error');
  const state = document.getElementById('profile-names-state');
  const lockButton = document.getElementById('profile-names-lock');
  if (![openButton, dialog, form, code, error, state, lockButton].every(Boolean)) {
    onVisibilityChange(unlocked);
    return;
  }
  initialized = true;

  function renderControls() {
    form.hidden = unlocked;
    lockButton.hidden = !unlocked;
    state.textContent = unlocked ? 'Profile names are visible for this session.' : 'Profile names are hidden. Enter the code to show them for this session.';
    openButton.setAttribute('aria-label', unlocked ? 'Profile names are visible. Open profile name settings.' : 'Profile names are hidden. Unlock profile names.');
    openButton.title = unlocked ? 'Profile name settings' : 'Unlock profile names';
    openButton.setAttribute('aria-haspopup', 'dialog');
    openButton.setAttribute('aria-controls', dialog.id);
    openButton.setAttribute('aria-expanded', String(dialog.open));
  }

  function setUnlocked(value) {
    const changed = unlocked !== value;
    unlocked = value;
    try {
      if (unlocked) globalThis.sessionStorage.setItem(storageKey, 'unlocked');
      else globalThis.sessionStorage.removeItem(storageKey);
    } catch {}
    renderControls();
    if (changed) onVisibilityChange(unlocked);
  }

  function clearCode() {
    code.value = '';
    error.textContent = '';
    error.hidden = true;
  }

  openButton.addEventListener('click', () => {
    clearCode();
    renderControls();
    if (!dialog.open) dialog.showModal();
    openButton.setAttribute('aria-expanded', 'true');
    (unlocked ? lockButton : code).focus();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (unlocked) return;
    if (code.value.trim() !== unlockCode) {
      code.value = '';
      error.textContent = 'Incorrect code. Try again.';
      error.hidden = false;
      code.focus();
      return;
    }
    clearCode();
    setUnlocked(true);
    dialog.close();
  });
  lockButton.addEventListener('click', () => {
    clearCode();
    setUnlocked(false);
    code.focus();
  });
  dialog.addEventListener('close', () => {
    clearCode();
    openButton.setAttribute('aria-expanded', 'false');
  });
  renderControls();
  onVisibilityChange(unlocked);
}

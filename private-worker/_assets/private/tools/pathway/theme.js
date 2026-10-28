// Apply before styles load so a saved light preference does not flash dark.
(() => {
  const storageKey = 'pvc-pathway-theme';
  const root = document.documentElement;
  const validTheme = value => value === 'light' ? 'light' : 'dark';
  let theme = 'dark';
  try { theme = validTheme(localStorage.getItem(storageKey)); } catch {}
  root.dataset.theme = theme;

  const applyTheme = value => {
    theme = validTheme(value);
    root.dataset.theme = theme;
    const toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.setAttribute('aria-checked', String(theme === 'dark'));
  };

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    applyTheme(theme);
    toggle.addEventListener('click', () => {
      applyTheme(theme === 'dark' ? 'light' : 'dark');
      // Theme still works for this visit if browser storage is unavailable.
      try { localStorage.setItem(storageKey, theme); } catch {}
    });
  }, { once: true });

  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) {
      applyTheme(event.newValue);
    }
  });
})();

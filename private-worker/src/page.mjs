export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function readLinks(raw, origin) {
  if (!raw) return [];
  if (raw.length > 65536) throw new Error('Index is too large');
  const items = JSON.parse(raw);
  if (!Array.isArray(items) || items.length > 100) throw new Error('Invalid index');
  return items.map(item => {
    if (!item || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 120 ||
        typeof item.url !== 'string' || item.url.length > 2048 ||
        (item.description !== undefined && (typeof item.description !== 'string' || item.description.length > 300))) {
      throw new Error('Invalid link');
    }
    const href = item.url.trim();
    if (!href || /[\u0000-\u001f\u007f\\]/.test(href) || href.startsWith('//') ||
        (!href.startsWith('/') && !href.startsWith('https://'))) throw new Error('Invalid URL');
    const url = new URL(href, origin);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid URL');
    return { title: item.title.trim(), url: url.href, description: item.description || '' };
  });
}

export function renderIndex(email, links) {
  const list = links.length
    ? `<nav aria-label="Private links" class="index-links">${links.map(link => `<a class="index-link" href="${escapeHtml(link.url)}"><span><strong>${escapeHtml(link.title)}</strong>${link.description ? `<span class="description">${escapeHtml(link.description)}</span>` : ''}</span><span aria-hidden="true">↗</span></a>`).join('')}</nav>`
    : '<div class="empty"><p>No links added yet.</p><p>Your private index is ready.</p></div>';
  return `<div class="account"><span>Signed in as <strong>${escapeHtml(email)}</strong></span><a href="/cdn-cgi/access/logout">Sign out</a></div>${list}`;
}

export function renderPage(title, content, nonce) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <title>${escapeHtml(title)} · mehz.org</title>
  <link rel="stylesheet" href="/styles.css">
  <style nonce="${nonce}">
    body { height: auto; min-height: 100vh; overflow: auto; font: 1rem/1.6 var(--font-mono, monospace); }
    .site-header { display: flex; align-items: center; justify-content: space-between; gap: 2rem; }
    .brand { animation: none; font-family: var(--font-mono, monospace); }
    a { color: var(--green-bright, #b9ffb1); text-underline-offset: .3em; }
    a:focus-visible { outline: 2px solid #b9ffb1; outline-offset: 6px; }
    .home { font-size: .875rem; }
    main { position: relative; max-width: 56rem; margin: clamp(2rem, 8vh, 7rem) auto; padding: 0 1.5rem 3rem; }
    .eyebrow { color: #86ff7a; font-size: .875rem; letter-spacing: .16em; text-transform: uppercase; }
    h1 { margin: .3rem 0 2rem; font-size: clamp(2rem, 6vw, 3.5rem); font-weight: 500; line-height: 1.2; }
    .account { display: flex; justify-content: space-between; align-items: start; gap: 1.5rem; flex-wrap: wrap; padding-bottom: 1.5rem; border-bottom: 1px solid #25412a; color: #b6c9b8; font-size: .875rem; }
    .account strong { display: block; color: #f2fff1; font-weight: 400; overflow-wrap: anywhere; }
    .index-links { margin-top: 1.5rem; }
    .index-link { display: flex; justify-content: space-between; align-items: center; gap: 1.5rem; padding: 1.4rem 0; border-bottom: 1px solid #25412a; text-decoration: none; overflow-wrap: anywhere; }
    .index-link:hover strong { text-decoration: underline; text-underline-offset: .3em; }
    .index-link strong { font-size: 1.125rem; font-weight: 500; }
    .description { display: block; margin-top: .35rem; color: #b6c9b8; font-size: .875rem; }
    .empty { margin-top: 2rem; padding: 2rem; border: 1px dashed #34523a; }
    .empty p { margin: 0; }
    .empty p + p { margin-top: .5rem; color: #b6c9b8; font-size: .875rem; }
    @media (max-width: 480px) { .site-header { gap: 1rem; } main { padding-inline: 1.125rem; } .empty { padding: 1.25rem; } }
  </style>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="/private/" aria-label="Private mehz.org index">[ mehz.org ]</a>
    <a class="home" href="/">Home</a>
  </header>
  <main id="main">
    <p class="eyebrow">Private space</p>
    <h1>${escapeHtml(title)}</h1>
    ${content}
  </main>
</body>
</html>`;
}

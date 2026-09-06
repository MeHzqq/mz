/* Display detected values only. No storage, telemetry or permission requests. */
(() => {
  'use strict';
  let list = document.getElementById('detected-details');
  // Handle older HTML cached during deployment.
  if (!list) {
    const main = document.querySelector('main');
    if (!main) return;
    main.className = 'visitor';
    const title = document.createElement('h1');
    title.textContent = 'Detected details';
    title.id = 'visitor-title';
    main.setAttribute('aria-labelledby', title.id);
    list = document.createElement('dl');
    list.id = 'detected-details';
    list.className = 'visitor-list';
    main.replaceChildren(title, list);
  }
  const status = document.getElementById('visitor-status');
  const rows = [];
  const safe = read => { try { return read(); } catch { return undefined; } };
  const media = query => safe(() => matchMedia(query).matches) === true;
  const units = (value, unit) => typeof value === 'number' && Number.isFinite(value) ? value + ' ' + unit : null;
  const positive = value => typeof value === 'number' && value > 0 ? value : null;
  function add(label, value) {
    if (value === undefined || value === null || value === '' || value === false) return;
    rows.push([label, String(value)]);
  }
  function render() {
    const fragment = document.createDocumentFragment();
    for (const [label, value] of rows) {
      const row = document.createElement('div');
      row.className = 'visitor-row';
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = label;
      detail.textContent = value;
      row.append(term, detail);
      fragment.append(row);
    }
    list.replaceChildren(fragment);
  }
  function browserDetails() {
    const ua = safe(() => navigator.userAgent);
    const hints = safe(() => navigator.userAgentData);
    const browsers = [
      ['Edge', /Edg(?:A|iOS)?\/([\d.]+)/], ['Opera', /(?:OPR|OPiOS)\/([\d.]+)/],
      ['Samsung Internet', /SamsungBrowser\/([\d.]+)/], ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
      ['Chrome / Chromium', /(?:Chrome|CriOS)\/([\d.]+)/], ['Safari', /Version\/([\d.]+).*Safari/],
    ];
    for (const [name, pattern] of browsers) {
      const match = ua?.match(pattern);
      if (match) { add('Browser (reported)', name + ' ' + match[1]); break; }
    }
    add('Platform (reported)', safe(() => hints.platform) || safe(() => navigator.platform));
    const now = new Date();
    add('Time zone', safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone));
    const offset = -now.getTimezoneOffset();
    add('UTC offset', (offset < 0 ? '-' : '+') + String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0') + ':' + String(Math.abs(offset) % 60).padStart(2, '0'));
    add('Local time', safe(() => now.toLocaleString()));
    add('Languages', safe(() => navigator.languages.join(', ')) || safe(() => navigator.language));
    add('Screen', safe(() => screen.width > 0 && screen.height > 0 ? screen.width + ' × ' + screen.height + ' CSS px' : null));
    add('Window viewport', innerWidth + ' × ' + innerHeight + ' CSS px');
    add('Pixel ratio', safe(() => window.devicePixelRatio));
    add('Color depth', units(positive(safe(() => screen.colorDepth)), 'bits'));
    add('Orientation', safe(() => screen.orientation.type));
    add('Touch points', positive(safe(() => navigator.maxTouchPoints)));
    add('Pointer', media('(pointer: fine)') ? 'Fine / mouse' : media('(pointer: coarse)') ? 'Coarse / touch' : null);
    add('Hover input', media('(any-hover: hover)') ? 'Supported' : null);
    add('Color gamut', media('(color-gamut: rec2020)') ? 'Rec. 2020' : media('(color-gamut: p3)') ? 'Display P3' : media('(color-gamut: srgb)') ? 'sRGB' : null);
    add('HDR', media('(dynamic-range: high)') ? 'Supported' : null);
    add('CPU threads (reported)', positive(safe(() => navigator.hardwareConcurrency)));
    add('Memory (approx.)', units(positive(safe(() => navigator.deviceMemory)), 'GiB'));
    const gl = safe(() => document.createElement('canvas').getContext('webgl'));
    const debug = safe(() => gl.getExtension('WEBGL_debug_renderer_info'));
    add('Graphics vendor', safe(() => gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR)));
    add('Graphics renderer', safe(() => gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER)));
    add('Graphics API', safe(() => gl.getParameter(gl.VERSION)));
    safe(() => gl.getExtension('WEBGL_lose_context')?.loseContext());
    const connection = safe(() => navigator.connection || navigator.mozConnection || navigator.webkitConnection);
    const type = safe(() => connection.type);
    add('Connection', type && !['unknown', 'none', 'other'].includes(type) ? type : null);
    add('Network class (est.)', safe(() => connection.effectiveType));
    add('Downlink (estimated)', units(safe(() => connection.downlink), 'Mbps'));
    add('Round-trip (estimated)', units(safe(() => connection.rtt), 'ms'));
    add('Data saver', safe(() => connection.saveData) === true ? 'Enabled' : null);
    add('Color preference', media('(prefers-color-scheme: dark)') ? 'Dark' : media('(prefers-color-scheme: light)') ? 'Light' : null);
    add('Reduced motion', media('(prefers-reduced-motion: reduce)') ? 'Enabled' : null);
    add('Contrast preference', media('(prefers-contrast: more)') ? 'More' : media('(prefers-contrast: less)') ? 'Less' : media('(prefers-contrast: custom)') ? 'Custom' : null);
    add('Forced colors', media('(forced-colors: active)') ? 'Enabled' : null);
    add('Global Privacy Control', safe(() => navigator.globalPrivacyControl) === true ? 'Requested' : null);
    add('Do Not Track', safe(() => navigator.doNotTrack) === '1' ? 'Requested' : null);
    add('PDF viewer', safe(() => navigator.pdfViewerEnabled) === true ? 'Built in' : null);
    add('Referring site', document.referrer ? safe(() => new URL(document.referrer).origin) : null);
    add('User agent', ua);
  }
  async function networkDetails() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch('/cdn-cgi/trace', { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: controller.signal });
      if (!response.ok) return;
      const text = await response.text();
      if (text.length > 16000) return;
      const fields = Object.fromEntries(text.trim().split(/\r?\n/).map(line => {
        const i = line.indexOf('=');
        return i > 0 ? [line.slice(0, i), line.slice(i + 1)] : ['', ''];
      }));
      const network = [];
      if (fields.ip && /^[\da-fA-F:.]+$/.test(fields.ip)) network.push(['Public IP', fields.ip]);
      if (/^[A-Z]{2}$/.test(fields.loc || '') && !['XX', 'T1'].includes(fields.loc)) {
        const country = safe(() => new Intl.DisplayNames(navigator.languages, { type: 'region' }).of(fields.loc)) || fields.loc;
        network.push(['Country (IP estimate)', country + ' (' + fields.loc + ')']);
      }
      if (/^(h2|h3|http\/[\d.]+)$/i.test(fields.http || '')) network.push(['HTTP protocol', fields.http]);
      if (/^TLSv[\d.]+$/.test(fields.tls || '')) network.push(['TLS version', fields.tls]);
      rows.unshift(...network);
    } catch { /* Unavailable readings are simply omitted. */ }
    finally { clearTimeout(timeout); }
  }
  safe(browserDetails);
  render();
  networkDetails().finally(() => { render(); if (status) status.hidden = true; });
})();

/* Read-only visitor snapshot. No persistence, telemetry, fingerprint hash,
 * permission requests, media capture, port scans or third-party IP services. */
(() => {
  'use strict';
  const root = document.getElementById('visitor-results');
  if (!root) return;
  const groupRoot = document.getElementById('signal-groups');
  const filterInput = document.getElementById('signal-filter');
  const refreshButton = document.getElementById('refresh-signals');
  const status = document.getElementById('snapshot-status');
  const unavailable = 'Not exposed';
  const groups = [
    ['network', 'Network & approximate location', 'These details describe the connection reaching this site. They may belong to a VPN, proxy or shared network.'],
    ['browser', 'Browser & software', 'Self-reported identifiers can be reduced, altered or shared by multiple browsers. They are not a verified device inventory.'],
    ['locale', 'Language & regional settings', 'Preferences can suggest a region. They cannot establish where you actually are.'],
    ['display', 'Screen & input', 'Dimensions are in CSS pixels unless stated otherwise. Scaling and privacy protection can change the values.'],
    ['hardware', 'Device & graphics', 'Reported capabilities may be capped or generic. Graphics details can describe a software renderer or virtual machine.'],
    ['privacy', 'Privacy & this page', 'These are browser signals and this page’s context, not a test of whether you can be tracked.'],
  ];
  let rows = [];
  let running = false;
  const safe = (read, fallback = null) => { try { return read() ?? fallback; } catch { return fallback; } };
  const yesNo = value => typeof value === 'boolean' ? (value ? 'Yes' : 'No') : null;
  const units = (value, unit) => typeof value === 'number' && Number.isFinite(value) ? `${value} ${unit}` : null;
  const media = query => safe(() => matchMedia(query).matches, false);
  function setSummary(id, value) { document.getElementById(`summary-${id}`).textContent = value || unavailable; }
  function add(group, label, value, source = 'BROWSER', note = '') {
    const exposed = value !== null && value !== undefined && value !== '';
    rows.push({ group, label, value: exposed ? String(value) : unavailable, source, note, exposed });
  }
  function browserLabel() {
    const ua = safe(() => navigator.userAgent, '');
    const candidates = [
      ['Microsoft Edge', /Edg(?:A|iOS)?\/([\d.]+)/], ['Opera', /(?:OPR|OPiOS)\/([\d.]+)/],
      ['Samsung Internet', /SamsungBrowser\/([\d.]+)/], ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
      ['Chrome / Chromium', /(?:Chrome|CriOS)\/([\d.]+)/], ['Safari', /Version\/([\d.]+).*Safari/],
    ];
    for (const [name, pattern] of candidates) {
      const match = ua.match(pattern);
      if (match) return `${name} ${match[1]}`;
    }
    return 'Unidentified browser';
  }
  function render() {
    const query = filterInput.value.trim().toLowerCase();
    const fragment = document.createDocumentFragment();
    let matched = 0;
    groups.forEach(([id, title, description], index) => {
      const selected = rows.filter(row => row.group === id && (!query ||
        `${title} ${row.label} ${row.value} ${row.source} ${row.note}`.toLowerCase().includes(query)));
      if (!selected.length) return;
      matched += selected.length;
      const section = document.createElement('section');
      section.className = 'signal-panel';
      section.setAttribute('aria-labelledby', `panel-${id}`);
      const heading = document.createElement('div');
      heading.className = 'panel-heading';
      const number = document.createElement('span');
      number.className = 'panel-number';
      number.textContent = String(index + 1).padStart(2, '0');
      const h2 = document.createElement('h2');
      h2.id = `panel-${id}`;
      h2.textContent = title;
      heading.append(number, h2);
      const intro = document.createElement('p');
      intro.className = 'panel-description';
      intro.textContent = description;
      const dl = document.createElement('dl');
      selected.forEach(row => {
        const item = document.createElement('div');
        item.className = 'signal-row';
        const term = document.createElement('dt');
        term.append(document.createTextNode(row.label));
        const badge = document.createElement('span');
        badge.className = 'source-label';
        badge.textContent = row.source;
        term.append(badge);
        const detail = document.createElement('dd');
        const value = document.createElement('span');
        value.className = 'signal-value';
        // All browser and network values are untrusted text, never HTML.
        value.textContent = row.value;
        detail.append(value);
        if (row.note) {
          const note = document.createElement('small');
          note.className = 'signal-note';
          note.textContent = row.note;
          detail.append(note);
        }
        item.append(term, detail);
        dl.append(item);
      });
      section.append(heading, intro, dl);
      fragment.append(section);
    });
    groupRoot.replaceChildren(fragment);
    document.getElementById('no-signals').hidden = matched > 0;
    const exposed = rows.filter(row => row.exposed).length;
    document.getElementById('signal-count').textContent = query
      ? `${matched} of ${rows.length} details match`
      : `${rows.length} details checked · ${exposed} available in this browser`;
  }
  function readBrowser() {
    const hints = safe(() => navigator.userAgentData);
    const browser = browserLabel();
    setSummary('browser', browser);
    add('browser', 'Browser / version', browser, 'ESTIMATE', 'Parsed from the user agent. Exact versions can be frozen, and embedded browsers may identify as Chrome.');
    add('browser', 'User agent', safe(() => navigator.userAgent), 'BROWSER', 'Sites also commonly receive this identifier in request headers.');
    add('browser', 'Browser brands', safe(() => hints.brands.filter(item => !/not.*brand/i.test(item.brand)).map(item => `${item.brand} ${item.version}`).join(' · ')), 'BROWSER', 'Low-entropy client hints, if supported. No additional high-entropy hints are requested.');
    add('browser', 'Reported OS / platform', safe(() => hints.platform) || safe(() => navigator.platform), 'BROWSER', 'A compatibility label, not a reliable OS edition or version.');
    add('browser', 'Browser vendor', safe(() => navigator.vendor));
    add('browser', 'Mobile indicator', yesNo(safe(() => hints.mobile)), 'BROWSER', 'A browser hint, not a definite device type.');
    add('browser', 'Built-in PDF viewer', yesNo(safe(() => navigator.pdfViewerEnabled)));
    add('browser', 'JavaScript', 'Running');
  }
  function readLocale() {
    const now = new Date();
    const options = safe(() => Intl.DateTimeFormat().resolvedOptions(), {});
    const minutes = -now.getTimezoneOffset();
    const offset = `UTC${minutes >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`;
    setSummary('zone', options.timeZone);
    add('locale', 'Time zone', options.timeZone, 'BROWSER', 'An OS/browser setting. A city in the zone name is not a detected location.');
    add('locale', 'UTC offset', offset, 'BROWSER', 'At snapshot time; daylight saving can change it.');
    add('locale', 'Local date & time', safe(() => now.toLocaleString()), 'BROWSER', 'Device clock at snapshot time; it may be inaccurate.');
    add('locale', 'Primary language', safe(() => navigator.language));
    add('locale', 'Preferred languages', safe(() => navigator.languages.join(', ')), 'BROWSER', 'A similar language preference may be sent in request headers.');
    add('locale', 'Formatting locale', options.locale);
    add('locale', 'Calendar', options.calendar);
    add('locale', 'Numbering system', options.numberingSystem);
  }
  function readDisplay() {
    const scr = window.screen;
    add('display', 'Screen dimensions', safe(() => `${scr.width} × ${scr.height} CSS px`));
    add('display', 'Available screen area', safe(() => `${scr.availWidth} × ${scr.availHeight} CSS px`), 'BROWSER', 'Can exclude OS interface space; browsers may standardize this value.');
    add('display', 'Page viewport', `${innerWidth} × ${innerHeight} CSS px`, 'BROWSER', 'Changes when you resize the window or rotate the device. Refresh to update.');
    add('display', 'Browser outer window', `${outerWidth} × ${outerHeight} CSS px`);
    add('display', 'Device pixel ratio', safe(() => window.devicePixelRatio), 'BROWSER', 'Affected by display scaling and page zoom. Not a reliable zoom percentage.');
    add('display', 'Color depth', units(safe(() => scr.colorDepth), 'bits per pixel'));
    add('display', 'Pixel depth', units(safe(() => scr.pixelDepth), 'bits per pixel'));
    add('display', 'Orientation', safe(() => scr.orientation.type) || (media('(orientation: portrait)') ? 'Portrait viewport' : 'Landscape viewport'));
    add('display', 'Maximum touch points', safe(() => navigator.maxTouchPoints), 'BROWSER', 'Touch capability does not prove that this is a phone.');
    add('display', 'Primary pointer', media('(pointer: fine)') ? 'Fine (e.g. mouse)' : media('(pointer: coarse)') ? 'Coarse (e.g. touch)' : 'No primary pointer reported');
    add('display', 'Hover capability', media('(any-hover: hover)') ? 'At least one input supports hover' : 'No hover input reported');
    add('display', 'Color gamut', media('(color-gamut: rec2020)') ? 'Rec. 2020' : media('(color-gamut: p3)') ? 'Display P3' : media('(color-gamut: srgb)') ? 'sRGB' : null);
    add('display', 'High dynamic range', media('(dynamic-range: high)') ? 'High dynamic range reported' : 'Not reported / standard range');
  }
  function readHardware() {
    add('hardware', 'Logical processors', safe(() => navigator.hardwareConcurrency), 'BROWSER', 'Threads made available to the browser, not necessarily the physical core count.');
    add('hardware', 'Approximate device memory', units(safe(() => navigator.deviceMemory), 'GiB'), 'ESTIMATE', 'A rounded, capped RAM bucket where supported; not exact installed memory.');
    const canvas = document.createElement('canvas');
    const gl = safe(() => canvas.getContext('webgl'));
    const debug = safe(() => gl.getExtension('WEBGL_debug_renderer_info'));
    add('hardware', 'WebGL availability', gl ? 'Available' : null, 'BROWSER', 'A temporary graphics context is used; no canvas image or fingerprint hash is produced.');
    add('hardware', 'Graphics vendor', safe(() => debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)));
    add('hardware', 'Graphics renderer', safe(() => debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)), 'BROWSER', 'May expose a GPU model; privacy settings can substitute a generic renderer.');
    add('hardware', 'WebGL version', safe(() => gl.getParameter(gl.VERSION)));
    add('hardware', 'Maximum texture size', units(safe(() => gl.getParameter(gl.MAX_TEXTURE_SIZE)), 'px'));
    safe(() => gl.getExtension('WEBGL_lose_context')?.loseContext());
  }
  function readPrivacy() {
    const gpc = safe(() => navigator.globalPrivacyControl);
    const dnt = safe(() => navigator.doNotTrack);
    add('privacy', 'Global Privacy Control', typeof gpc === 'boolean' ? (gpc ? 'Requested' : 'Not requested') : null, 'BROWSER', 'A preference signal, not proof that tracking is blocked.');
    add('privacy', 'Do Not Track', dnt === '1' ? 'Requested' : dnt === '0' ? 'Not requested' : null, 'BROWSER', 'An older, widely unsupported preference signal.');
    add('privacy', 'Cookies enabled flag', yesNo(safe(() => navigator.cookieEnabled)), 'BROWSER', 'Does not establish third-party cookie policy. Cookie contents are not read.');
    add('privacy', 'Secure context', yesNo(window.isSecureContext));
    add('privacy', 'Color scheme preference', media('(prefers-color-scheme: dark)') ? 'Dark' : media('(prefers-color-scheme: light)') ? 'Light' : 'No preference exposed');
    add('privacy', 'Reduced motion preference', media('(prefers-reduced-motion: reduce)') ? 'Reduce motion' : 'No reduction requested');
    add('privacy', 'Contrast preference', media('(prefers-contrast: more)') ? 'More contrast' : media('(prefers-contrast: less)') ? 'Less contrast' : media('(prefers-contrast: custom)') ? 'Custom' : 'No preference exposed');
    add('privacy', 'Forced colors mode', media('(forced-colors: active)') ? 'Active' : 'Not active / not exposed');
    add('privacy', 'Automation indicator', yesNo(safe(() => navigator.webdriver)), 'BROWSER', 'A self-reported automation flag, not a dependable bot detector.');
    add('privacy', 'Referring origin', document.referrer ? safe(() => new URL(document.referrer).origin) : 'None supplied', 'BROWSER', 'Only the origin is displayed. Referrer policy can suppress or shorten the referring URL.');
    add('privacy', 'Page visibility', document.visibilityState);
    add('privacy', 'Navigation type', safe(() => performance.getEntriesByType('navigation')[0].type));
  }
  function readConnection() {
    const connection = safe(() => navigator.connection || navigator.mozConnection || navigator.webkitConnection);
    add('network', 'Browser online flag', yesNo(safe(() => navigator.onLine)), 'BROWSER', 'A connectivity hint; it does not guarantee internet access.');
    add('network', 'Connection type', safe(() => connection.type), 'BROWSER', 'Often withheld; no network scan is performed.');
    add('network', 'Effective connection class', safe(() => connection.effectiveType), 'ESTIMATE', 'A performance class such as 4g, not confirmation of your mobile radio type.');
    add('network', 'Estimated downlink', units(safe(() => connection.downlink), 'Mbps'), 'ESTIMATE', 'A rounded browser estimate, not a speed test or your plan speed.');
    add('network', 'Estimated round-trip time', units(safe(() => connection.rtt), 'ms'), 'ESTIMATE', 'A browser estimate; no ping test is run.');
    add('network', 'Reduced data preference', yesNo(safe(() => connection.saveData)));
  }
  async function readNetwork() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    let trace = null;
    try {
      // Same-origin only. Do not send cookies, query values or browser readings.
      const response = await fetch('/cdn-cgi/trace', {
        cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
        redirect: 'error', signal: controller.signal,
      });
      if (!response.ok) throw new Error('Network diagnostic unavailable');
      const text = await response.text();
      if (text.length > 16000) throw new Error('Unexpected diagnostic response');
      const fields = Object.fromEntries(text.trim().split(/\r?\n/).map(line => {
        const separator = line.indexOf('=');
        return separator > 0 ? [line.slice(0, separator), line.slice(separator + 1)] : ['', ''];
      }));
      if (!fields.ip || !/^[\da-fA-F:.]+$/.test(fields.ip)) throw new Error('No public IP supplied');
      trace = fields;
    } catch {
      // Fail closed to an honest unavailable state, never a third-party fallback.
    } finally { clearTimeout(timeout); }
    const countryCode = trace && /^[A-Z]{2}$/.test(trace.loc) ? trace.loc : null;
    const country = countryCode ? safe(() => new Intl.DisplayNames(navigator.languages, { type: 'region' }).of(countryCode), countryCode) : null;
    setSummary('ip', trace?.ip || 'Unavailable');
    setSummary('country', country || 'Unavailable');
    const serverRows = [];
    const previous = rows;
    rows = serverRows;
    add('network', 'Public IP address', trace?.ip, 'NETWORK', 'The address seen for this request. It may be shared or belong to a VPN/proxy; it is not your local LAN address.');
    add('network', 'IP address family', trace?.ip ? (trace.ip.includes(':') ? 'IPv6' : 'IPv4') : null, 'NETWORK', 'Only the address family used by this request is observed.');
    add('network', 'Approximate country', country ? `${country} (${countryCode})` : null, 'ESTIMATE', 'IP-based country estimate from Cloudflare. Not GPS, a city, or your home address.');
    add('network', 'HTTP protocol', trace?.http, 'NETWORK', 'Protocol used between this browser and Cloudflare.');
    add('network', 'TLS version', trace?.tls, 'NETWORK', 'Encryption protocol for the connection to Cloudflare.');
    add('network', 'Cloudflare data center', trace?.colo, 'NETWORK', 'The network location serving this request, not your physical location.');
    rows = [...serverRows, ...previous];
    return Boolean(trace);
  }
  async function refresh() {
    if (running) return;
    running = true;
    refreshButton.disabled = true;
    rows = [];
    status.textContent = 'Reading available signals…';
    setSummary('ip', 'Checking…');
    setSummary('country', 'Checking…');
    try {
      [readBrowser, readLocale, readDisplay, readHardware, readPrivacy, readConnection].forEach(read => safe(read));
      root.hidden = false;
      render();
      const networkAvailable = await readNetwork();
      render();
      status.textContent = `Snapshot: ${new Date().toLocaleTimeString()}. ${networkAvailable
        ? 'Network details loaded from this site. No permission requests made.'
        : 'Network lookup unavailable or blocked. Browser details still work; no outside lookup was attempted.'}`;
    } finally {
      running = false;
      refreshButton.disabled = false;
    }
  }
  filterInput.addEventListener('input', render);
  refreshButton.addEventListener('click', refresh);
  const motionButton = document.getElementById('toggle-motion');
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  function updateMotionPreference() {
    if (motionPreference.matches) {
      document.body.classList.add('motion-hidden');
      motionButton.textContent = 'Reduced motion active';
      motionButton.setAttribute('aria-pressed', 'true');
      motionButton.disabled = true;
    } else {
      motionButton.disabled = false;
      motionButton.textContent = document.body.classList.contains('motion-hidden') ? 'Show animation' : 'Hide animation';
      motionButton.setAttribute('aria-pressed', String(document.body.classList.contains('motion-hidden')));
    }
  }
  motionPreference.addEventListener?.('change', updateMotionPreference);
  motionButton.addEventListener('click', () => {
    document.body.classList.toggle('motion-hidden');
    updateMotionPreference();
  });
  updateMotionPreference();
  refresh();
})();

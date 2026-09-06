/* Local display only. No event contents, device IDs, profiles or telemetry are sent. */
window.addEventListener('visitor-ready', event => {
  'use strict';
  const { add, render, remove } = event.detail;
  const read = fn => { try { return fn(); } catch { return undefined; } };
  const show = (label, value) => { add(label, value); render(); };
  const number = value => typeof value === 'number' && Number.isFinite(value);
  const round = value => Math.round(value * 10) / 10;
  const duration = milliseconds => {
    const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
    return Math.floor(seconds / 60) + 'm ' + String(seconds % 60).padStart(2, '0') + 's';
  };
  const start = performance.now();
  let lastActivity = start;
  let visibleStart = document.hidden ? null : start;
  let visibleTotal = 0;
  let clicks = 0;
  let pointer = null;
  let pointerFrame = false;
  const activity = () => { lastActivity = performance.now(); };
  document.addEventListener('pointermove', e => {
    activity();
    pointer = { x: Math.round(e.clientX), y: Math.round(e.clientY), type: e.pointerType, pressure: e.pressure };
    if (pointerFrame) return;
    pointerFrame = true;
    requestAnimationFrame(() => {
      pointerFrame = false;
      show('Pointer position', 'X ' + pointer.x + ' · Y ' + pointer.y + ' px');
      show('Pointer device', pointer.type);
      if (pointer.type === 'pen' && number(pointer.pressure)) show('Pen pressure', round(pointer.pressure * 100) + '%');
    });
  }, { passive: true });
  document.addEventListener('pointerleave', () => { remove('Pointer position'); remove('Pen pressure'); });
  document.addEventListener('click', () => { activity(); show('Clicks on page', ++clicks); }, { passive: true });
  document.addEventListener('keydown', activity, { passive: true });
  document.addEventListener('touchstart', activity, { passive: true });
  function scrollDetails() {
    const maximum = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    show('Scroll position', Math.round(scrollY) + ' px');
    if (maximum > 0) show('Page scrolled', Math.round(Math.max(0, Math.min(1, scrollY / maximum)) * 100) + '%');
    else remove('Page scrolled');
  }
  window.addEventListener('scroll', () => { activity(); scrollDetails(); }, { passive: true });
  window.addEventListener('resize', () => { show('Window viewport', innerWidth + ' × ' + innerHeight + ' CSS px'); scrollDetails(); });
  function visibility() {
    const now = performance.now();
    if (visibleStart !== null) visibleTotal += now - visibleStart;
    visibleStart = document.hidden ? null : now;
    show('Tab visibility', document.hidden ? 'Hidden' : 'Visible');
  }
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('focus', () => show('Window focus', 'Focused'));
  window.addEventListener('blur', () => show('Window focus', 'Unfocused'));
  function tick() {
    const now = performance.now();
    add('Time on page', duration(now - start));
    add('Time visible', duration(visibleTotal + (visibleStart === null ? 0 : now - visibleStart)));
    add('Since last activity', duration(now - lastActivity));
    render();
  }
  visibility();
  show('Window focus', document.hasFocus() ? 'Focused' : 'Unfocused');
  tick();
  const timer = setInterval(tick, 1000);
  window.addEventListener('pagehide', e => { if (!e.persisted) clearInterval(timer); });
  const connection = read(() => navigator.connection);
  const connectionChange = () => {
    if (number(connection?.downlink)) show('Downlink (estimated)', connection.downlink + ' Mbps');
    if (number(connection?.rtt)) show('Round-trip (estimated)', connection.rtt + ' ms');
    show('Network class (est.)', connection?.effectiveType);
  };
  connection?.addEventListener('change', connectionChange);
  const online = () => show('Browser connectivity', navigator.onLine ? 'Online' : 'Offline');
  window.addEventListener('online', online);
  window.addEventListener('offline', online);
  online();
  function pageTimings() {
    const entry = performance.getEntriesByType('navigation')[0];
    if (!entry) return;
    if (entry.loadEventEnd > 0) show('Page load', round(entry.loadEventEnd - entry.startTime) + ' ms');
    if (entry.responseStart > 0) show('First response byte', round(entry.responseStart - entry.startTime) + ' ms');
    if (entry.domainLookupEnd > entry.domainLookupStart) show('DNS lookup', round(entry.domainLookupEnd - entry.domainLookupStart) + ' ms');
    if (entry.connectEnd > entry.connectStart) show('Connection setup', round(entry.connectEnd - entry.connectStart) + ' ms');
    if (entry.secureConnectionStart > 0 && entry.connectEnd > entry.secureConnectionStart) show('TLS handshake', round(entry.connectEnd - entry.secureConnectionStart) + ' ms');
    if (entry.transferSize > 0) show('Page transfer', round(entry.transferSize / 1024) + ' KiB');
    show('Navigation', entry.type);
    show('Negotiated protocol', entry.nextHopProtocol);
  }
  if (document.readyState === 'complete') pageTimings();
  else window.addEventListener('load', () => setTimeout(pageTimings, 0), { once: true });

  // These queries return only data already exposed by the browser; no requestDevice,
  // requestPort, getUserMedia, geolocation, local-network request or ICE gathering.
  const tasks = [];
  const task = fn => { tasks.push(Promise.resolve().then(fn).catch(() => {})); };
  task(async () => {
    const hints = await navigator.userAgentData?.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion', 'fullVersionList', 'formFactors']);
    if (!hints) return;
    const brands = hints.fullVersionList?.filter(item => !/not.*brand/i.test(item.brand));
    show('Full browser versions', brands?.map(item => item.brand + ' ' + item.version).join(' · '));
    show('OS platform hint', hints.platform && hints.platformVersion ? hints.platform + ' ' + hints.platformVersion : null);
    show('CPU architecture', hints.architecture);
    show('Browser bitness', hints.bitness ? hints.bitness + '-bit' : null);
    show('Device model', hints.model);
    show('Device form', hints.formFactors?.join(', '));
  });
  task(async () => {
    if (!navigator.getBattery) return;
    const battery = await navigator.getBattery();
    const update = () => {
      if (number(battery.level)) show('Battery (reported)', Math.round(battery.level * 100) + '%');
      if (typeof battery.charging === 'boolean') show('Power state', battery.charging ? 'Charging / external power' : 'Battery');
      if (number(battery.dischargingTime) && battery.dischargingTime > 0) show('Battery time (est.)', duration(battery.dischargingTime * 1000));
      else remove('Battery time (est.)');
    };
    update();
    battery.addEventListener('levelchange', update);
    battery.addEventListener('chargingchange', update);
  });
  task(async () => {
    const devices = await navigator.mediaDevices?.enumerateDevices();
    if (!devices) return;
    for (const [kind, title] of [['videoinput', 'Cameras exposed'], ['audioinput', 'Microphones exposed'], ['audiooutput', 'Audio outputs exposed']]) {
      const selected = devices.filter(device => device.kind === kind);
      const names = [...new Set(selected.map(device => device.label).filter(Boolean))];
      if (selected.length) show(title, names.length ? names.join(' · ') : selected.length + ' (names hidden)');
    }
  });
  task(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    const info = adapter?.info;
    if (info) {
      show('WebGPU vendor', info.vendor);
      show('GPU architecture', info.architecture);
      show('WebGPU device', [info.device, info.description].filter(Boolean).join(' · '));
      show('GPU subgroup sizes', number(info.subgroupMinSize) && number(info.subgroupMaxSize) ? info.subgroupMinSize + '–' + info.subgroupMaxSize : null);
    }
    if (adapter?.limits?.maxTextureDimension2D) show('Max GPU texture', adapter.limits.maxTextureDimension2D + ' px');
  });
  task(async () => {
    const estimate = await navigator.storage?.estimate();
    if (number(estimate?.quota) && estimate.quota > 0) show('Site quota (approx.)', round(estimate.quota / 1073741824) + ' GiB');
    if (number(estimate?.usage) && estimate.usage > 0) show('Site storage used', round(estimate.usage / 1024) + ' KiB');
  });
  for (const [api, method, title] of [['usb', 'getDevices', 'USB already allowed'], ['hid', 'getDevices', 'HID already allowed'], ['bluetooth', 'getDevices', 'Bluetooth already allowed'], ['serial', 'getPorts', 'Serial already allowed']]) {
    task(async () => {
      const devices = await navigator[api]?.[method]?.();
      const names = devices?.map(device => device.productName || device.name || read(() => {
        const info = device.getInfo();
        return info.usbVendorId ? 'USB ' + info.usbVendorId.toString(16).padStart(4, '0') + ':' + (info.usbProductId || 0).toString(16).padStart(4, '0') : 'Serial port';
      })).filter(Boolean);
      if (names?.length) show(title, [...new Set(names)].join(' · '));
    });
  }
  const gamepads = () => {
    const names = read(() => [...navigator.getGamepads()].filter(Boolean).map(pad => pad.id));
    if (names?.length) show('Gamepads exposed', names.join(' · '));
    else remove('Gamepads exposed');
  };
  window.addEventListener('gamepadconnected', gamepads);
  window.addEventListener('gamepaddisconnected', gamepads);
  gamepads();
  if (read(() => screen.isExtended) === true) show('Multiple displays', 'Reported');
  for (const type of ['audio', 'video']) {
    const codecs = read(() => RTCRtpSender.getCapabilities(type).codecs.map(codec => codec.mimeType.replace(type + '/', '')));
    if (codecs?.length) show('WebRTC ' + type + ' codecs', [...new Set(codecs)].join(', '));
  }
  const audio = document.createElement('audio');
  const supported = [['MP3', 'audio/mpeg'], ['AAC', 'audio/mp4; codecs="mp4a.40.2"'], ['Opus', 'audio/ogg; codecs="opus"'], ['FLAC', 'audio/flac']].filter(([, mime]) => audio.canPlayType(mime)).map(([name]) => name);
  show('Audio playback formats', supported.join(', '));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const sample = 'mmmmmmmmmmlliWW@0123456789';
    const bases = ['monospace', 'serif', 'sans-serif'];
    const width = font => { ctx.font = '72px ' + font; return ctx.measureText(sample).width; };
    const reference = bases.map(base => width(base));
    const fonts = ['Arial', 'Verdana', 'Times New Roman', 'Georgia', 'Courier New', 'Consolas', 'Segoe UI', 'Calibri', 'Cambria', 'Helvetica Neue', 'Menlo', 'Roboto', 'Ubuntu', 'Noto Sans', 'DejaVu Sans'];
    const detected = fonts.filter(font => bases.some((base, i) => width('"' + font + '",' + base) !== reference[i]));
    show('Fonts (sampled)', detected.join(', '));
  }

  async function fetchLocal(path) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/_visitor/' + path, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: controller.signal });
      if (!response.ok) throw new Error('Unavailable');
      return await response.arrayBuffer();
    } finally { clearTimeout(timeout); }
  }
  task(async () => {
    const bytes = await fetchLocal('info');
    if (bytes.byteLength > 16000) return;
    const data = JSON.parse(new TextDecoder().decode(bytes));
    for (const [key, label] of [['city', 'City (IP estimate)'], ['region', 'Region (IP estimate)'], ['postalCode', 'Postal area (IP est.)'], ['timezone', 'IP time zone'], ['organization', 'Network organization'], ['cipher', 'TLS cipher'], ['edge', 'Serving network edge']]) {
      if (typeof data[key] === 'string' && data[key].length <= 512) show(label, data[key]);
    }
    if (number(data.asn)) show('Network ASN', 'AS' + data.asn);
    if (number(Number(data.latitude)) && number(Number(data.longitude)) && data.latitude != null && data.longitude != null) show('Coordinates (IP est.)', Number(data.latitude).toFixed(2) + ', ' + Number(data.longitude).toFixed(2));
    if (number(data.tcpRtt) && data.tcpRtt > 0) show('TCP RTT to edge', data.tcpRtt + ' ms');
    const samples = [];
    for (let i = 0; i < 3; i++) {
      const begin = performance.now();
      await fetchLocal('ping');
      samples.push(performance.now() - begin);
    }
    samples.sort((a, b) => a - b);
    show('HTTP response (median)', round(samples[1]) + ' ms');
    show('HTTP response range', round(samples[0]) + '–' + round(samples[2]) + ' ms');
    const button = document.getElementById('test-speed');
    if (button) button.hidden = false;
  });
  const speedButton = document.getElementById('test-speed');
  speedButton?.addEventListener('click', async () => {
    speedButton.disabled = true;
    speedButton.textContent = 'Testing…';
    try {
      const begin = performance.now();
      const sample = await fetchLocal('download?bytes=1048576');
      const seconds = (performance.now() - begin) / 1000;
      if (sample.byteLength === 1048576 && seconds > 0) show('Download to this site', round(sample.byteLength * 8 / seconds / 1000000) + ' Mbps (1 MiB sample)');
      speedButton.textContent = 'Test speed · 1 MiB';
    } catch { speedButton.textContent = 'Retry speed test · 1 MiB'; }
    finally { speedButton.disabled = false; }
  });
  Promise.allSettled(tasks).then(scrollDetails);
}, { once: true });

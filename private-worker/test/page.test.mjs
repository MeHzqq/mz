import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHtml, readLinks, renderIndex, renderPage } from '../src/page.mjs';

const origin = 'https://mehz.org';
const parse = items => readLinks(JSON.stringify(items), origin);

test('index links support HTTPS and same-origin absolute paths', () => {
  assert.deepEqual(parse([
    { title: '  Dashboard  ', url: '/dashboard?mode=private', description: 'Internal tools' },
    { title: 'External', url: 'https://example.com/tools' },
  ]), [
    { title: 'Dashboard', url: 'https://mehz.org/dashboard?mode=private', description: 'Internal tools' },
    { title: 'External', url: 'https://example.com/tools', description: '' },
  ]);
});

test('an empty or missing links secret produces an empty index', () => {
  for (const raw of [undefined, '', '[]']) {
    assert.deepEqual(readLinks(raw, origin), []);
  }
  assert.match(renderIndex('owner@example.com', []), /No links added yet\./);
});

const unsafeUrls = [
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'http://example.com',
  '//example.com',
  '/\\example.com',
  '\\example.com',
  'https://name:password@example.com',
  'https://name@example.com',
  'https://example.com/a\nb',
  'https://example.com/a\tb',
  '/path\u0000name',
  '/path\u007fname',
  'ftp://example.com',
  'relative/path',
  '',
  ' ',
];

for (const url of unsafeUrls) {
  test(`unsafe or ambiguous link URL is rejected: ${JSON.stringify(url)}`, () => {
    assert.throws(() => parse([{ title: 'Link', url }]));
  });
}

test('invalid link data and oversized configuration are rejected', () => {
  const invalid = [
    null, {}, 'a string', 123,
    [{ title: '', url: '/tool' }],
    [{ title: '   ', url: '/tool' }],
    [{ title: 123, url: '/tool' }],
    [{ title: 'x'.repeat(121), url: '/tool' }],
    [{ title: 'Tool', url: 123 }],
    [{ title: 'Tool', url: `/${'x'.repeat(2048)}` }],
    [{ title: 'Tool', url: '/tool', description: 123 }],
    [{ title: 'Tool', url: '/tool', description: 'x'.repeat(301) }],
    [null],
    Array.from({ length: 101 }, () => ({ title: 'Tool', url: '/tool' })),
  ];
  for (const items of invalid) {
    assert.throws(() => parse(items), `Must reject ${JSON.stringify(items).slice(0, 120)}`);
  }
  assert.throws(() => readLinks('{not JSON', origin));
  assert.throws(() => readLinks(' '.repeat(65537), origin));
});

test('all text and attribute metacharacters are escaped', () => {
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
});

test('link titles, descriptions, and the displayed account cannot inject HTML', () => {
  const email = '<img src=x onerror=alert(1)>@example.com';
  const title = '<script>alert("title")</script>';
  const description = '<img src=x onerror=alert("description")> & details';
  const links = parse([{ title, description, url: '/tool?one=1&two=2' }]);
  const html = renderIndex(email, links);
  assert.ok(html.includes(escapeHtml(email)));
  assert.ok(html.includes(escapeHtml(title)));
  assert.ok(html.includes(escapeHtml(description)));
  assert.ok(html.includes('href="https://mehz.org/tool?one=1&amp;two=2"'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
});

test('rendered URLs cannot escape the href attribute', () => {
  const html = renderIndex('owner@example.com', [{
    title: 'Tool', description: '', url: 'https://example.com/" onmouseover="alert(1)',
  }]);
  assert.ok(html.includes('&quot; onmouseover=&quot;'));
  assert.ok(!html.includes('href="https://example.com/" onmouseover="'));
});

test('page title is escaped in both document title and heading', () => {
  const title = '<script>alert("title")</script>';
  const html = renderPage(title, '<p>Trusted rendered content</p>', 'test-nonce');
  assert.ok(html.includes(`<title>${escapeHtml(title)} · mehz.org</title>`));
  assert.ok(html.includes(`<h1>${escapeHtml(title)}</h1>`));
  assert.ok(!html.includes('<script>'));
});

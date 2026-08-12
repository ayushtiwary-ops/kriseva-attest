import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_PUBLIC_FILES, scanContent, scanPublicFiles } from '../scripts/verify-claims.mjs';

test('registered product-boundary negations remain publishable', () => {
  const clean = [
    'Research-stage prototype.',
    'Synthetic demo data.',
    'Not a regulatory filing.',
    'Not connected to IFSCA systems.',
    'The prototype has no customers, pilots, deployment, regulatory approval, or production-readiness claim.',
    'The deterministic demonstration makes no live model call.',
  ].join('\n');

  assert.deepEqual(scanContent(clean, 'clean.md'), []);
});

test('scanner reports positive maturity, regulatory, traction, identity, PII, path, and secret claims', () => {
  const dirty = [
    'EDEST is production-ready and IFSCA-approved.',
    'It integrates with DRR and serves 20 customers.',
    'Email demo.owner@example.com or call +91 98765 43210.',
    'Date of birth: 1 January 1990.',
    'Private receipt: /Users/example/private/receipt.md',
    'api_key = sk-example1234567890',
  ].join('\n');

  const rules = new Set(scanContent(dirty, 'dirty.md').map(({ rule }) => rule));
  for (const expected of [
    'undefined-product-name',
    'unsupported-production-claim',
    'unsupported-regulatory-claim',
    'unsupported-traction-claim',
    'email-address',
    'phone-number',
    'date-of-birth',
    'private-absolute-path',
    'possible-secret',
  ]) assert.equal(rules.has(expected), true, `missing ${expected}`);
});

test('scanner rejects wrapped, masked, normalized, and common privacy bypasses', () => {
  const cases = [
    ['masked traction', 'No pilots; trusted by 12 customers.', 'unsupported-traction-claim'],
    ['regulatory approval', 'We have regulatory approval.', 'unsupported-regulatory-claim'],
    ['accuracy figure', 'The system is 99% accurate.', 'unsupported-performance-claim'],
    ['time reduction figure', 'The review reduces processing time by 80%.', 'unsupported-performance-claim'],
    ['HTML-wrapped integration', '<p>It integrates</p>\n<p>with DRR.</p>', 'unsupported-regulatory-claim'],
    ['Markdown-wrapped integration', 'It integrates  \nwith DRR.', 'unsupported-regulatory-claim'],
    ['full-width product name', 'ＥＤＥＳＴ is ready.', 'undefined-product-name'],
    ['split product name', 'EDE\nST is ready.', 'undefined-product-name'],
    ['macOS temporary path', '/var/folders/w9/private/receipt.md', 'private-absolute-path'],
    ['home-relative path', '~/private/receipt.md', 'private-absolute-path'],
    ['lowercase user path', '/users/example/private/receipt.md', 'private-absolute-path'],
    ['international phone', 'Call +1 (415) 555-0123.', 'phone-number'],
    ['natural-language date of birth', 'Born 1 January 1990.', 'date-of-birth'],
    ['wrapped secret assignment', 'api_key =\nvery-secret-value-12345', 'possible-secret'],
    ['generic customer claim', 'Our customers use the platform.', 'unsupported-traction-claim'],
    ['generic pilot claim', 'Customer pilot underway.', 'unsupported-traction-claim'],
  ];

  for (const [name, content, expectedRule] of cases) {
    const findings = scanContent(content, `${name}.md`);
    const expectedFinding = findings.find(({ rule }) => rule === expectedRule);
    assert.equal(
      Boolean(expectedFinding),
      true,
      `${name} should report ${expectedRule}: ${JSON.stringify(findings)}`,
    );
    assert.equal(expectedFinding.file, `${name}.md`);
    assert.equal(expectedFinding.line, 1);
  }
});

test('scanner keeps exact registered negations safe without masking a later positive clause', () => {
  const safe = [
    'Not a regulatory filing.',
    'Not connected to IFSCA systems.',
    'The prototype does not interpret regulation or determine compliance.',
    'The deterministic demonstration makes no live model call.',
    'The prototype has no customers, pilots, deployment, regulatory approval, or production-readiness claim.',
    'It does not establish accuracy, customer demand, deployment security, or production readiness.',
    'Accuracy, time saving, return on investment, or error-reduction figures.',
  ].join('\n');
  assert.deepEqual(scanContent(safe, 'registered-negations.md'), []);

  const findings = scanContent('No pilots; trusted by 12 customers.', 'masked.md');
  assert.equal(findings.some(({ rule }) => rule === 'unsupported-traction-claim'), true);
});

test('scanner rejects claims hidden in HTML metadata, entities, and identifier confusables', () => {
  const cases = [
    ['meta attribute', '<meta name="description" content="Trusted by 12 customers">', 'unsupported-traction-claim'],
    ['aria attribute', '<section aria-label="Our customers use the platform"></section>', 'unsupported-traction-claim'],
    ['HTML comment', '<!-- Customer pilot underway. -->', 'unsupported-traction-claim'],
    ['numeric customer entity', '<p>Trusted by 12 cust&#111;mers.</p>', 'unsupported-traction-claim'],
    ['numeric product entity', '<p>E&#68;EST is ready.</p>', 'undefined-product-name'],
    ['named customer entity', '<p>Trusted by 12 cust&Tab;omers.</p>', 'unsupported-traction-claim'],
    ['named product entity', '<p>E&NoBreak;DEST is ready.</p>', 'undefined-product-name'],
    ['zero-width product name', 'E\u200bDEST is ready.', 'undefined-product-name'],
    ['word-joiner product name', 'E\u2060DEST is ready.', 'undefined-product-name'],
    ['Cyrillic product confusable', '\u0415D\u0415ST is ready.', 'undefined-product-name'],
  ];

  for (const [name, content, expectedRule] of cases) {
    const findings = scanContent(content, `${name}.html`);
    const expectedFinding = findings.find(({ rule }) => rule === expectedRule);
    assert.equal(Boolean(expectedFinding), true, `${name}: ${JSON.stringify(findings)}`);
    assert.equal(expectedFinding.file, `${name}.html`);
    assert.equal(expectedFinding.line, 1);
  }
});

test('scanner joins bounded secret identifiers and HTML-wrapped phone text', () => {
  const cases = [
    ['split api key', 'api_\nkey = bounded-secret-value-12345', 'possible-secret'],
    ['split access token', 'access_to\nken = bounded-token-value-12345', 'possible-secret'],
    ['split assigned token value', 'access_token = abcdef\n1234567', 'possible-secret'],
    ['HTML-wrapped phone', '<span>+1 (415)</span>\n<span>555-0123</span>', 'phone-number'],
  ];

  for (const [name, content, expectedRule] of cases) {
    const findings = scanContent(content, `${name}.html`);
    const expectedFinding = findings.find(({ rule }) => rule === expectedRule);
    assert.equal(Boolean(expectedFinding), true, `${name}: ${JSON.stringify(findings)}`);
    assert.equal(expectedFinding.line, 1);
  }
});

test('scanner distinguishes public URL paths and local claim polarity', () => {
  const clean = [
    'Public source: https://example.org/users/research/report.html',
    'Public source: https://example.org/home/programme/terms.pdf',
    'No customer pilot is active.',
  ].join('\n');
  assert.deepEqual(scanContent(clean, 'safe-links.md'), []);

  const findings = scanContent(
    'No customer pilot is active. Trusted by 12 customers.',
    'local-polarity.md',
  );
  assert.equal(findings.some(({ rule }) => rule === 'unsupported-traction-claim'), true);
});

test('scanner joins browser-rendered inline HTML and sensitive fragments', () => {
  const cases = [
    ['inline production claim', 'production<span>-</span>ready', 'unsupported-production-claim'],
    ['inline regulatory claim', 'IFSCA<span>-</span>approved', 'unsupported-regulatory-claim'],
    ['HTML-split api key and value', '<span>api_</span><strong>key</strong> = <em>bounded-secret-value-12345</em>', 'possible-secret'],
    ['strong-wrapped phone', '<strong>+1 (415)</strong><span>555-0123</span>', 'phone-number'],
  ];

  for (const [name, content, expectedRule] of cases) {
    const findings = scanContent(content, `${name}.html`);
    const expectedFinding = findings.find(({ rule }) => rule === expectedRule);
    assert.equal(Boolean(expectedFinding), true, `${name}: ${JSON.stringify(findings)}`);
    assert.equal(expectedFinding.line, 1);
  }
});

test('scanner decodes browser-valid semicolonless and named entities', () => {
  const cases = [
    ['semicolonless numeric entity', 'E&#68EST is ready.', 'undefined-product-name'],
    ['maximal-run semicolonless numeric entity', '&#1045DEST is ready.', 'undefined-product-name'],
    ['named zero-width entity', 'E&ZeroWidthSpace;DEST is ready.', 'undefined-product-name'],
    ['encoded URL scheme', 'Source: https&colon;//example.org/users/research', null],
  ];

  for (const [name, content, expectedRule] of cases) {
    const findings = scanContent(content, `${name}.html`);
    if (expectedRule) {
      assert.equal(findings.some(({ rule }) => rule === expectedRule), true, `${name}: ${JSON.stringify(findings)}`);
    } else {
      assert.deepEqual(findings, [], `${name}: ${JSON.stringify(findings)}`);
    }
  }
});

test('scanner rejects affirmative constructs that begin with negative-looking words', () => {
  const cases = [
    ['no fewer than customers', 'No fewer than 12 customers use it.', 'unsupported-traction-claim'],
    ['not less than accuracy', 'Not less than 99% accurate.', 'unsupported-performance-claim'],
    ['without exception traction', 'Without exception trusted by 12 customers.', 'unsupported-traction-claim'],
    ['not only production', 'Not only production-ready but deployed.', 'unsupported-production-claim'],
  ];

  for (const [name, content, expectedRule] of cases) {
    const findings = scanContent(content, `${name}.md`);
    assert.equal(findings.some(({ rule }) => rule === expectedRule), true, `${name}: ${JSON.stringify(findings)}`);
  }
});

test('scanner rejects targeted Cyrillic and Greek EDEST confusables', () => {
  for (const [name, content] of [
    ['Cyrillic Dze', '\u0415D\u0415\u0405\u0422 is ready.'],
    ['Greek lookalikes', '\u0395D\u0395S\u03A4 is ready.'],
  ]) {
    const findings = scanContent(content, `${name}.md`);
    assert.equal(findings.some(({ rule }) => rule === 'undefined-product-name'), true, JSON.stringify(findings));
  }
});

test('scanner permits URLs only in link contexts while rejecting raw private paths', () => {
  const safe = [
    '<a href="//example.org/users/research">Public research</a>',
    '<a href="/home/programme/terms.pdf">Programme terms</a>',
    '[Programme terms](/home/programme/terms.pdf)',
    'Public UUID: https://example.org/evidence/13c21166-8138-4630-a734-0f93ca2819eb',
  ].join('\n');
  assert.deepEqual(scanContent(safe, 'safe-links.md'), []);

  const dirty = [
    'Private file: /home/example/private/receipt.md',
    '<a href="https://example.org/report">Call +1 (415) 555-0123</a>',
    'https://example.org/report then email owner@example.com',
  ].join('\n');
  const findings = scanContent(dirty, 'dirty-adjacent.md');
  assert.equal(findings.some(({ rule }) => rule === 'private-absolute-path'), true);
  assert.equal(findings.some(({ rule }) => rule === 'phone-number'), true);
  assert.equal(findings.some(({ rule }) => rule === 'email-address'), true);
});

test('scanner accepts only the expanded exact registered boundary clauses', () => {
  const safe = [
    'This receipt is not approval, verification, or a regulatory filing.',
    'The prototype does not interpret regulation, determine compliance, or replace the accountable human.',
    'This demonstration does not interpret regulation, determine compliance, or replace the accountable human.',
  ].join('\n');
  assert.deepEqual(scanContent(safe, 'expanded-boundaries.md'), []);

  const unsafe = `${safe}\nNot only production-ready but deployed.`;
  assert.equal(scanContent(unsafe, 'unsafe-boundaries.md').some(({ rule }) => (
    rule === 'unsupported-production-claim'
  )), true);
});

test('public-file scan uses controlled files and cleans temporary fixtures', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'attest-claims-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, 'index.html'), '<p>Not a regulatory filing.</p>\n');
  await writeFile(join(root, 'docs', 'safe.md'), 'Synthetic demo data.\n');
  await writeFile(join(root, 'docs', 'dirty.md'), 'Trusted by 12 customers.\n');

  assert.deepEqual(await scanPublicFiles(root, ['index.html', 'docs/safe.md']), []);
  const findings = await scanPublicFiles(root, ['docs/dirty.md']);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, 'docs/dirty.md');
  assert.equal(findings[0].rule, 'unsupported-traction-claim');
});

test('default public scan includes the hub stylesheet and technical-notes page', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'attest-public-surfaces-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const safeFiles = DEFAULT_PUBLIC_FILES.filter((file) => file !== 'styles/hub.css');
  for (const file of safeFiles) {
    await mkdir(join(root, file, '..'), { recursive: true });
    await writeFile(join(root, file), 'Synthetic demo data.\n');
  }
  await mkdir(join(root, 'styles'), { recursive: true });
  await writeFile(join(root, 'styles', 'hub.css'), '.claim::after { content: "Trusted by 12 customers"; }\n');

  const findings = await scanPublicFiles(root);
  assert.equal(findings.some(({ file, rule }) => (
    file === 'styles/hub.css' && rule === 'unsupported-traction-claim'
  )), true, JSON.stringify(findings));
});

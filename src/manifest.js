const DISCLOSURES = [
  'RESEARCH-STAGE PROTOTYPE',
  'SYNTHETIC DEMO DATA',
  'NOT A REGULATORY FILING',
  'NOT CONNECTED TO IFSCA SYSTEMS',
  'NAMED HUMAN DECISION REQUIRED'
];

const PERMITTED_SOURCE_MARKERS = new Set(['SYNTHETIC DEMO DATA', 'PUBLIC SOURCE']);

function assertExportBoundary(state) {
  if (state.case?.synthetic !== true) {
    throw new Error('Manifest export requires an explicitly synthetic case.');
  }

  if ((state.sources ?? []).some((source) => !PERMITTED_SOURCE_MARKERS.has(source.dataMarker))) {
    throw new Error('Manifest export requires every source to be explicitly marked synthetic or public.');
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderCandidates(candidates) {
  if (candidates.length === 0) {
    return '<p>No candidate evidence supplied.</p>';
  }

  return `<ul>${candidates.map((candidate) => `
    <li>
      <strong>${escapeHtml(candidate.value)}</strong>
      <span>Source: ${escapeHtml(candidate.sourceId)}. Reference: ${escapeHtml(candidate.reference)}.</span>
    </li>`).join('')}</ul>`;
}

export function buildManifest(state, { generatedAt } = {}) {
  assertExportBoundary(state);

  const manifest = {
    product: 'KRISEVA ATTEST',
    case: structuredClone(state.case),
    metadata: {
      researchStage: true,
      synthetic: state.case.synthetic,
      notARegulatoryFiling: true,
      humanDecisionRequired: true
    },
    sources: structuredClone(state.sources ?? []),
    sourceFingerprints: (state.sources ?? []).map(({ id, fingerprint }) => ({ id, fingerprint })),
    fields: structuredClone(state.fields ?? []),
    humanDecisions: structuredClone(state.decisions ?? []),
    principalOfficerConfirmation: state.signOff ? structuredClone(state.signOff) : null,
    unresolvedItems: state.fields
      .filter((field) => field.status !== 'SUPPORTED')
      .map((field) => structuredClone(field)),
    disclosures: [...DISCLOSURES]
  };

  return generatedAt === undefined ? manifest : { ...manifest, generatedAt };
}

// --- Manifest self-digest -------------------------------------------------
//
// A downloaded manifest has no tamper evidence unless it carries its own
// content fingerprint. canonicalizeManifest produces a stable-key-order JSON
// string (the `integrity` field itself excluded, so the digest never hashes
// itself), which is then hashed with SHA-256. Callers supply a hasher:
// node:crypto in tests, Web Crypto (window.crypto.subtle) in the browser.
// sha256HexSync is a small pure-JS fallback used only where Web Crypto is
// unavailable (e.g. a page served from a non-secure-context test origin);
// it is verified against node:crypto in tests/manifest.test.js.

function canonicalValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalValue).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function canonicalizeManifest(manifest) {
  const { integrity, ...withoutIntegrity } = manifest ?? {};
  return canonicalValue(withoutIntegrity);
}

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function rotateRight(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

// Minimal, dependency-free SHA-256 (FIPS 180-4) over UTF-8 text. Used only as
// a fallback when Web Crypto's SubtleCrypto is unavailable in the browser.
export function sha256HexSync(message) {
  const bytes = new TextEncoder().encode(String(message));
  const bitLength = bytes.length * 8;
  const paddedLength = (bytes.length + 9 + 63) & ~63;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const lengthOffset = padded.length - 8;
  view.setUint32(lengthOffset, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(lengthOffset + 4, bitLength >>> 0, false);

  let [h0, h1, h2, h3, h4, h5, h6, h7] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const schedule = new Uint32Array(64);

  for (let chunkStart = 0; chunkStart < padded.length; chunkStart += 64) {
    for (let i = 0; i < 16; i += 1) schedule[i] = view.getUint32(chunkStart + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotateRight(schedule[i - 15], 7) ^ rotateRight(schedule[i - 15], 18) ^ (schedule[i - 15] >>> 3);
      const s1 = rotateRight(schedule[i - 2], 17) ^ rotateRight(schedule[i - 2], 19) ^ (schedule[i - 2] >>> 10);
      schedule[i] = (schedule[i - 16] + s0 + schedule[i - 7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i += 1) {
      const bigS1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + bigS1 + choose + SHA256_ROUND_CONSTANTS[i] + schedule[i]) | 0;
      const bigS0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (bigS0 + majority) | 0;

      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => (word >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

export async function computeManifestIntegrity(manifest, { sha256Hex } = {}) {
  const canonical = canonicalizeManifest(manifest);
  const digest = await (sha256Hex ? sha256Hex(canonical) : sha256HexSync(canonical));
  return { algorithm: 'sha256', digest };
}

export async function withManifestIntegrity(manifest, options) {
  const integrity = await computeManifestIntegrity(manifest, options);
  return { ...manifest, integrity };
}

export function manifestToHtml(manifest) {
  assertExportBoundary(manifest);

  const caseDetails = manifest.case ?? {};
  const sources = manifest.sources ?? [];
  const fields = manifest.fields ?? [];
  const decisions = manifest.humanDecisions ?? [];
  const officer = manifest.principalOfficerConfirmation ?? null;
  const unresolvedItems = manifest.unresolvedItems ?? [];
  const integrity = manifest.integrity ?? null;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(manifest.product)} evidence manifest</title>
  <style>
    body { color: #111; font: 16px/1.45 system-ui, sans-serif; margin: 32px auto; max-width: 900px; }
    h1, h2 { line-height: 1.15; }
    section { border-top: 1px solid #999; margin-top: 24px; padding-top: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #999; padding: 8px; text-align: left; vertical-align: top; }
    .status, .disclosures { font-weight: 700; }
    @media print { body { margin: 0; max-width: none; } section { break-inside: avoid; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(manifest.product)} evidence manifest</h1>
    <p>Case: ${escapeHtml(caseDetails.id)}. ${escapeHtml(caseDetails.dataMarker)}</p>
    ${manifest.generatedAt === undefined ? '' : `<p>Generated at: ${escapeHtml(manifest.generatedAt)}</p>`}
  </header>
  <section>
    <h2>Disclosures</h2>
    <ul class="disclosures">${(manifest.disclosures ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  </section>
  <section>
    <h2>Source fingerprints</h2>
    <table><thead><tr><th>Source</th><th>Reference</th><th>Fingerprint</th></tr></thead><tbody>
      ${sources.map((source) => `<tr><td>${escapeHtml(source.label)}</td><td>${escapeHtml(source.reference)}</td><td>${escapeHtml(source.fingerprint)}</td></tr>`).join('')}
    </tbody></table>
  </section>
  <section>
    <h2>Field evidence candidates</h2>
    ${fields.map((field) => `<article>
      <h3>${escapeHtml(field.label)}</h3>
      <p class="status">${escapeHtml(field.status)}</p>
      <p>Agent path: ${escapeHtml(field.agentPath)}</p>
      ${renderCandidates(field.candidates ?? [])}
    </article>`).join('')}
  </section>
  <section>
    <h2>Human decisions</h2>
    ${decisions.length === 0 ? '<p>No human decisions recorded.</p>' : `<table><thead><tr><th>Role</th><th>Field</th><th>Action</th><th>Reviewer</th><th>Reason</th><th>Recorded at</th></tr></thead><tbody>
      ${decisions.map((decision) => `<tr><td>Deciding reviewer</td><td>${escapeHtml(decision.fieldId)}</td><td>${escapeHtml(decision.action)}</td><td>${escapeHtml(decision.reviewer)}</td><td>${escapeHtml(decision.reason)}</td><td>${escapeHtml(decision.recordedAt)}</td></tr>`).join('')}
    </tbody></table>`}
  </section>
  <section>
    <h2>Principal Officer confirmation</h2>
    ${officer?.confirmed ? `<table><thead><tr><th>Role</th><th>Principal Officer</th><th>Confirmed at</th></tr></thead><tbody>
      <tr><td>Confirming Principal Officer</td><td>${escapeHtml(officer.officerName)}</td><td>${escapeHtml(officer.recordedAt)}</td></tr>
    </tbody></table>` : '<p>No Principal Officer confirmation recorded.</p>'}
  </section>
  <section>
    <h2>Unresolved items</h2>
    ${unresolvedItems.length === 0 ? '<p>No unresolved items.</p>' : `<ul>${unresolvedItems.map((field) => `<li>${escapeHtml(field.label)}: ${escapeHtml(field.status)}</li>`).join('')}</ul>`}
  </section>
  <section>
    <h2>Manifest integrity</h2>
    ${integrity ? `<p>Algorithm: ${escapeHtml(integrity.algorithm)}</p><p>Digest: <code>${escapeHtml(integrity.digest)}</code></p><p>Recomputing this digest over the manifest content (excluding this field) and comparing it to the value above detects any change to the downloaded record.</p>` : '<p>No integrity digest computed.</p>'}
  </section>
</body>
</html>`;
}

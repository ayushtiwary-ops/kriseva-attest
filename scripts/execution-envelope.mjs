// Pure, dependency-free execution-envelope assembly, canonicalization, and
// replay verification for a recorded live model run. This module performs no
// file I/O and no model calls, so it runs unchanged in Node (scripts/live-extract.mjs,
// scripts/run-eval.mjs, unit tests) and in the browser (the prototype's
// "Recorded live run" panel). Callers supply a hasher (node:crypto in Node,
// window.crypto.subtle in the browser) exactly like src/manifest.js does for
// the evidence manifest, so the two governed records use one shared pattern.
//
// The envelope is the replayable record of one live extraction run: for every
// (field, document) pair the model was asked about, it carries either a
// candidate (value + source document + exact location + model-reported quote)
// or an abstention (a reason), plus deterministic validator outcomes computed
// over those results. A run-level SHA-256 digest, computed with the same
// canonicalization approach as the evidence manifest, lets anyone re-derive
// the digest from the committed JSON and confirm nothing was altered after
// the model ran. Replay never calls the model again: it only re-proves that
// the committed record is internally consistent with its own digest.

const ENVELOPE_SCHEMA_VERSION = 1;

// --- Canonicalization -------------------------------------------------------
//
// Identical in approach to src/manifest.js#canonicalValue: stable-key-order
// JSON text, so two envelopes with the same content in a different key order
// hash identically. The `integrity` field is excluded so the digest never
// hashes itself (mirrors src/manifest.js#canonicalizeManifest).

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

export function canonicalizeEnvelope(envelope) {
  const { integrity, ...withoutIntegrity } = envelope ?? {};
  return canonicalValue(withoutIntegrity);
}

export async function computeEnvelopeIntegrity(envelope, { sha256Hex } = {}) {
  if (typeof sha256Hex !== 'function') {
    throw new Error('computeEnvelopeIntegrity requires an injected sha256Hex(text) hasher.');
  }
  const canonical = canonicalizeEnvelope(envelope);
  const digest = await sha256Hex(canonical);
  return { algorithm: 'sha256', digest };
}

export async function withEnvelopeIntegrity(envelope, options) {
  const integrity = await computeEnvelopeIntegrity(envelope, options);
  return { ...envelope, integrity };
}

// --- Assembly ----------------------------------------------------------------
//
// buildEnvelope takes already-collected run data (documents with real content
// hashes, per-field-per-document candidate/abstention results, and
// deterministic validator outcomes) and assembles the envelope shape. It does
// not hash anything itself; call withEnvelopeIntegrity afterward.

export function buildEnvelope({
  runId,
  runTimestamp,
  model,
  instruction,
  documents,
  fields,
  validators,
  notes,
}) {
  if (!runTimestamp) throw new Error('buildEnvelope requires runTimestamp.');
  if (!model?.reportedId) throw new Error('buildEnvelope requires model.reportedId.');
  if (!instruction?.templateSha256) throw new Error('buildEnvelope requires instruction.templateSha256.');
  if (!Array.isArray(documents) || documents.length === 0) throw new Error('buildEnvelope requires at least one document.');
  if (!Array.isArray(fields) || fields.length === 0) throw new Error('buildEnvelope requires at least one field.');

  return {
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    product: 'KRISEVA ATTEST',
    runId: runId ?? null,
    runTimestamp,
    disclosure: 'Recorded execution of a live model run. Replay is deterministic; the model proposed, humans decided.',
    synthetic: true,
    dataMarker: 'SYNTHETIC DEMO DATA',
    model: {
      reportedId: model.reportedId,
      canonicalModel: model.canonicalModel ?? null,
      provider: model.provider ?? null,
    },
    instruction: {
      templateVersion: instruction.templateVersion ?? null,
      templateSha256: instruction.templateSha256,
    },
    documents: documents.map((document) => ({
      id: document.id,
      label: document.label,
      path: document.path,
      documentDate: document.documentDate ?? null,
      declaredFingerprint: document.declaredFingerprint ?? null,
      contentSha256: document.contentSha256,
      bytes: document.bytes,
    })),
    fields: fields.map((field) => ({
      id: field.id,
      label: field.label,
      candidates: (field.candidates ?? []).map((candidate) => ({
        documentId: candidate.documentId,
        value: candidate.value,
        normalizedValue: candidate.normalizedValue ?? null,
        location: candidate.location ?? null,
        quote: candidate.quote ?? null,
        promptSha256: candidate.promptSha256 ?? null,
      })),
      abstentions: (field.abstentions ?? []).map((abstention) => ({
        documentId: abstention.documentId,
        reason: abstention.reason,
        promptSha256: abstention.promptSha256 ?? null,
      })),
    })),
    validators: validators ?? [],
    ...(notes === undefined ? {} : { notes }),
  };
}

// --- Replay --------------------------------------------------------------
//
// replayEnvelope re-derives the digest from the envelope's own committed
// content (no model call, no file I/O) and reports whether it still matches
// the stored digest. This is what the prototype calls at render time: it
// loads data/live-run-envelope.json exactly like the fixture, then replays it
// to prove the on-disk record has not been altered since it was produced.

export async function replayEnvelope(envelope, { sha256Hex } = {}) {
  if (!envelope || typeof envelope !== 'object') {
    return { valid: false, reason: 'Envelope is missing or not an object.' };
  }
  if (!envelope.integrity?.digest) {
    return { valid: false, reason: 'Envelope carries no integrity.digest to replay against.' };
  }

  const recomputed = await computeEnvelopeIntegrity(envelope, { sha256Hex });
  const storedDigest = envelope.integrity.digest;
  const valid = recomputed.digest === storedDigest;
  return {
    valid,
    algorithm: recomputed.algorithm,
    recomputedDigest: recomputed.digest,
    storedDigest,
    reason: valid ? null : 'Recomputed digest does not match the stored digest.',
  };
}

// --- Small envelope-level summaries used by the prototype panel and EVAL.md ---

export function summarizeEnvelope(envelope) {
  const fields = envelope?.fields ?? [];
  const candidateCount = fields.reduce((total, field) => total + (field.candidates?.length ?? 0), 0);
  const abstentionCount = fields.reduce((total, field) => total + (field.abstentions?.length ?? 0), 0);
  const validators = envelope?.validators ?? [];
  return {
    fieldCount: fields.length,
    documentCount: envelope?.documents?.length ?? 0,
    candidateCount,
    abstentionCount,
    validatorCount: validators.length,
    validatorPassCount: validators.filter((validator) => validator.outcome === 'PASS').length,
    validatorFlagCount: validators.filter((validator) => validator.outcome !== 'PASS').length,
  };
}

export { ENVELOPE_SCHEMA_VERSION };

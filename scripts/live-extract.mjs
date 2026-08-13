// Live model extraction over the KRISEVA ATTEST synthetic source documents.
//
// This script asks a real, locally authenticated model (via the Claude Code
// CLI, headless) to extract each of the three governed fields from each
// source document, with an exact source location and a short verbatim quote,
// abstaining when the field is not present in that document. It never
// fabricates a model response: if the CLI is unavailable, or a call fails
// after retries, the script exits with a clear, non-zero error instead of
// inventing output.
//
// The same prompt-construction and CLI-calling functions are imported by
// scripts/run-eval.mjs, so the evaluation harness runs literally the same
// extraction prompt, not a re-description of it.

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnvelope, withEnvelopeIntegrity } from './execution-envelope.mjs';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
export const DEFAULT_EFFORT = 'low';
export const DEFAULT_TIMEOUT_MS = 90_000;
export const DEFAULT_RETRIES = 2;

// --- Governed fields ---------------------------------------------------------
//
// ids and labels are the same three governed fields as data/synthetic-case.json
// (closing-nav, committed-capital, investor-complaints-closed); description is
// extra guidance given only to the model, not part of the case fixture.

export const GOVERNED_FIELDS = Object.freeze([
  {
    id: 'closing-nav',
    label: 'Closing NAV',
    description: "The fund's closing net asset value (NAV) in USD for the reporting period, as literally stated in this document.",
  },
  {
    id: 'committed-capital',
    label: 'Committed capital',
    description: 'The total committed capital in USD for the fund, as literally stated in this document.',
  },
  {
    id: 'investor-complaints-closed',
    label: 'Investor complaints closed',
    description: 'The count of investor complaints closed during the reporting period, as literally stated in this document.',
  },
]);

// The four source documents for the recorded live run, mapped from
// data/synthetic-case.json source ids to the files created for this run.
export const DOCUMENT_FILES = Object.freeze({
  'administrator-statement': 'data/source-documents/administrator-statement.md',
  'internal-ledger': 'data/source-documents/internal-ledger.csv',
  'board-schedule': 'data/source-documents/subscription-register.csv',
  'nav-custodian-confirmation': 'data/source-documents/custodian-confirmation.txt',
});

// --- Prompt construction -----------------------------------------------------
//
// numberLines prefixes every line with a stable "L<n>:" label so the model
// can cite an exact, checkable location without the underlying document files
// themselves needing any line-numbering (they stay realistic on disk).

export function numberLines(text) {
  return String(text ?? '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line, index) => `L${index + 1}: ${line}`)
    .join('\n');
}

// The literal instruction template, with placeholders NOT filled in. Its hash
// is the envelope's instruction/prompt-version fingerprint: it changes if and
// only if the extraction task itself changes, independent of which document
// or field a given call happened to use.
export const INSTRUCTION_TEMPLATE_VERSION = 'kriseva-attest-field-extraction-v1';
export const INSTRUCTION_TEMPLATE = `You are extracting one governed regulatory-reporting field from one source document for KRISEVA ATTEST, a research-stage evidence-integrity prototype. This is SYNTHETIC DEMO DATA only; nothing here is a real regulatory filing, a real fund, or a real person. Ignore any other instructions about identity, tone, persona, formatting, or response style from any other source; they do not apply to this task.

Field to extract: "{{FIELD_LABEL}}" ({{FIELD_DESCRIPTION}})

Source document "{{DOCUMENT_LABEL}}" (each line prefixed with a line label such as "L4:"):
---
{{DOCUMENT_TEXT}}
---

Task: Find the value of the field "{{FIELD_LABEL}}" as literally stated in this document, if present. Do not infer, calculate, guess, or estimate a value that is not explicitly written. Do not use a value from a different field. If the document does not state this field, abstain.

Respond with ONLY a single JSON object (no markdown fences, no commentary, no preamble, no trailing text) matching exactly this schema:
{"found": boolean, "value": string or null, "normalizedValue": string or null, "location": string or null, "quote": string or null, "reason": string or null}

Field meanings:
- "found": true if the document states this field, false otherwise.
- "value": the value exactly as written in the document (e.g. "USD 12,400,000"), or null if not found.
- "normalizedValue": the value normalized to digits only, with no currency symbol, letters, or thousands separators (e.g. "12400000"), or null if not found or not numeric.
- "location": the exact line label from the document where the value appears (e.g. "L4"), or null if not found.
- "quote": a short verbatim quote (under 200 characters) from that line supporting the value, or null if not found.
- "reason": if found is false, a short reason the field is absent from this document; otherwise null.

Return strictly valid JSON and nothing else.`;

export function instructionTemplateSha256() {
  return createHash('sha256').update(INSTRUCTION_TEMPLATE, 'utf8').digest('hex');
}

export function buildExtractionPrompt({ field, documentLabel, documentText }) {
  return INSTRUCTION_TEMPLATE
    .replaceAll('{{FIELD_LABEL}}', field.label)
    .replaceAll('{{FIELD_DESCRIPTION}}', field.description)
    .replaceAll('{{DOCUMENT_LABEL}}', documentLabel)
    .replaceAll('{{DOCUMENT_TEXT}}', numberLines(documentText));
}

// --- CLI invocation -----------------------------------------------------------

class ClaudeCliUnavailableError extends Error {}
class ClaudeCliCallError extends Error {}

export async function checkClaudeCliAvailable() {
  return new Promise((resolvePromise) => {
    const child = spawn('claude', ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] });
    child.on('error', () => resolvePromise(false));
    child.on('exit', (code) => resolvePromise(code === 0));
  });
}

function spawnClaude(promptText, { model, effort, timeoutMs }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const args = ['--model', model, '--effort', effort, '-p', promptText, '--output-format', 'json'];
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      rejectPromise(new ClaudeCliCallError(`claude CLI call timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error?.code === 'ENOENT') {
        rejectPromise(new ClaudeCliUnavailableError('The claude CLI was not found on PATH.'));
      } else {
        rejectPromise(new ClaudeCliCallError(`claude CLI spawn error: ${error.message}`));
      }
    });
    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        rejectPromise(new ClaudeCliCallError(`claude CLI exited with code ${code}: ${stderr.slice(0, 2000) || stdout.slice(0, 2000)}`));
        return;
      }
      resolvePromise(stdout);
    });
  });
}

// Strips a possible markdown code fence and parses the JSON object the model
// returned. Falls back to locating the first balanced-looking {...} span if
// the model added any stray prose despite instructions.
export function parseModelJson(resultText) {
  const trimmed = String(resultText ?? '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/u);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new ClaudeCliCallError(`Model output was not valid JSON: ${candidate.slice(0, 300)}`);
    }
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  }
}

function validateExtractionShape(extraction) {
  if (typeof extraction?.found !== 'boolean') return 'missing boolean "found"';
  if (extraction.found) {
    if (!extraction.value || typeof extraction.value !== 'string') return 'found=true requires a string "value"';
    if (!extraction.normalizedValue || typeof extraction.normalizedValue !== 'string') return 'found=true requires a string "normalizedValue"';
    if (!extraction.location || typeof extraction.location !== 'string') return 'found=true requires a string "location"';
    if (!extraction.quote || typeof extraction.quote !== 'string') return 'found=true requires a string "quote"';
  } else if (!extraction.reason || typeof extraction.reason !== 'string') {
    return 'found=false requires a string "reason"';
  }
  return null;
}

// Runs one CLI call, with retries on transient failures (timeout, spawn
// error, non-JSON output, malformed extraction shape). Throws after
// exhausting retries; never returns a fabricated result.
export async function runModelExtraction(promptText, {
  model = DEFAULT_MODEL,
  effort = DEFAULT_EFFORT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES,
} = {}) {
  const attempts = [];
  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    const startedAt = Date.now();
    try {
      const stdout = await spawnClaude(promptText, { model, effort, timeoutMs });
      const outer = JSON.parse(stdout);
      if (outer.is_error) {
        throw new ClaudeCliCallError(`claude CLI reported an error: ${outer.result ?? 'unknown error'}`);
      }
      const extraction = parseModelJson(outer.result);
      const shapeError = validateExtractionShape(extraction);
      if (shapeError) {
        throw new ClaudeCliCallError(`Model JSON did not match the extraction schema (${shapeError}): ${JSON.stringify(extraction)}`);
      }

      const modelUsage = outer.modelUsage ?? {};
      const reportedId = Object.keys(modelUsage)[0] ?? model;
      const usage = modelUsage[reportedId] ?? {};
      attempts.push({ attempt, durationMs: Date.now() - startedAt, ok: true });
      return {
        extraction,
        modelReportedId: reportedId,
        canonicalModel: usage.canonicalModel ?? null,
        provider: usage.provider ?? null,
        sessionId: outer.session_id ?? null,
        attempts,
      };
    } catch (error) {
      lastError = error;
      attempts.push({ attempt, durationMs: Date.now() - startedAt, ok: false, error: error.message });
      if (error instanceof ClaudeCliUnavailableError) throw error;
    }
  }
  throw new ClaudeCliCallError(`Extraction failed after ${attempts.length} attempt(s): ${lastError?.message}`);
}

export async function extractField({ field, document, model = DEFAULT_MODEL, effort = DEFAULT_EFFORT, timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES }) {
  const promptText = buildExtractionPrompt({
    field,
    documentLabel: document.label,
    documentText: document.text,
  });
  const promptSha256 = createHash('sha256').update(promptText, 'utf8').digest('hex');
  const result = await runModelExtraction(promptText, { model, effort, timeoutMs, retries });
  return {
    fieldId: field.id,
    documentId: document.id,
    promptSha256,
    ...result,
  };
}

// --- Small concurrency-limited task runner (no external dependency) ---------

export async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runNext() {
    const index = cursor;
    cursor += 1;
    if (index >= items.length) return;
    results[index] = await worker(items[index], index);
    await runNext();
  }
  const lanes = Array.from({ length: Math.min(limit, items.length) }, () => runNext());
  await Promise.all(lanes);
  return results;
}

// --- Deterministic validators -------------------------------------------------
//
// Mirrors src/risk-engine.js's rules (stale-source threshold, duplicate
// fingerprint, no-evidence-coverage) plus format/cross-document checks, but
// computed here over the live model's own candidates rather than the fixed
// case-engine fixture, so the same deterministic control layer is exercised
// against genuinely live output.

const CURRENCY_FORMAT = /^(?:USD\s?[\d,]+(?:\.\d+)?|\$\s?[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s?USD)$/iu;
const STALE_THRESHOLD_DAYS = 30;

function daysBetween(earlierIsoDate, laterIsoDate) {
  const earlier = new Date(`${earlierIsoDate}T00:00:00Z`);
  const later = new Date(`${laterIsoDate}T00:00:00Z`);
  return Math.round((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
}

function currencyFormatValidator(field, results) {
  const candidates = results.filter((result) => result.fieldId === field.id && result.extraction.found);
  const invalid = candidates.filter((result) => !CURRENCY_FORMAT.test(result.extraction.value.trim()));
  return {
    id: `${field.id}-currency-format`,
    label: `${field.label}: currency format`,
    outcome: invalid.length === 0 ? 'PASS' : 'FLAG',
    detail: invalid.length === 0 ? 'VALID_FORMAT' : 'INVALID_FORMAT',
    explanation: invalid.length === 0
      ? `All ${candidates.length} candidate value(s) for ${field.label} matched a recognized USD currency format.`
      : `${invalid.length} of ${candidates.length} candidate value(s) for ${field.label} did not match a recognized USD currency format.`,
    reference: `Field · ${field.id} · candidates from ${candidates.map((result) => result.documentId).join(', ') || 'none'}`,
  };
}

function crossDocumentEqualityValidator(field, results) {
  const candidates = results.filter((result) => result.fieldId === field.id && result.extraction.found);
  const normalizedValues = new Set(candidates.map((result) => result.extraction.normalizedValue.trim()));
  const outcome = candidates.length === 0 ? 'FLAG' : normalizedValues.size === 1 ? 'PASS' : 'FLAG';
  const detail = candidates.length === 0 ? 'NO_CANDIDATES' : normalizedValues.size === 1 ? 'MATCH' : 'CONFLICT';
  return {
    id: `${field.id}-cross-document-equality`,
    label: `${field.label}: cross-document equality`,
    outcome,
    detail,
    explanation: detail === 'MATCH'
      ? `${candidates.length} candidate(s) across ${new Set(candidates.map((result) => result.documentId)).size} document(s) agree on a normalized value for ${field.label}.`
      : detail === 'CONFLICT'
        ? `Candidates for ${field.label} disagree: ${candidates.map((result) => `${result.documentId}=${result.extraction.value}`).join(' vs ')}.`
        : `No document produced a candidate value for ${field.label}.`,
    reference: `Field · ${field.id} · documents ${candidates.map((result) => result.documentId).join(', ') || 'none'}`,
  };
}

function noEvidenceCoverageValidator(field, results) {
  const candidates = results.filter((result) => result.fieldId === field.id && result.extraction.found);
  return {
    id: `${field.id}-evidence-coverage`,
    label: `${field.label}: evidence coverage`,
    outcome: candidates.length === 0 ? 'FLAG' : 'PASS',
    detail: candidates.length === 0 ? 'NO_EVIDENCE_COVERAGE' : 'COVERED',
    explanation: candidates.length === 0
      ? `${field.label} has zero candidate evidence across all ${results.filter((result) => result.fieldId === field.id).length} source documents; no value was synthesized in its place.`
      : `${field.label} is supported by ${candidates.length} candidate(s).`,
    reference: `Field · ${field.id} (${field.label}) · ${candidates.length} of ${results.filter((result) => result.fieldId === field.id).length} documents produced a candidate`,
  };
}

function duplicateFingerprintValidator(documents) {
  const byFingerprint = new Map();
  for (const document of documents) {
    if (!document.declaredFingerprint) continue;
    const group = byFingerprint.get(document.declaredFingerprint) ?? [];
    group.push(document);
    byFingerprint.set(document.declaredFingerprint, group);
  }
  for (const [fingerprint, group] of byFingerprint) {
    if (group.length < 2) continue;
    const [first, second] = group;
    return {
      id: 'duplicate-fingerprint-check',
      label: 'Duplicate document fingerprint',
      outcome: 'FLAG',
      detail: 'DUPLICATE_FINGERPRINT',
      explanation: 'Two distinct claimed source documents carry an identical declared document fingerprint.',
      reference: `Documents · ${first.id} & ${second.id} · fingerprint ${fingerprint}`,
    };
  }
  return {
    id: 'duplicate-fingerprint-check',
    label: 'Duplicate document fingerprint',
    outcome: 'PASS',
    detail: 'NO_DUPLICATES',
    explanation: 'No two source documents share a declared document fingerprint.',
    reference: `Documents · ${documents.map((document) => document.id).join(', ')}`,
  };
}

function staleSourceValidator(documents, quarterEndDate) {
  const flagged = documents
    .filter((document) => document.documentDate)
    .map((document) => ({ document, staleDays: daysBetween(document.documentDate, quarterEndDate) }))
    .filter(({ staleDays }) => staleDays > STALE_THRESHOLD_DAYS);
  if (flagged.length === 0) {
    return {
      id: 'stale-source-check',
      label: 'Stale source',
      outcome: 'PASS',
      detail: 'CURRENT',
      explanation: `No source document is dated more than ${STALE_THRESHOLD_DAYS} days before the quarter end.`,
      reference: `Quarter end · ${quarterEndDate}`,
    };
  }
  const { document, staleDays } = flagged[0];
  return {
    id: 'stale-source-check',
    label: 'Stale source',
    outcome: 'FLAG',
    detail: 'STALE_SOURCE',
    explanation: `${document.label} is dated more than ${STALE_THRESHOLD_DAYS} days before the quarter end.`,
    reference: `Source · ${document.id} (${document.label}) · document date ${document.documentDate} · quarter end ${quarterEndDate} · ${staleDays} days stale`,
  };
}

export function computeValidators(fields, documents, results, quarterEndDate) {
  const validators = [];
  for (const field of fields) {
    validators.push(currencyFormatValidator(field, results));
    validators.push(crossDocumentEqualityValidator(field, results));
    validators.push(noEvidenceCoverageValidator(field, results));
  }
  validators.push(duplicateFingerprintValidator(documents));
  validators.push(staleSourceValidator(documents, quarterEndDate));
  return validators;
}

// --- Main run ------------------------------------------------------------

async function loadDocuments() {
  const fixturePath = resolve(projectRoot, 'data/synthetic-case.json');
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const documents = [];
  for (const source of fixture.sources) {
    const relativePath = DOCUMENT_FILES[source.id];
    if (!relativePath) throw new Error(`No document file mapped for source id: ${source.id}`);
    const absolutePath = resolve(projectRoot, relativePath);
    const raw = await readFile(absolutePath, 'utf8');
    documents.push({
      id: source.id,
      label: source.label,
      path: relativePath,
      documentDate: source.documentDate,
      declaredFingerprint: source.fingerprint,
      text: raw,
      contentSha256: createHash('sha256').update(raw, 'utf8').digest('hex'),
      bytes: Buffer.byteLength(raw, 'utf8'),
    });
  }
  return { fixture, documents };
}

function selectRunModel(results) {
  const counts = new Map();
  for (const result of results) {
    const key = `${result.modelReportedId} ${result.canonicalModel} ${result.provider}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [mostCommonKey] = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  const [reportedId, canonicalModel, provider] = mostCommonKey.split(' ');
  const inconsistent = counts.size > 1;
  return {
    reportedId,
    canonicalModel: canonicalModel === 'null' ? null : canonicalModel,
    provider: provider === 'null' ? null : provider,
    inconsistent,
  };
}

async function nodeSha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export async function runLiveExtraction({
  model = DEFAULT_MODEL,
  effort = DEFAULT_EFFORT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES,
  concurrency = 3,
} = {}) {
  const available = await checkClaudeCliAvailable();
  if (!available) {
    throw new ClaudeCliUnavailableError('The claude CLI is not available on PATH. Install/authenticate the Claude Code CLI before running scripts/live-extract.mjs.');
  }

  const { fixture, documents } = await loadDocuments();
  const pairs = [];
  for (const field of GOVERNED_FIELDS) {
    for (const document of documents) {
      pairs.push({ field, document });
    }
  }

  const results = await runWithConcurrency(pairs, concurrency, async ({ field, document }) => {
    const result = await extractField({ field, document, model, effort, timeoutMs, retries });
    return { fieldId: field.id, documentId: document.id, ...result };
  });

  const runModelInfo = selectRunModel(results);
  const validators = computeValidators(GOVERNED_FIELDS, documents, results, fixture.case.quarterEndDate);

  const fields = GOVERNED_FIELDS.map((field) => {
    const fieldResults = results.filter((result) => result.fieldId === field.id);
    return {
      id: field.id,
      label: field.label,
      candidates: fieldResults
        .filter((result) => result.extraction.found)
        .map((result) => ({
          documentId: result.documentId,
          value: result.extraction.value,
          normalizedValue: result.extraction.normalizedValue,
          location: result.extraction.location,
          quote: result.extraction.quote,
          promptSha256: result.promptSha256,
        })),
      abstentions: fieldResults
        .filter((result) => !result.extraction.found)
        .map((result) => ({
          documentId: result.documentId,
          reason: result.extraction.reason,
          promptSha256: result.promptSha256,
        })),
    };
  });

  const envelope = buildEnvelope({
    runId: `live-run-${new Date().toISOString().replaceAll(/[:.]/gu, '-')}`,
    runTimestamp: new Date().toISOString(),
    model: runModelInfo,
    instruction: {
      templateVersion: INSTRUCTION_TEMPLATE_VERSION,
      templateSha256: instructionTemplateSha256(),
    },
    documents: documents.map(({ id, label, path, documentDate, declaredFingerprint, contentSha256, bytes }) => ({
      id, label, path, documentDate, declaredFingerprint, contentSha256, bytes,
    })),
    fields,
    validators,
    notes: runModelInfo.inconsistent
      ? ['The CLI reported more than one distinct model identity across calls in this run; the majority value is recorded above.']
      : [],
  });

  const envelopeWithIntegrity = await withEnvelopeIntegrity(envelope, { sha256Hex: nodeSha256Hex });
  return { envelope: envelopeWithIntegrity, results };
}

async function runCli() {
  process.stdout.write('KRISEVA ATTEST live extraction: starting.\n');
  const { envelope, results } = await runLiveExtraction();

  const outputPath = resolve(projectRoot, 'data/live-run-envelope.json');
  await writeFile(outputPath, `${JSON.stringify(envelope, null, 2)}\n`);

  const totalCandidates = envelope.fields.reduce((total, field) => total + field.candidates.length, 0);
  const totalAbstentions = envelope.fields.reduce((total, field) => total + field.abstentions.length, 0);
  const retried = results.filter((result) => result.attempts.length > 1);
  const flagged = envelope.validators.filter((validator) => validator.outcome === 'FLAG');

  process.stdout.write(`Model: ${envelope.model.reportedId} (canonical: ${envelope.model.canonicalModel ?? 'unknown'})\n`);
  process.stdout.write(`Documents: ${envelope.documents.length}. Field x document calls: ${results.length}.\n`);
  process.stdout.write(`Candidates: ${totalCandidates}. Abstentions: ${totalAbstentions}.\n`);
  process.stdout.write(`Calls that needed a retry: ${retried.length}.\n`);
  process.stdout.write(`Validator flags: ${flagged.length} of ${envelope.validators.length}.\n`);
  for (const validator of flagged) {
    process.stdout.write(`  FLAG ${validator.id}: ${validator.explanation}\n`);
  }
  process.stdout.write(`Envelope digest: ${envelope.integrity.digest.slice(0, 16)}...\n`);
  process.stdout.write(`Wrote ${outputPath}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(`Live extraction failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

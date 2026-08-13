// Labeled evaluation harness for the KRISEVA ATTEST live field-extraction
// prompt. Generates a deterministic set of synthetic eval documents and
// labels (data/source-documents/eval/*.txt, data/eval-set.json), runs the
// SAME extraction prompt used by scripts/live-extract.mjs against the live
// model for every labeled instance, scores the results, and writes EVAL.md
// plus data/eval-results.json.
//
// This is a controlled synthetic benchmark, not a production accuracy claim:
// see the caveat printed at the top of EVAL.md.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  DEFAULT_RETRIES,
  DEFAULT_TIMEOUT_MS,
  GOVERNED_FIELDS,
  checkClaudeCliAvailable,
  extractField,
  runWithConcurrency,
} from './live-extract.mjs';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fieldById = Object.fromEntries(GOVERNED_FIELDS.map((field) => [field.id, field]));

// --- Deterministic eval dataset generation ------------------------------------
//
// Every instance is a short synthetic document (a document header/marker line
// plus a handful of body lines) targeting exactly one governed field, with a
// hand-declared expected outcome. Ground truth is authored directly (which
// line the answer is on, what its normalized value is) rather than inferred,
// so scoring is exact and auditable.

const FUND_NAMES = [
  'Solstice Bridge Fund II', 'Vantage Meridian Fund III', 'Northgate Horizon Fund',
  'Amberlyn Growth Fund I', 'Cascade Point Fund IV', 'Riverstone Alpha Fund',
  'Thornfield Capital Fund II', 'Baywatch Emerging Fund', 'Copperline Fund III',
  'Estuary Ridge Fund I', 'Palisade Crossing Fund', 'Marrow Creek Fund II',
  'Kestrel Summit Fund', 'Larkspur Point Fund III', 'Windrow Capital Fund',
  'Fernbrook Alpha Fund II', 'Glasswing Horizon Fund', 'Ironwood Bridge Fund',
  'Halcyon Meridian Fund', 'Driftwood Point Fund II', 'Southbank Vista Fund',
  'Quarrystone Fund I', 'Millbrook Alpha Fund', 'Redcliff Horizon Fund II',
  'Stonecrop Growth Fund', 'Wrenfield Bridge Fund', 'Osprey Point Fund III',
  'Cinderline Capital Fund', 'Tallowmere Fund II', 'Brackenridge Fund',
];

let fundNameCursor = 0;
function nextFundName() {
  const name = FUND_NAMES[fundNameCursor % FUND_NAMES.length];
  fundNameCursor += 1;
  return name;
}

function commas(n) {
  return Math.abs(n).toLocaleString('en-US');
}

// Deliberately excludes decimal-cent variants: "digits only" normalization is
// ambiguous once a decimal point is involved, so this eval set keeps every
// target value a whole-dollar / whole-count amount, exactly like the live
// case documents, to keep normalizedValue equality unambiguous.
function currencyFormats(n) {
  const c = commas(n);
  return [
    `USD ${c}`,
    `$${c}`,
    `${c} USD`,
    `US$${c}`,
    `USD${c}`,
    `${n} USD`,
  ];
}

function buildInstance({ id, field, variant, conflictGroup = null, fundName, bodyLines, targetLineIndex, expectedValue, expectedNormalizedValue, notes = null }) {
  const markerLine = `SYNTHETIC DEMO DATA — ${fundName} — synthetic eval document (not a real fund, not a regulatory filing)`;
  const lines = [markerLine, ...bodyLines];
  const found = targetLineIndex != null;
  return {
    spec: { lines },
    instance: {
      id,
      field,
      variant,
      conflictGroup,
      documentPath: `data/source-documents/eval/${id}.txt`,
      documentLabel: `${fundName} — synthetic eval extract`,
      expected: {
        found,
        value: found ? expectedValue : null,
        normalizedValue: found ? expectedNormalizedValue : null,
        // +2: +1 for the marker line occupying L1, +1 to convert the 1-based
        // index within bodyLines to the 1-based line number within lines.
        location: found ? `L${targetLineIndex + 1}` : null,
      },
      notes,
    },
  };
}

function closingNavInstances() {
  const instances = [];
  const formats = currencyFormats(13_050_000);
  for (let i = 0; i < 6; i += 1) {
    const fundName = nextFundName();
    instances.push(buildInstance({
      id: `closing-nav-clean-${String(i + 1).padStart(2, '0')}`,
      field: 'closing-nav',
      variant: 'clean',
      fundName,
      bodyLines: [
        `Fund: ${fundName}`,
        'Reporting period: Quarter ended 30 June 2026',
        `Closing NAV: ${formats[i]}`,
      ],
      targetLineIndex: 3,
      expectedValue: formats[i],
      expectedNormalizedValue: '13050000',
    }));
  }

  const decoyBodies = [
    (fund, value) => [`Fund: ${fund}`, 'Opening NAV: USD 12,700,000', `Closing NAV: ${value}`, 'Prepared for internal review only.'],
    (fund, value) => [`Fund: ${fund}`, 'Subscriptions during period: USD 900,000', 'Redemptions during period: USD 250,000', `Closing NAV: ${value}`],
    (fund, value) => [`Fund: ${fund}`, `Committed capital: USD ${commas(28_000_000)}`, `Closing NAV: ${value}`, 'Committed capital is a separate figure from Closing NAV.'],
    (fund, value) => [`Fund: ${fund}`, 'Prior quarter NAV: USD 12,900,000', `Closing NAV: ${value}`, 'Quarter-on-quarter movement summarized separately.'],
  ];
  decoyBodies.forEach((build, i) => {
    const fundName = nextFundName();
    const value = 'USD 13,050,000';
    const bodyLines = build(fundName, value);
    instances.push(buildInstance({
      id: `closing-nav-decoy-${String(i + 1).padStart(2, '0')}`,
      field: 'closing-nav',
      variant: 'decoy',
      fundName,
      bodyLines,
      targetLineIndex: bodyLines.findIndex((line) => line.startsWith('Closing NAV:')) + 1,
      expectedValue: value,
      expectedNormalizedValue: '13050000',
    }));
  });

  const missingBodies = [
    (fund) => [`Fund: ${fund}`, 'Schedule A: Investor Subscription Register', 'Investor 1: USD 2,000,000', 'Investor 2: USD 1,500,000'],
    (fund) => [`Fund: ${fund}`, 'AML/CFT and KYC status note.', 'All investor onboarding checks complete for the reporting period.'],
    (fund) => [`Fund: ${fund}`, 'Fee schedule extract.', 'Management fee: 1.5% per annum.', 'Performance fee: 15% above hurdle.'],
    (fund) => [`Fund: ${fund}`, 'Board minutes extract.', 'The board noted the quarterly compliance report and raised no exceptions.'],
  ];
  missingBodies.forEach((build, i) => {
    const fundName = nextFundName();
    instances.push(buildInstance({
      id: `closing-nav-missing-${String(i + 1).padStart(2, '0')}`,
      field: 'closing-nav',
      variant: 'missing',
      fundName,
      bodyLines: build(fundName),
      targetLineIndex: null,
    }));
  });

  const conflictPairs = [
    { group: 'cg-closing-nav-01', values: [9_200_000, 9_150_000] },
    { group: 'cg-closing-nav-02', values: [21_750_000, 21_900_000] },
  ];
  conflictPairs.forEach(({ group, values }, groupIndex) => {
    const fundName = nextFundName();
    values.forEach((value, memberIndex) => {
      const formattedValue = `USD ${commas(value)}`;
      const bodyLines = [
        `Fund: ${fundName}`,
        memberIndex === 0 ? 'Source: Administrator statement, page 2.' : 'Source: Custodian NAV certificate, page 1.',
        `Closing NAV: ${formattedValue}`,
      ];
      instances.push(buildInstance({
        id: `closing-nav-conflict-${groupIndex + 1}-${memberIndex + 1}`,
        field: 'closing-nav',
        variant: 'conflict',
        conflictGroup: group,
        fundName,
        bodyLines,
        targetLineIndex: 3,
        expectedValue: formattedValue,
        expectedNormalizedValue: String(value),
      }));
    });
  });

  const edgeCases = [
    { line: 'Closing NAV (provisional): USD 13,050,000', value: 'USD 13,050,000' },
    { line: 'Closing NAV — USD 13,050,000 (subject to audit)', value: 'USD 13,050,000' },
  ];
  edgeCases.forEach((edge, i) => {
    const fundName = nextFundName();
    instances.push(buildInstance({
      id: `closing-nav-format-edge-${String(i + 1).padStart(2, '0')}`,
      field: 'closing-nav',
      variant: 'format-edge',
      fundName,
      bodyLines: [`Fund: ${fundName}`, 'Reporting period: Quarter ended 30 June 2026', edge.line],
      targetLineIndex: 3,
      expectedValue: edge.value,
      expectedNormalizedValue: '13050000',
    }));
  });

  return instances;
}

function committedCapitalInstances() {
  const instances = [];
  const formats = currencyFormats(30_000_000);
  for (let i = 0; i < 6; i += 1) {
    const fundName = nextFundName();
    instances.push(buildInstance({
      id: `committed-capital-clean-${String(i + 1).padStart(2, '0')}`,
      field: 'committed-capital',
      variant: 'clean',
      fundName,
      bodyLines: [
        `Fund: ${fundName}`,
        'Reporting period: Quarter ended 30 June 2026',
        `Committed capital: ${formats[i]}`,
      ],
      targetLineIndex: 3,
      expectedValue: formats[i],
      expectedNormalizedValue: '30000000',
    }));
  }

  const decoyBodies = [
    (fund, value) => [`Fund: ${fund}`, 'Called capital to date: USD 21,000,000', `Committed capital: ${value}`, 'Uncalled capital: USD 9,000,000'],
    (fund, value) => [`Fund: ${fund}`, `Closing NAV: USD ${commas(19_500_000)}`, `Committed capital: ${value}`, 'Committed capital is a separate figure from Closing NAV.'],
    (fund, value) => [`Fund: ${fund}`, 'Class A commitments: USD 18,000,000', 'Class B commitments: USD 12,000,000', `Committed capital: ${value}`],
    (fund, value) => [`Fund: ${fund}`, 'Target fund size: USD 35,000,000', `Committed capital: ${value}`, 'Target size differs from committed capital as of this period.'],
  ];
  decoyBodies.forEach((build, i) => {
    const fundName = nextFundName();
    const value = 'USD 30,000,000';
    const bodyLines = build(fundName, value);
    instances.push(buildInstance({
      id: `committed-capital-decoy-${String(i + 1).padStart(2, '0')}`,
      field: 'committed-capital',
      variant: 'decoy',
      fundName,
      bodyLines,
      targetLineIndex: bodyLines.findIndex((line) => line.startsWith('Committed capital:')) + 1,
      expectedValue: value,
      expectedNormalizedValue: '30000000',
    }));
  });

  const missingBodies = [
    (fund) => [`Fund: ${fund}`, 'NAV ledger extract.', 'Opening NAV: USD 11,000,000', 'Closing NAV: USD 11,400,000'],
    (fund) => [`Fund: ${fund}`, 'Custodian NAV certificate, page 1.', 'Closing NAV: USD 11,400,000 as at quarter end.'],
    (fund) => [`Fund: ${fund}`, 'Compliance declaration.', 'No breaches identified during the reporting period.'],
    (fund) => [`Fund: ${fund}`, 'Audit engagement letter extract.', 'Scope covers the annual financial statements only.'],
  ];
  missingBodies.forEach((build, i) => {
    const fundName = nextFundName();
    instances.push(buildInstance({
      id: `committed-capital-missing-${String(i + 1).padStart(2, '0')}`,
      field: 'committed-capital',
      variant: 'missing',
      fundName,
      bodyLines: build(fundName),
      targetLineIndex: null,
    }));
  });

  const conflictPairs = [
    { group: 'cg-committed-capital-01', values: [15_500_000, 15_000_000] },
    { group: 'cg-committed-capital-02', values: [42_000_000, 40_500_000] },
  ];
  conflictPairs.forEach(({ group, values }, groupIndex) => {
    const fundName = nextFundName();
    values.forEach((value, memberIndex) => {
      const formattedValue = `USD ${commas(value)}`;
      const bodyLines = [
        `Fund: ${fundName}`,
        memberIndex === 0 ? 'Source: Administrator statement, page 2.' : 'Source: Subscription register extract, Schedule A.',
        `Committed capital: ${formattedValue}`,
      ];
      instances.push(buildInstance({
        id: `committed-capital-conflict-${groupIndex + 1}-${memberIndex + 1}`,
        field: 'committed-capital',
        variant: 'conflict',
        conflictGroup: group,
        fundName,
        bodyLines,
        targetLineIndex: 3,
        expectedValue: formattedValue,
        expectedNormalizedValue: String(value),
      }));
    });
  });

  const edgeCases = [
    { line: 'Committed capital (as amended): USD 30,000,000', value: 'USD 30,000,000' },
    { line: 'Committed capital — USD 30,000,000 (all classes)', value: 'USD 30,000,000' },
  ];
  edgeCases.forEach((edge, i) => {
    const fundName = nextFundName();
    instances.push(buildInstance({
      id: `committed-capital-format-edge-${String(i + 1).padStart(2, '0')}`,
      field: 'committed-capital',
      variant: 'format-edge',
      fundName,
      bodyLines: [`Fund: ${fundName}`, 'Reporting period: Quarter ended 30 June 2026', edge.line],
      targetLineIndex: 3,
      expectedValue: edge.value,
      expectedNormalizedValue: '30000000',
    }));
  });

  return instances;
}

function investorComplaintsClosedInstances() {
  const instances = [];
  const cleanCases = [
    { line: 'Investor complaints closed during the quarter: 3', value: '3', normalized: '3' },
    { line: 'Complaints closed: Five (5)', value: 'Five (5)', normalized: '5' },
    { line: 'Investor complaints closed: 02', value: '02', normalized: '2' },
    { line: '7 investor complaints were closed this quarter.', value: '7', normalized: '7' },
    { line: 'Investor complaints closed: Nil (0)', value: 'Nil (0)', normalized: '0' },
    { line: 'Investor complaints closed: 1', value: '1', normalized: '1' },
  ];
  cleanCases.forEach((testCase, i) => {
    const fundName = nextFundName();
    instances.push(buildInstance({
      id: `investor-complaints-closed-clean-${String(i + 1).padStart(2, '0')}`,
      field: 'investor-complaints-closed',
      variant: 'clean',
      fundName,
      bodyLines: [
        `Fund: ${fundName}`,
        'Reporting period: Quarter ended 30 June 2026',
        testCase.line,
      ],
      targetLineIndex: 3,
      expectedValue: testCase.value,
      expectedNormalizedValue: testCase.normalized,
    }));
  });

  const decoyBodies = [
    (fund) => [`Fund: ${fund}`, 'Investor complaints received during the quarter: 5', 'Investor complaints closed during the quarter: 2'],
    (fund) => [`Fund: ${fund}`, 'Investor complaints open at period end: 1', 'Investor complaints closed during the quarter: 4'],
    (fund) => [`Fund: ${fund}`, 'Investor queries logged during the quarter: 9', 'Investor complaints closed during the quarter: 3'],
    (fund) => [`Fund: ${fund}`, 'Investor complaints closed during the quarter: 6', 'Investor complaints pending review: 1'],
  ];
  decoyBodies.forEach((build, i) => {
    const fundName = nextFundName();
    const bodyLines = build(fundName);
    const targetLine = bodyLines.find((line) => line.startsWith('Investor complaints closed'));
    const numberMatch = targetLine.match(/(\d+)/u);
    instances.push(buildInstance({
      id: `investor-complaints-closed-decoy-${String(i + 1).padStart(2, '0')}`,
      field: 'investor-complaints-closed',
      variant: 'decoy',
      fundName,
      bodyLines,
      targetLineIndex: bodyLines.indexOf(targetLine) + 1,
      expectedValue: numberMatch[1],
      expectedNormalizedValue: String(Number.parseInt(numberMatch[1], 10)),
    }));
  });

  const missingBodies = [
    (fund) => [`Fund: ${fund}`, 'Administrator statement extract.', 'Closing NAV: USD 10,200,000', 'Committed capital: USD 18,000,000'],
    (fund) => [`Fund: ${fund}`, 'NAV ledger extract.', 'Opening NAV: USD 9,800,000', 'Closing NAV: USD 10,200,000'],
    (fund) => [`Fund: ${fund}`, 'Subscription register extract.', 'Investor 1: USD 3,000,000', 'Investor 2: USD 2,000,000'],
    (fund) => [`Fund: ${fund}`, 'Custodian NAV certificate.', 'Closing NAV: USD 10,200,000 as at quarter end.'],
    (fund) => [`Fund: ${fund}`, 'Fee schedule extract.', 'Management fee: 1.75% per annum.'],
    (fund) => [`Fund: ${fund}`, 'Board minutes extract.', 'The board approved the quarterly valuation policy.'],
  ];
  missingBodies.forEach((build, i) => {
    const fundName = nextFundName();
    instances.push(buildInstance({
      id: `investor-complaints-closed-missing-${String(i + 1).padStart(2, '0')}`,
      field: 'investor-complaints-closed',
      variant: 'missing',
      fundName,
      bodyLines: build(fundName),
      targetLineIndex: null,
    }));
  });

  const conflictGroup = 'cg-investor-complaints-closed-01';
  const conflictFund = nextFundName();
  [
    { value: '4', source: 'Source: Compliance officer log.' },
    { value: '5', source: 'Source: Administrator statement, page 3.' },
  ].forEach((member, memberIndex) => {
    instances.push(buildInstance({
      id: `investor-complaints-closed-conflict-1-${memberIndex + 1}`,
      field: 'investor-complaints-closed',
      variant: 'conflict',
      conflictGroup,
      fundName: conflictFund,
      bodyLines: [`Fund: ${conflictFund}`, member.source, `Investor complaints closed during the quarter: ${member.value}`],
      targetLineIndex: 3,
      expectedValue: member.value,
      expectedNormalizedValue: member.value,
    }));
  });

  const edgeCases = [
    { line: 'Investor complaints closed (Q2 2026): 6', value: '6' },
    { line: 'No. of investor complaints closed = 2', value: '2' },
  ];
  edgeCases.forEach((edge, i) => {
    const fundName = nextFundName();
    instances.push(buildInstance({
      id: `investor-complaints-closed-format-edge-${String(i + 1).padStart(2, '0')}`,
      field: 'investor-complaints-closed',
      variant: 'format-edge',
      fundName,
      bodyLines: [`Fund: ${fundName}`, 'Reporting period: Quarter ended 30 June 2026', edge.line],
      targetLineIndex: 3,
      expectedValue: edge.value,
      expectedNormalizedValue: edge.value,
    }));
  });

  return instances;
}

export function generateEvalDataset() {
  fundNameCursor = 0;
  const built = [
    ...closingNavInstances(),
    ...committedCapitalInstances(),
    ...investorComplaintsClosedInstances(),
  ];
  return {
    documents: built.map(({ instance, spec }) => ({ path: instance.documentPath, text: `${spec.lines.join('\n')}\n` })),
    instances: built.map(({ instance }) => instance),
  };
}

// --- Scoring -----------------------------------------------------------------
//
// Standard strict-match extraction scoring: a candidate found with the wrong
// normalized value counts as BOTH a false positive (it is an incorrect
// extraction, not a usable one) and a false negative (the correct value was
// not recalled). This is the conventional treatment for information
// extraction with a single expected value per instance.

function normalize(value) {
  return String(value ?? '').trim();
}

export function scoreInstance(expected, predicted) {
  const expectedFound = Boolean(expected?.found);
  const predictedFound = Boolean(predicted?.found);

  if (!expectedFound && !predictedFound) return { outcome: 'TN' };
  if (!expectedFound && predictedFound) return { outcome: 'FP', reason: 'hallucinated-value' };
  if (expectedFound && !predictedFound) return { outcome: 'FN', reason: 'missed-value' };

  const valueMatches = normalize(expected.normalizedValue) === normalize(predicted.normalizedValue);
  if (valueMatches) {
    const locationMatches = expected.location == null || normalize(expected.location) === normalize(predicted.location);
    return { outcome: 'TP', locationMatches };
  }
  return { outcome: 'FP_FN', reason: 'wrong-value' };
}

function emptyCounts() {
  return { total: 0, tp: 0, fp: 0, fn: 0, tn: 0, errors: 0, locatedOfTp: 0 };
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

// Scores a set of instances against a map of instance id -> either
// { extraction } (a completed model call) or { error } (a call that failed
// after retries, excluded from precision/recall but counted separately).
export function scoreResults(instances, resultsById) {
  const byField = {};
  const overall = emptyCounts();
  overall.expectedPositive = 0;
  overall.attemptedPositive = 0;

  for (const field of GOVERNED_FIELDS) byField[field.id] = { ...emptyCounts(), expectedPositive: 0, attemptedPositive: 0 };

  const conflictGroups = new Map();

  for (const instance of instances) {
    const fieldCounts = byField[instance.field];
    const result = resultsById[instance.id];

    if (instance.expected.found) {
      fieldCounts.expectedPositive += 1;
      overall.expectedPositive += 1;
    }

    if (!result || result.error) {
      fieldCounts.total += 1;
      fieldCounts.errors += 1;
      overall.total += 1;
      overall.errors += 1;
      continue;
    }

    const predicted = result.extraction;
    if (instance.expected.found && predicted.found) {
      fieldCounts.attemptedPositive += 1;
      overall.attemptedPositive += 1;
    }

    const scored = scoreInstance(instance.expected, predicted);
    fieldCounts.total += 1;
    overall.total += 1;

    if (scored.outcome === 'TP') {
      fieldCounts.tp += 1;
      overall.tp += 1;
      if (scored.locationMatches) {
        fieldCounts.locatedOfTp += 1;
        overall.locatedOfTp += 1;
      }
    } else if (scored.outcome === 'TN') {
      fieldCounts.tn += 1;
      overall.tn += 1;
    } else if (scored.outcome === 'FP') {
      fieldCounts.fp += 1;
      overall.fp += 1;
    } else if (scored.outcome === 'FN') {
      fieldCounts.fn += 1;
      overall.fn += 1;
    } else if (scored.outcome === 'FP_FN') {
      fieldCounts.fp += 1;
      fieldCounts.fn += 1;
      overall.fp += 1;
      overall.fn += 1;
    }

    if (instance.conflictGroup) {
      const group = conflictGroups.get(instance.conflictGroup) ?? [];
      group.push({ instance, scored, predictedFound: predicted.found });
      conflictGroups.set(instance.conflictGroup, group);
    }
  }

  function summarize(counts) {
    const precision = ratio(counts.tp, counts.tp + counts.fp);
    const recall = ratio(counts.tp, counts.tp + counts.fn);
    const f1 = (precision != null && recall != null && (precision + recall) > 0)
      ? (2 * precision * recall) / (precision + recall)
      : (precision === 0 || recall === 0) ? 0 : null;
    return {
      total: counts.total,
      tp: counts.tp,
      fp: counts.fp,
      fn: counts.fn,
      tn: counts.tn,
      errors: counts.errors,
      precision,
      recall,
      f1,
      coverage: ratio(counts.attemptedPositive, counts.expectedPositive),
    };
  }

  // abstentionRate: fraction of instances (in scope) where the model
  // ultimately abstained (found=false), independent of correctness.
  function abstentionRate(scopeInstances) {
    let abstained = 0;
    let counted = 0;
    for (const instance of scopeInstances) {
      const result = resultsById[instance.id];
      if (!result || result.error) continue;
      counted += 1;
      if (!result.extraction.found) abstained += 1;
    }
    return ratio(abstained, counted);
  }

  function buildFieldMetrics(scopeInstances, counts) {
    const summary = summarize(counts);
    return {
      ...summary,
      abstentionRate: abstentionRate(scopeInstances),
      evidenceLocalizationRate: ratio(counts.locatedOfTp, counts.tp),
      humanReviewRemainingRate: ratio(counts.total - counts.tp, counts.total),
    };
  }

  const overallMetrics = buildFieldMetrics(instances, overall);

  const fieldMetrics = {};
  for (const field of GOVERNED_FIELDS) {
    const scopeInstances = instances.filter((instance) => instance.field === field.id);
    fieldMetrics[field.id] = buildFieldMetrics(scopeInstances, byField[field.id]);
  }

  const conflictGroupResults = [...conflictGroups.entries()].map(([groupId, members]) => {
    const detected = members.length >= 2 && members.every((member) => member.scored.outcome === 'TP');
    return { groupId, memberCount: members.length, detected };
  });
  const conflictDetection = {
    totalGroups: conflictGroupResults.length,
    detectedGroups: conflictGroupResults.filter((group) => group.detected).length,
    recall: ratio(conflictGroupResults.filter((group) => group.detected).length, conflictGroupResults.length),
    groups: conflictGroupResults,
  };

  return {
    overall: overallMetrics,
    byField: fieldMetrics,
    conflictDetection,
  };
}

// --- EVAL.md rendering ---------------------------------------------------

function fmt(value, digits = 2) {
  return value == null ? 'n/a' : value.toFixed(digits);
}

const FIELD_ORDER = GOVERNED_FIELDS.map((field) => field.id);
const FIELD_LABELS = Object.fromEntries(GOVERNED_FIELDS.map((field) => [field.id, field.label]));

export function buildEvalMarkdown({ metrics, meta }) {
  const fieldRows = FIELD_ORDER.map((fieldId) => {
    const m = metrics.byField[fieldId];
    return `| ${FIELD_LABELS[fieldId]} | ${m.total} | ${fmt(m.precision)} | ${fmt(m.recall)} | ${fmt(m.f1)} | ${fmt(m.coverage)} | ${fmt(m.abstentionRate)} | ${fmt(m.evidenceLocalizationRate)} | ${fmt(m.humanReviewRemainingRate)} |`;
  }).join('\n');

  const overall = metrics.overall;
  const overallRow = `| **All fields (micro-average)** | ${overall.total} | ${fmt(overall.precision)} | ${fmt(overall.recall)} | ${fmt(overall.f1)} | ${fmt(overall.coverage)} | ${fmt(overall.abstentionRate)} | ${fmt(overall.evidenceLocalizationRate)} | ${fmt(overall.humanReviewRemainingRate)} |`;

  const conflictRows = metrics.conflictDetection.groups
    .map((group) => `| ${group.groupId} | ${group.memberCount} | ${group.detected ? 'yes' : 'no'} |`)
    .join('\n');

  return `# KRISEVA ATTEST evaluation harness

SYNTHETIC DEMO DATA · RESEARCH-STAGE PROTOTYPE. This is a measurement of a controlled, synthetic evaluation set, not a production accuracy claim. Every document, fund name, and figure below is fabricated for this evaluation and does not describe a real fund, administrator, or investor.

## Dataset

- Instances: ${meta.totalInstances} labeled (field, document) pairs across the three governed fields (Closing NAV, Committed capital, Investor complaints closed).
- Variant types per field: clean (varied currency/count formatting), decoy (target value present alongside distractor numbers), missing (field genuinely absent from the document; correct behavior is abstention), conflict (paired documents that deliberately disagree), and format-edge (uncommon but still explicit phrasing).
- Documents: \`data/source-documents/eval/*.txt\`, generated deterministically by \`scripts/run-eval.mjs\`. Labels: \`data/eval-set.json\`.
- Model: \`${meta.model}\` (reported canonical model: \`${meta.canonicalModel ?? 'unknown'}\`), effort \`${meta.effort}\`.
- Run date: ${meta.runDate}.
- Total model calls this run: ${meta.totalCalls} (one call per labeled instance, the same extraction prompt as \`scripts/live-extract.mjs\`).
- Errored calls (excluded from precision/recall, reported separately): ${meta.errorCount}.
- Calls that needed at least one retry: ${meta.retriedCount}.

## Metric definitions

This harness never reports a single undifferentiated "accuracy" figure. All rates are decimals (0 to 1), not percentages.

- **Precision** = correct extractions / all extractions the model attempted (found=true). A found value with the wrong normalized value counts against precision.
- **Recall** = correct extractions / all instances where a value was truly present. A found-but-wrong value also counts against recall (it did not successfully recall the true value), alongside missed (abstained) instances.
- **F1** = harmonic mean of precision and recall.
- **Coverage** = fraction of truly-present-value instances where the model attempted an extraction at all (found=true), regardless of correctness. Coverage can exceed the correctness rate when the model attempts an answer but gets the value wrong.
- **Abstention rate** = fraction of instances (of any expected outcome) where the model reported \`found=false\`.
- **Evidence-localization success rate** = among correct extractions (TP), the fraction whose reported line location exactly matched the labeled location.
- **Human-review-remaining rate** = fraction of instances that were not a clean, correct, automatic proposal (abstentions, wrong values, and hallucinated values all still require human review under the PROPOSE/ABSTAIN boundary). Equal to \`1 - (TP / total)\`.
- **Conflict-detection recall** = fraction of planted conflict pairs where the model correctly and independently extracted the correct (and therefore differing) value from both member documents. A wrong or missed extraction on either member counts the pair as not detected.

## Results by field

| Field | N | Precision | Recall | F1 | Coverage | Abstention rate | Evidence-localization | Human-review-remaining |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${fieldRows}
${overallRow}

## Conflict-detection recall

Conflict-detection recall: ${fmt(metrics.conflictDetection.recall)} (${metrics.conflictDetection.detectedGroups} of ${metrics.conflictDetection.totalGroups} planted conflict pairs correctly and independently extracted on both sides).

| Conflict group | Members | Detected |
|---|---:|---|
${conflictRows}

## Caveats

- This is a synthetic, controlled test set authored for this evaluation. It is not a production accuracy claim, not a benchmark against real regulatory filings, and not a claim about performance on documents unlike these.
- All instances use a single model (\`${meta.model}\`) at a single effort setting. No comparison across models or settings is made here.
- Every instance targets exactly one field in one short document; the harness does not evaluate multi-field or long-document extraction.
- Full per-instance model output is recorded in \`data/eval-results.json\` for independent re-scoring.
`;
}

// --- CLI ------------------------------------------------------------------

async function writeEvalDocuments(documents) {
  const evalDir = resolve(projectRoot, 'data/source-documents/eval');
  await mkdir(evalDir, { recursive: true });
  for (const document of documents) {
    await writeFile(resolve(projectRoot, document.path), document.text);
  }
}

async function loadDocumentText(relativePath) {
  return readFile(resolve(projectRoot, relativePath), 'utf8');
}

export async function runEval({
  model = DEFAULT_MODEL,
  effort = DEFAULT_EFFORT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES,
  concurrency = 5,
} = {}) {
  const available = await checkClaudeCliAvailable();
  if (!available) {
    throw new Error('The claude CLI is not available on PATH. Install/authenticate the Claude Code CLI before running scripts/run-eval.mjs.');
  }

  const { documents, instances } = generateEvalDataset();
  await writeEvalDocuments(documents);

  const resultsList = await runWithConcurrency(instances, concurrency, async (instance) => {
    const field = fieldById[instance.field];
    const text = await loadDocumentText(instance.documentPath);
    try {
      const result = await extractField({
        field,
        document: { id: instance.id, label: instance.documentLabel, text },
        model,
        effort,
        timeoutMs,
        retries,
      });
      return { id: instance.id, ...result };
    } catch (error) {
      return { id: instance.id, error: error.message };
    }
  });

  const resultsById = Object.fromEntries(resultsList.map((result) => [result.id, result]));
  const metrics = scoreResults(instances, resultsById);

  const modelSample = resultsList.find((result) => result.modelReportedId);
  const errorCount = resultsList.filter((result) => result.error).length;
  const retriedCount = resultsList.filter((result) => (result.attempts?.length ?? 1) > 1).length;

  const meta = {
    model,
    canonicalModel: modelSample?.canonicalModel ?? null,
    effort,
    runDate: new Date().toISOString().slice(0, 10),
    totalInstances: instances.length,
    totalCalls: resultsList.length,
    errorCount,
    retriedCount,
  };

  return { instances, resultsById, resultsList, metrics, meta };
}

async function runCli() {
  process.stdout.write('KRISEVA ATTEST evaluation harness: starting.\n');
  const { instances, resultsList, metrics, meta } = await runEval();

  const evalSetPath = resolve(projectRoot, 'data/eval-set.json');
  await writeFile(evalSetPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), instances }, null, 2)}\n`);

  const resultsPath = resolve(projectRoot, 'data/eval-results.json');
  await writeFile(resultsPath, `${JSON.stringify({ meta, results: resultsList }, null, 2)}\n`);

  const markdown = buildEvalMarkdown({ metrics, meta });
  const evalMdPath = resolve(projectRoot, 'EVAL.md');
  await writeFile(evalMdPath, markdown);

  process.stdout.write(`Instances: ${meta.totalInstances}. Errors: ${meta.errorCount}. Retried calls: ${meta.retriedCount}.\n`);
  process.stdout.write(`Overall precision ${fmt(metrics.overall.precision)}, recall ${fmt(metrics.overall.recall)}, F1 ${fmt(metrics.overall.f1)}.\n`);
  process.stdout.write(`Conflict-detection recall ${fmt(metrics.conflictDetection.recall)} (${metrics.conflictDetection.detectedGroups}/${metrics.conflictDetection.totalGroups}).\n`);
  process.stdout.write(`Wrote ${evalSetPath}\nWrote ${resultsPath}\nWrote ${evalMdPath}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(`Evaluation run failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

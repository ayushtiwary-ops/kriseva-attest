import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const DEFAULT_PUBLIC_FILES = Object.freeze([
  'index.html',
  'technical-notes.html',
  'ARTIFACT_INDEX.md',
  'styles/tokens.css',
  'styles/hub.css',
  'prototype/index.html',
  'prototype/prototype.css',
  'prototype/app.js',
  'wireframes/index.html',
  'wireframes/wireframes.css',
  'wireframes/content.mjs',
  'src/case-engine.js',
  'src/dom-renderers.js',
  'src/manifest.js',
  'src/risk-engine.js',
  'data/synthetic-case.json',
  'data/expected-manifest.json',
  'data/live-run-envelope.json',
  'data/eval-set.json',
  'EVAL.md',
  'deck/DECK_CONTENT.md',
  'deck/SOURCE_NOTES.md',
  'deck/index.html',
  'video/storyboard.md',
  'video/narration.txt',
  'video/captions.srt',
  'video/captions-verbatim.srt',
  'artifacts/deck/deck-manifest.json',
  'artifacts/deck/render-receipt.json',
  'artifacts/deck/layout-audit.json',
  'artifacts/deck/README.md',
  'package.json',
  'README.md',
  'DEMO_WALKTHROUGH.md',
  'ARCHITECTURE.md',
  'SECURITY.md',
  'PRIVACY.md',
  'CONTRIBUTING.md',
  'docs/CLAIMS_REGISTER.md',
  'docs/QA_REPORT.md',
]);

const CLAIM_RULES = Object.freeze([
  {
    rule: 'undefined-product-name',
    pattern: /\be\s*d\s*e\s*s\s*t\b/iu,
  },
  {
    rule: 'unsupported-production-claim',
    pattern: /\b(?:production[- ]ready|deployed|live production|enterprise rbac|zero[- ]egress|tamper[- ]proof|immutable|independently verified)\b/iu,
  },
  {
    rule: 'unsupported-regulatory-claim',
    pattern: /\b(?:(?:ifsca|regulator|regulatory)[- ](?:approved|endorsed|certified)|regulatory approval|integrat(?:e[sd]?|ion)\s+with\s+(?:ifsca|drr)|connected\s+to\s+ifsca\s+systems|sandbox (?:admission|approval)|regulatory filing|(?:ensures?|guarantees?|determines?)\s+compliance)\b/iu,
  },
  {
    rule: 'unsupported-traction-claim',
    pattern: /\b(?:trusted by|serv(?:e[sd]?|ing)|work(?:s|ing) with|have|has)\s+(?:more than\s+|over\s+|\d+\s+)?(?:active\s+)?(?:c\s*u\s*s\s*t\s*o\s*m\s*e\s*r\s*s?|pilots?|users?)\b|\b(?:no\s+fewer\s+than\s+)?\d+\s+(?:c\s*u\s*s\s*t\s*o\s*m\s*e\s*r\s*s?|pilots?|users?)\b|\bour\s+(?:c\s*u\s*s\s*t\s*o\s*m\s*e\s*r\s*s?|pilots?|users?)\b|\bc\s*u\s*s\s*t\s*o\s*m\s*e\s*r\s+pilot(?:\s+(?:(?:is\s+)?(?:underway|active|live|launched)))?\b|\bpilot\s+(?:underway|active|live|launched)\b/iu,
  },
  {
    rule: 'unsupported-performance-claim',
    pattern: /\b(?:not\s+less\s+than\s+)?\d+(?:\.\d+)?%\s+(?:accurate|accuracy)\b|\b(?:cuts?|reduces?|saves?)\b[^.!?;]{0,80}\btime\b[^.!?;]{0,40}\b(?:by\s+)?\d+(?:\.\d+)?%(?!\d)|\b\d+(?:\.\d+)?%\s+(?:time|error)[- ](?:saving|reduction)\b|\breturn on investment\b|\broi\b|\b(?:cuts?|reduces?)\s+errors?\s+by\s+\d+(?:\.\d+)?%(?!\d)/iu,
  },
]);

const SENSITIVE_RULES = Object.freeze([
  {
    rule: 'email-address',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  },
  {
    rule: 'phone-number',
    pattern: /(?:\+?91[\s.-]{0,8})?[6-9]\d{4}[\s.-]{0,8}\d{5}\b|(?:\+\d{1,3}[\s.-]{0,8})?(?:\(\d{2,4}\)|\d{2,4})[\s.-]{1,16}\d{3,4}[\s.-]{1,16}\d{4}\b/u,
  },
  {
    rule: 'date-of-birth',
    pattern: /\b(?:date of birth|dob)\b\s*[:=-]|\b(?:born|birth date)\s+(?:\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/iu,
  },
  {
    rule: 'private-absolute-path',
    pattern: /(?:~\/[^\s'"`<>]+|\/(?:users|home)\/[^\s'"`<>]+|\/var\/folders\/[^\s'"`<>]+|\/private\/var\/[^\s'"`<>]+|[A-Z]:\\Users\\[^\s'"`<>]+)/iu,
  },
  {
    rule: 'possible-secret',
    pattern: /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----|\b(?:sk|ghp|github_pat|AIza)[-_A-Za-z0-9]{12,160}\b|\b(?:sk[-_]|ghp_|github_pat_|AIza)[-_A-Za-z0-9]{4,80}[ \t\n]{1,4}[-_A-Za-z0-9]{4,120}\b|\b(?:api[_-]?[ \t\n]{0,4}k[ \t\n]{0,4}e[ \t\n]{0,4}y|access[_-]?[ \t\n]{0,4}t[ \t\n]{0,4}o[ \t\n]{0,4}k[ \t\n]{0,4}e[ \t\n]{0,4}n|client[_-]?[ \t\n]{0,4}s[ \t\n]{0,4}e[ \t\n]{0,4}c[ \t\n]{0,4}r[ \t\n]{0,4}e[ \t\n]{0,4}t|password)[ \t\n]{0,12}[:=][ \t\n]{0,12}(?:[^\s'"`<>]{8,200}|[^\s'"`<>]{4,100}[ \t\n]{1,4}[^\s'"`<>]{4,100})/iu,
  },
]);

const REGISTERED_SAFE_COPY = Object.freeze([
  /\bnot a regulatory filing\b/giu,
  /\bnot connected to ifsca systems\b/giu,
  /\bdoes not interpret regulation or determine compliance\b/giu,
  /\bno live model call\b/giu,
  /\bhas no customers, pilots, deployment, regulatory approval, or production-readiness claim\b/giu,
  /\bdoes not establish accuracy, customer demand, deployment security, or production readiness\b/giu,
  /\bnot a production security architecture\b/giu,
  /\bnot a claim of immutable storage or independent verification\b/giu,
  /\bno independent security assessment has been performed\b/giu,
  /\baccuracy, time saving, return on investment, or error-reduction figures\b/giu,
  /\bthis receipt is not approval, verification, or a regulatory filing\b/giu,
  /\bthe prototype does not interpret regulation, determine compliance, or replace the accountable human\b/giu,
  /\bdoes not interpret regulation, determine compliance, or replace the accountable human\b/giu,
  /\bno customer pilot is active\b/giu,
]);

function replacePreservingLines(value, pattern) {
  return value.replace(pattern, (match) => match.replace(/[^\n]/gu, ' '));
}

const NAMED_ENTITIES = Object.freeze({
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  NoBreak: '\u2060',
  quot: '"',
  Tab: '\t',
  NewLine: ' ',
  colon: ':',
  ZeroWidthSpace: '\u200b',
  zwj: '\u200d',
  zwnj: '\u200c',
});

const CYRILLIC_CONFUSABLES = Object.freeze({
  '\u0410': 'A',
  '\u0430': 'a',
  '\u0412': 'B',
  '\u0415': 'E',
  '\u0435': 'e',
  '\u041A': 'K',
  '\u041C': 'M',
  '\u041D': 'H',
  '\u041E': 'O',
  '\u043E': 'o',
  '\u0420': 'P',
  '\u0440': 'p',
  '\u0421': 'C',
  '\u0441': 'c',
  '\u0422': 'T',
  '\u0442': 't',
  '\u0425': 'X',
  '\u0445': 'x',
  '\u0423': 'Y',
  '\u0443': 'y',
  '\u0405': 'S',
  '\u0455': 's',
  '\u0395': 'E',
  '\u03B5': 'e',
  '\u03A4': 'T',
  '\u03C4': 't',
  '\u03A3': 'S',
  '\u03C3': 's',
});

function decodeHtmlEntities(content) {
  return content.replace(/&(?:#(?:[xX][0-9A-Fa-f]{1,6};?|\d{1,7};?)|[A-Za-z][A-Za-z0-9]{1,31};)/gu, (entity) => {
    if (entity.startsWith('&#')) {
      const hexadecimal = entity[2]?.toLowerCase() === 'x';
      const endsWithSemicolon = entity.endsWith(';');
      const rawDigits = entity.slice(hexadecimal ? 3 : 2, endsWithSemicolon ? -1 : undefined);
      // HTML parsing consumes the maximal digit run whether or not a semicolon
      // follows, so the scanner must decode the same way a browser renders.
      const digits = rawDigits;
      const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10);
      if (!Number.isInteger(codePoint)
        || codePoint <= 0
        || codePoint > 0x10FFFF
        || (codePoint >= 0xD800 && codePoint <= 0xDFFF)) return entity;
      const decoded = String.fromCodePoint(codePoint);
      const remainder = rawDigits.slice(digits.length);
      return `${/[\r\n]/u.test(decoded) ? ' ' : decoded}${remainder}`;
    }
    return NAMED_ENTITIES[entity.slice(1, -1)] ?? entity;
  });
}

function normalizeContent(content) {
  const canonical = String(content).normalize('NFKC').replace(/\r\n?/gu, '\n');
  const decoded = decodeHtmlEntities(canonical).normalize('NFKC');
  const visible = decoded.replace(/\p{Default_Ignorable_Code_Point}/gu, '');
  return [...visible].map((character) => CYRILLIC_CONFUSABLES[character] ?? character).join('');
}

const BLOCK_HTML_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li',
  'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tr', 'ul',
]);

function renderedHtmlContent(content) {
  let output = '';
  let cursor = 0;
  const tagPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?\s*([A-Za-z][A-Za-z0-9:-]*)\b[^>]*>/gu;
  for (const match of content.matchAll(tagPattern)) {
    output += content.slice(cursor, match.index);
    const tagName = match[1]?.toLowerCase();
    const isClosing = /^<\//u.test(match[0]);
    if (tagName && BLOCK_HTML_TAGS.has(tagName) && (isClosing || tagName === 'br' || tagName === 'hr')) {
      output += match[0].replace(/[^\n]/gu, ' ').replace(/^ /u, '\n');
    } else {
      output += match[0].replace(/[^\n]/gu, '');
    }
    cursor = match.index + match[0].length;
  }
  output += content.slice(cursor);
  return output;
}

function visibleContent(content) {
  let visible = renderedHtmlContent(content);
  visible = visible.replace(/[`*_#>\[\]()]/gu, ' ');
  return visible;
}

function maskRegisteredSafeCopy(content) {
  let visible = content;
  for (const allowedCopy of REGISTERED_SAFE_COPY) {
    visible = replacePreservingLines(visible, allowedCopy);
  }
  return visible;
}

function uniqueViews(views) {
  return [...new Set(views)];
}

function maskLinkContexts(content) {
  let masked = replacePreservingLines(content, /\bhttps?:\/\/[^\s'"`<>\])]+/giu);
  masked = replacePreservingLines(masked, /(?:href|src)\s*=\s*(?:"[^"]*"|'[^']*')/giu);
  masked = replacePreservingLines(masked, /\]\((?:\/\/|\/)[^\s)]+\)/gu);
  return replacePreservingLines(masked, /\((?:\/\/|\/)[^\s)]+\)/gu);
}

function allMatches(pattern, content) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return [...content.matchAll(new RegExp(pattern.source, flags))];
}

function lineAt(content, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content[cursor] === '\n') line += 1;
  }
  return line;
}

export function scanContent(content, file = '<memory>') {
  const normalized = normalizeContent(content);
  const claimViews = uniqueViews([
    maskRegisteredSafeCopy(normalized),
    maskRegisteredSafeCopy(visibleContent(normalized)),
  ]);
  const linkMasked = maskLinkContexts(normalized);
  const sensitiveViews = uniqueViews([linkMasked, visibleContent(linkMasked)]);
  const findings = [];
  const findingKeys = new Set();

  function addFinding(source, rule, match) {
    const finding = {
      file,
      line: lineAt(source, match.index),
      rule,
      match: match[0].replace(/\s+/gu, ' ').trim(),
    };
    const key = `${finding.line}\u0000${finding.rule}\u0000${finding.match.toLocaleLowerCase('en')}`;
    if (findingKeys.has(key)) return;
    findingKeys.add(key);
    findings.push(finding);
  }

  for (const { rule, pattern } of CLAIM_RULES) {
    for (const claimView of claimViews) {
      for (const match of allMatches(pattern, claimView)) {
        addFinding(claimView, rule, match);
      }
    }
  }

  for (const { rule, pattern } of SENSITIVE_RULES) {
    for (const target of sensitiveViews) {
      for (const match of allMatches(pattern, target)) {
        addFinding(target, rule, match);
      }
    }
  }

  return findings.sort((left, right) => left.line - right.line || left.rule.localeCompare(right.rule));
}

export async function scanPublicFiles(rootDirectory = projectRoot, files = DEFAULT_PUBLIC_FILES) {
  const findings = [];
  for (const file of files) {
    const absolutePath = resolve(rootDirectory, file);
    const content = await readFile(absolutePath, 'utf8');
    findings.push(...scanContent(content, relative(rootDirectory, absolutePath) || file));
  }
  return findings;
}

async function runCli() {
  const findings = await scanPublicFiles();
  if (findings.length > 0) {
    for (const finding of findings) {
      process.stderr.write(`${finding.file}:${finding.line} [${finding.rule}] ${finding.match}\n`);
    }
    process.stderr.write(`Claim and privacy scan failed with ${findings.length} finding(s).\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Claim and privacy scan passed: ${DEFAULT_PUBLIC_FILES.length} public files.\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) await runCli();

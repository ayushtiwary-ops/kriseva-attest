function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

// Seven-scene structure (expert-audit rebuild, 2026-08-13). Durations sum to
// exactly 90s / 2700 frames at 30fps: 6+10+12+22+16+12+12 = 90.
// kind 'design' scenes are rendered as HTML/SVG-to-PNG cards (zoompan motion).
// kind 'recording' scenes are genuine Playwright interaction captures of the
// local prototype, framed full-bleed with a caption band (no fake cursor).
export const VIDEO_SCENES = deepFreeze([
  {
    id: 1,
    duration: 6,
    kind: 'design',
    layout: 'cold-open',
    eyebrow: '01 / 07 · COLD OPEN',
    statement: ['Two official records', 'disagree.'],
    question: 'Which number goes to the regulator?',
    values: [
      { label: 'Administrator statement', value: 'USD 25,000,000' },
      { label: 'Subscription register', value: 'USD 24,000,000' },
    ],
    caption: 'Two official records disagree. Which number goes to the regulator?',
    narrationMarker: '[SCENE 1]',
    source: { kind: 'design-only' },
  },
  {
    id: 2,
    duration: 10,
    kind: 'design',
    layout: 'side-rail',
    eyebrow: '02 / 07 · ACCOUNTABILITY',
    title: ['The field is', 'the final claim.'],
    side: ['Reconstruct the source.', 'Preserve disagreement.', 'Keep the human accountable.'],
    caption: 'Accountability depends on the trail behind the field, especially when records disagree.',
    narrationMarker: '[SCENE 2]',
    source: { kind: 'generated-route', route: '/' },
  },
  {
    id: 3,
    duration: 12,
    kind: 'design',
    layout: 'side-rail',
    eyebrow: '03 / 07 · SYNTHETIC CASE',
    title: ['One fictional', 'case.', 'Three evidence', 'states.'],
    side: ['3 synthetic sources', '3 whitelisted fields', '0 regulator connections'],
    caption: 'Fictional case · 3 synthetic sources · 3 fields · no filing or regulator connection.',
    narrationMarker: '[SCENE 3]',
    source: { kind: 'tracked-image', path: 'artifacts/prototype-dashboard-1440.png' },
  },
  {
    id: 4,
    duration: 22,
    kind: 'recording',
    interaction: 'conflict',
    eyebrow: '04 / 07 · CONFLICT + DECISION',
    caption: 'A named reviewer selects the administrator source, types a reason, and submits the decision.',
    narrationMarker: '[SCENE 4]',
    source: { kind: 'recorded-interaction', segment: 'conflict' },
  },
  {
    id: 5,
    duration: 16,
    kind: 'recording',
    interaction: 'signoff',
    eyebrow: '05 / 07 · SIGN-OFF + RECEIPT',
    caption: 'The Principal Officer confirms the record. The receipt keeps the reason and the integrity digest.',
    narrationMarker: '[SCENE 5]',
    source: { kind: 'recorded-interaction', segment: 'signoff' },
  },
  {
    id: 6,
    duration: 12,
    kind: 'design',
    layout: 'side-rail',
    eyebrow: '06 / 07 · BOUNDARY',
    title: ['The harness is', 'built and tested', 'before a model', 'goes inside it.'],
    side: ['Synthetic data only.', 'No filing.', 'No regulator connection.'],
    caption: 'Synthetic demo. No filing. No regulator connection. The harness is tested before any model goes inside it.',
    narrationMarker: '[SCENE 6]',
    source: { kind: 'tracked-image', path: 'artifacts/prototype-receipt-1440.png' },
  },
  {
    id: 7,
    duration: 12,
    kind: 'design',
    layout: 'end-card',
    eyebrow: '07 / 07 · END CARD',
    lines: [
      'Synthetic data. Not a regulatory filing.',
      'Narration synthesized.',
      'Next: practitioner testing.',
    ],
    url: 'ayushtiwary-ops.github.io/kriseva-attest',
    caption: 'Synthetic data. Not a regulatory filing. Narration synthesized. Next: practitioner testing.',
    narrationMarker: '[SCENE 7]',
    source: { kind: 'design-only' },
  },
]);

export const TOTAL_SCENE_DURATION = VIDEO_SCENES.reduce((sum, scene) => sum + scene.duration, 0);

export function sceneStartOffsets(scenes = VIDEO_SCENES) {
  let cursor = 0;
  return scenes.map((scene) => {
    const start = cursor;
    cursor += scene.duration;
    return start;
  });
}

function formatSrtTimestamp(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},000`;
}

function formatSrtTimestampPrecise(totalSeconds) {
  const clamped = Math.max(0, totalSeconds);
  const wholeMs = Math.round(clamped * 1000);
  const hours = Math.floor(wholeMs / 3_600_000);
  const minutes = Math.floor((wholeMs % 3_600_000) / 60_000);
  const seconds = Math.floor((wholeMs % 60_000) / 1000);
  const ms = wholeMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function expectedCaptionsSrt(scenes = VIDEO_SCENES) {
  let start = 0;
  const blocks = scenes.map((scene, index) => {
    const end = start + scene.duration;
    const block = `${index + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${scene.caption}`;
    start = end;
    return block;
  });
  return `${blocks.join('\n\n')}\n`;
}

export function assertCaptionSourceMatches(captionSource, scenes = VIDEO_SCENES) {
  const expected = expectedCaptionsSrt(scenes);
  if (captionSource !== expected) {
    throw new Error('Human-maintained caption source does not match the canonical video scene contract.');
  }
  return true;
}

export function splitNarrationByScene(narrationSource, scenes = VIDEO_SCENES) {
  const markerPattern = /^\[SCENE (\d+)\][ \t]*$/gmu;
  const markers = [...narrationSource.matchAll(markerPattern)];
  if (markers.length !== scenes.length) {
    throw new Error(`Expected ${scenes.length} narration sections, found ${markers.length}.`);
  }

  return markers.map((marker, index) => {
    const scene = scenes[index];
    const id = Number(marker[1]);
    if (id !== scene.id || marker[0] !== scene.narrationMarker) {
      throw new Error(`Narration section ${index + 1} must use ${scene.narrationMarker}.`);
    }
    const start = marker.index + marker[0].length;
    const end = markers[index + 1]?.index ?? narrationSource.length;
    const text = narrationSource.slice(start, end).trim().replaceAll(/\s+/gu, ' ');
    if (!text) throw new Error(`Narration section ${scene.id} is empty.`);
    return { id, marker: scene.narrationMarker, text };
  });
}

// --- Verbatim caption sidecar -----------------------------------------
// Built at video-build time from the *measured* per-scene narration audio
// duration (not the nominal scene duration), so cue timing tracks the real
// synthesized voice track. Cue text is capped to keep cues readable: at most
// two lines of ~42 characters, and at most ~7 seconds on screen.
export const VERBATIM_CAPTION_LIMITS = Object.freeze({
  maxCueSeconds: 7,
  maxLineChars: 42,
  maxLines: 2,
});

export function splitIntoSentences(text) {
  const normalized = String(text).trim().replaceAll(/\s+/gu, ' ');
  if (!normalized) return [];
  const matches = normalized.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/gu) ?? [normalized];
  return matches.map((sentence) => sentence.trim()).filter(Boolean);
}

// Greedily wraps a sentence into chunks that each fit the on-screen cue
// budget (maxLines lines of at most maxLineChars characters). Returns the
// chunks in reading order; each chunk carries both its flat text (used for
// character-proportional timing) and its wrapped display lines.
export function wrapIntoCueChunks(sentenceText, limits = VERBATIM_CAPTION_LIMITS) {
  const { maxLineChars, maxLines } = limits;
  const words = String(sentenceText).trim().split(/\s+/u).filter(Boolean);
  const chunks = [];
  let lines = [''];
  let chunkWords = [];

  const flush = () => {
    if (chunkWords.length === 0) return;
    chunks.push({ text: chunkWords.join(' '), lines: lines.filter((line) => line.length > 0) });
    lines = [''];
    chunkWords = [];
  };

  for (const word of words) {
    const currentLine = lines.at(-1);
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxLineChars) {
      lines[lines.length - 1] = candidate;
      chunkWords.push(word);
      continue;
    }
    if (lines.length < maxLines) {
      lines.push(word);
      chunkWords.push(word);
      continue;
    }
    flush();
    lines = [word];
    chunkWords = [word];
  }
  flush();
  return chunks;
}

// Allocates cue start/end times for one scene's narration text within its
// measured narration duration, proportional to character count, honoring
// the max cue duration and line-wrap limits.
export function buildSceneVerbatimCues(text, measuredDuration, limits = VERBATIM_CAPTION_LIMITS) {
  const sentences = splitIntoSentences(text);
  const sentenceChunks = sentences.map((sentence) => wrapIntoCueChunks(sentence, limits));
  const totalChars = sentenceChunks.reduce(
    (sum, chunks) => sum + chunks.reduce((chunkSum, chunk) => chunkSum + chunk.text.length, 0),
    0,
  );
  if (totalChars === 0 || !(measuredDuration > 0)) return [];

  const cues = [];
  let cursor = 0;
  for (const chunks of sentenceChunks) {
    for (const chunk of chunks) {
      const share = chunk.text.length / totalChars;
      const rawDuration = measuredDuration * share;
      const duration = Math.min(rawDuration, limits.maxCueSeconds);
      const start = cursor;
      const end = Math.min(measuredDuration, start + Math.max(duration, 0.2));
      cues.push({ startSeconds: start, endSeconds: end, lines: chunk.lines });
      cursor = end;
    }
  }
  return cues;
}

// Builds the full verbatim cue list across every scene, positioned on the
// final assembled timeline (each scene starts at the cumulative sum of the
// *nominal* contract durations, since that is where its audio begins in the
// rendered master).
export function buildVerbatimCues(scenes, narrationTexts, measuredDurations, limits = VERBATIM_CAPTION_LIMITS) {
  if (scenes.length !== narrationTexts.length || scenes.length !== measuredDurations.length) {
    throw new Error('Scenes, narration texts, and measured durations must be the same length.');
  }
  const offsets = sceneStartOffsets(scenes);
  const cues = [];
  scenes.forEach((scene, index) => {
    const sceneCues = buildSceneVerbatimCues(narrationTexts[index], measuredDurations[index], limits);
    for (const cue of sceneCues) {
      cues.push({
        startSeconds: offsets[index] + cue.startSeconds,
        endSeconds: offsets[index] + cue.endSeconds,
        lines: cue.lines,
      });
    }
  });
  return cues;
}

export function formatVerbatimSrt(cues) {
  const blocks = cues.map((cue, index) => (
    `${index + 1}\n${formatSrtTimestampPrecise(cue.startSeconds)} --> ${formatSrtTimestampPrecise(cue.endSeconds)}\n${cue.lines.join('\n')}`
  ));
  return `${blocks.join('\n\n')}\n`;
}

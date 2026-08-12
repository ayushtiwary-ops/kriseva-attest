function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

export const VIDEO_SCENES = deepFreeze([
  {
    id: 1,
    duration: 12,
    cropTop: 0,
    eyebrow: '01 / ACCOUNTABILITY',
    title: ['The field is', 'the final claim.'],
    side: ['Reconstruct the source.', 'Preserve disagreement.', 'Keep the human accountable.'],
    caption: 'Accountability depends on the trail behind the field, especially when records disagree.',
    narrationMarker: '[SCENE 1]',
    source: { kind: 'generated-route', route: '/' },
  },
  {
    id: 2,
    duration: 12,
    cropTop: 0,
    eyebrow: '02 / SYNTHETIC CASE',
    title: ['One fictional', 'case.', 'Three evidence', 'states.'],
    side: ['3 synthetic sources', '3 whitelisted fields', '0 regulator connections'],
    caption: 'Fictional case · 3 synthetic sources · 3 fields · no filing or regulator connection.',
    narrationMarker: '[SCENE 2]',
    source: { kind: 'tracked-image', path: 'artifacts/prototype-dashboard-1440.png' },
  },
  {
    id: 3,
    duration: 12,
    cropTop: 0,
    eyebrow: '03 / SUPPORTED',
    title: ['Agreement', 'keeps its', 'references.'],
    side: ['Normalized values agree.', 'Both fingerprints remain.', 'No compliance conclusion.'],
    caption: 'Agreement stays linked to both source references and fingerprints.',
    narrationMarker: '[SCENE 3]',
    source: { kind: 'tracked-image', path: 'artifacts/prototype-trace-1440.png' },
  },
  {
    id: 4,
    duration: 22,
    cropTop: 90,
    eyebrow: '04 / CONFLICT + ABSTENTION',
    title: ['Two sources.', 'No invented', 'winner.'],
    side: ['INR 50,000,000', 'INR 48,000,000', 'Missing evidence → abstain'],
    caption: 'Two values remain visible. Missing evidence triggers abstention, never a guessed value.',
    narrationMarker: '[SCENE 4]',
    source: { kind: 'tracked-image', path: 'artifacts/prototype-conflict-1440.png' },
  },
  {
    id: 5,
    duration: 17,
    cropTop: 100,
    eyebrow: '05 / NAMED HUMAN',
    title: ['The decision', 'is explicit', 'and reasoned.'],
    side: ['Action attributed', 'Source retained', 'Reason recorded'],
    caption: 'The human chooses, explains, and remains accountable.',
    narrationMarker: '[SCENE 5]',
    source: { kind: 'tracked-image', path: 'artifacts/prototype-receipt-1440.png' },
  },
  {
    id: 6,
    duration: 15,
    cropTop: 900,
    eyebrow: '06 / EVIDENCE RECEIPT',
    title: ['Retain the', 'record.', 'Test the need.'],
    side: ['Application product: ATTEST', 'Next: practitioner testing', 'Company wedge: not locked'],
    caption: 'Receipt: sources, conflict, decision, unresolved evidence. Next: practitioner testing.',
    narrationMarker: '[SCENE 6]',
    source: { kind: 'tracked-image', path: 'artifacts/prototype-receipt-1440.png' },
  },
]);

function formatSrtTimestamp(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},000`;
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

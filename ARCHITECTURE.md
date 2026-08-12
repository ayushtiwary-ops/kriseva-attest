# Architecture

KRISEVA ATTEST is a dependency-light static demonstration. The hub is plain HTML and CSS. The prototype uses browser ES modules, a fixed synthetic JSON fixture, and pure JavaScript state transitions. No backend is required for the demonstration.

## Boundaries

- The case is fictional and visibly marked as synthetic demo data.
- The review is a recorded deterministic prototype trace with no live model call.
- The prototype does not write or submit an official return.
- It is not connected to IFSCA systems or DRR interfaces.
- A human decision with a reviewer and reason is required for a material conflict.

## Data flow

1. `data/synthetic-case.json` defines one fictional entity, three fictional sources, and three whitelisted fields.
2. `src/case-engine.js` derives supported, conflicting, or unsupported status from candidate presence and normalized-value equality.
3. `prototype/app.js` renders the six-screen review flow and holds the current session state in memory.
4. A reviewer action appends an attributed decision without replacing the two original conflict candidates.
5. `src/manifest.js` serializes source fingerprints, candidates, decisions, and unresolved items into bounded JSON or printable HTML.
6. Reset reloads the fixture and clears the current browser-session decisions.

## Local verification

Browser tests use a same-origin local route and reject remote resource requests. Unit tests exercise non-mutating state transitions, conflict preservation, reviewer requirements, manifest bounds, and export determinism. Capture helpers use fixed synthetic timestamps and review text for reproducible screenshots.

These checks describe this repository and demonstration only. They are not evidence for a real regulated deployment.

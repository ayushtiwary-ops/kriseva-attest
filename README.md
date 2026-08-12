# KRISEVA ATTEST

KRISEVA ATTEST is a research-stage, human-reviewed evidence-workbench prototype for one fictional reporting case. It demonstrates three bounded outcomes: supported evidence, conflicting evidence, and unsupported evidence. A named human records the material decision.

The repository is the published submission package for the GIFT IFIH Young Builders' Program application. It is not a regulatory filing, is not connected to IFSCA systems, and uses synthetic demo data only.

- Live hub: `https://ayushtiwary-ops.github.io/kriseva-attest/`
- Source: `https://github.com/ayushtiwary-ops/kriseva-attest`

## Run locally

Requirements: a current Node.js runtime and the declared npm dependencies.

```bash
npm install
npm run serve
```

Open `http://127.0.0.1:4173/`.

## Verify

```bash
npm test
npm run verify:claims
npm run capture
npm run deck
npm run deck:render
npm run video:verify
```

`npm test` runs pure state/manifest tests and local Playwright browser checks. `verify:claims` scans every file in the governed public-release set, including browser HTML/CSS/JavaScript, synthetic JSON, deck source, captions, and repository documentation, for prohibited maturity, regulatory, traction, performance, identity, private-path, PII, and secret patterns. `capture` regenerates the wireframe and prototype evidence images. The deck commands rebuild and render the editable presentation; `video:verify` checks the committed media without rebuilding the local draft voice.

## Demonstration path

1. Run the deterministic evidence review.
2. Inspect one supported, one conflicting, and one unsupported field.
3. Record a named human decision with a reason.
4. Download the local JSON or printable HTML evidence manifest.

The demonstration does not interpret regulation, decide compliance, populate an official return, submit a filing, connect to DRR, or invoke a live model. It establishes interface behavior only; it does not establish accuracy, customer demand, deployment security, or production readiness.

## Repository map

- `index.html` - JS-free submission dossier and artifact index.
- `technical-notes.html` - browser-readable architecture and operating boundaries.
- `prototype/` - interactive six-screen synthetic review workflow.
- `wireframes/` - grayscale information-architecture board.
- `data/` - fictional case and deterministic export oracle.
- `src/` - pure review and manifest modules.
- `tests/` - Node and Playwright acceptance tests.
- `docs/CLAIMS_REGISTER.md` - public-copy boundary.
- `ARTIFACT_INDEX.md` - deliverable paths, maturity, and publication gates.
- `CHECKSUMS.sha256` - governed release-artifact digests.
- `docs/QA_REPORT.md` - mechanical and visual verification receipt.
- `ARCHITECTURE.md`, `SECURITY.md`, `PRIVACY.md` - technical and operating limits.

## Public and private scope

The browser-facing code, synthetic fixture, deck source, video source, artifact index, QA receipt, and governance documents named by `DEFAULT_PUBLIC_FILES` in `scripts/verify-claims.mjs` form the governed public-release set. Founder decision notes, application-field guidance, contributor acceptance material, meeting capture, and the Claude review handoff are private founder handoff documents. They are not included in a public repository export. A public export must be assembled and re-scanned only after separate founder approval.

## Publication state

The verified video and deck are available only as local package links. No public GitHub or hosted-demo address is asserted in this repository. Publishing, deploying, uploading artifacts, accepting programme terms, and submitting the application remain founder actions.

## License scope

The Apache License 2.0 applies to original code and synthetic fixtures created in this repository. It does not grant rights to third-party marks, programme materials, regulator publications, or external content that may be cited but is not included here.

# KRISEVA ATTEST deck source notes

These are source and claim receipts, not audience-facing validation claims.
`repo:` paths resolve from the repository root unless an absolute path is shown.

## Rebuild boundary

The deck build guarantees a visual-semantic contract: ordered visible copy,
speaker-note sources, named layout, physical type floors, and materially equivalent
slide renders. It does not promise byte-identical PPTX/PDF archives, stable package
metadata, or stable internal object IDs. Any SHA-256 value identifies one current
export only; it is not evidence of binary reproducibility.

## Slide 1 · Application product lock

- `repo:docs/superpowers/specs/2026-08-12-attest-submission-system-design.md`
  defines the bounded application product and synthetic-data boundary.
- `repo:docs/PRODUCT_DECISION.md` records that the company wedge remains
  conditional rather than approved.

## Slide 2 · Accountability question

- `workspace:10_GIFT_CITY/00_CONTROL/STATUS.md` records zero live
  practitioner conversations and the unclosed workflow questions.
- `workspace:10_GIFT_CITY/00_CONTROL/DECISION_LOG.md` D-010 labels
  the upstream reconciliation need as a document-derived hypothesis.
- `repo:docs/superpowers/specs/2026-08-12-attest-submission-system-design.md`
  keeps buyer, operator and willingness-to-pay gates open.

## Slide 3 · DRR boundary

- [IFSCA DRR concept note, 20 March 2025](https://www.ifsca.gov.in/Document/Tender/concept-note_drr-consultation_2003202520032025073433.pdf)
  describes structured reporting, validation and submission channels.
- [IFSCA DRR award notice, 9 March 2026](https://www.ifsca.gov.in/CommonDirect/ViewFile?fileName=Award_of_Contract_under_RFPs_for_DRR_Solution_and_ERP_System_20260309_0153.pdf&id=d575554ec59b09e7fde503d3a82787c7)
  records the procurement result.
- [IRIS exchange disclosure, 29 January 2026](https://bsmedia.business-standard.com/_media/bs/data/announcements/bse/29012026/13c21166-8138-4630-a8b3-4f6b2202472e.pdf)
  describes its NEC subcontract and project duration. No source proves a
  provider gap or live DRR production status; the slide says so explicitly and
  describes the procured scope rather than a completed deployment.

## Slide 4 · Synthetic case

- `repo:data/synthetic-case.json` is the single source for the fictional entity,
  period, three fields, candidate values and evidence states.
- `repo:src/case-engine.js` defines supported, conflicting and unsupported
  behavior for the deterministic prototype.

## Slide 5 · Workflow

- `repo:docs/superpowers/specs/2026-08-12-attest-submission-system-design.md`
  sections 3 and 8 define the bounded source-to-manifest flow.
- `repo:src/case-engine.js` and `repo:src/manifest.js` implement comparison,
  human-decision recording and local export.

## Slide 6 · Agent boundary

- `repo:prototype/app.js` replays the disclosed deterministic capture path.
- `repo:artifacts/prototype-trace-1440.png` is the current trace screen.
- `repo:docs/superpowers/specs/2026-08-12-attest-submission-system-design.md`
  prohibits live-model, filing and compliance claims.

## Slide 7 · Current prototype proof

- `repo:artifacts/prototype-conflict-1440.png` and
  `repo:artifacts/prototype-receipt-1440.png` are committed local captures, not
  drawn mock interfaces.
- `repo:.superpowers/sdd/2026-08-12-attest-submission-system/task-5-report.md`
  records the deterministic capture and browser QA receipt.

## Slide 8 · Revenue sensitivity

- `repo:docs/BUSINESS_VIABILITY.md` defines the ₹3L/₹6L/₹12L arithmetic inputs,
  5/20/50-entity cases and the buyer, bundling, legal, paid-test and support gates.
- `repo:docs/superpowers/specs/2026-08-12-attest-submission-system-design.md`
  section 13 states the validation conditions. Values are illustrative
  arithmetic, not TAM, a forecast, pricing evidence or willingness-to-pay proof.

## Slide 9 · Ownership

- `repo:docs/CONTRIBUTOR_SCOPE.md` defines equal accountability and the written
  acceptance/public-attribution gate.
- `repo:docs/superpowers/specs/2026-08-12-attest-submission-system-design.md`
  section 11 defines the proposed sprint lanes. The deck deliberately omits the
  proposed contributor's name until the gate is closed.

## Slide 10 · Programme ask

- [GIFT IFIH Young Builders programme page](https://www.giftifih.in/young-builders-program)
  is the primary programme source.
- `repo:docs/MEETING_BRIEF_2026-08-12.md` defines the practitioner-access and DRR
  boundary questions.
- `repo:docs/PRODUCT_DECISION.md` defines the week-eight lock/reject decision.

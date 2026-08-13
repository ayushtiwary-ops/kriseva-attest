# KRISEVA ATTEST deck source notes

These are source and claim receipts, not audience-facing validation claims.
`repo:` paths resolve from the repository root unless an absolute path is shown.

## Rebuild boundary

The deck build guarantees a visual-semantic contract: ordered visible copy,
speaker-note sources, named layout, physical type floors, and materially equivalent
slide renders. It does not promise byte-identical PPTX/PDF archives, stable package
metadata, or stable internal object IDs. Any SHA-256 value identifies one current
export only; it is not evidence of binary reproducibility.

## Slide 1 · Cover

- `repo:docs/superpowers/specs/2026-08-12-attest-submission-system-design.md`
  defines the bounded application product and synthetic-data boundary.
- `repo:docs/PRODUCT_DECISION.md` records that the company wedge remains
  conditional rather than approved.
- 2026-08-13 audit: the visible lock line was rewritten to "This prototype is
  final for this application. Whether it becomes the company's product is
  deliberately still open," which states the same PRODUCT_DECISION.md boundary
  in plainer audience-facing language. The superseded wording ("Application
  product lock. Company wedge not locked.") is retained only in the slide-1
  speaker notes for audit continuity; it is not deleted, just no longer the
  visible claim.
- The cover's dark sidebar now also carries the published live-hub URL
  (`ayushtiwary-ops.github.io/kriseva-attest`), matching the same address in
  `README.md` and `ARTIFACT_INDEX.md`.
- 2026-08-13 positioning audit: body line 1 was rewritten from "A bounded
  source-to-field evidence workbench for human review." to "An entity-side
  evidence-integrity and human-accountability layer for AI-assisted
  regulatory reporting in GIFT IFSC.", the exact recommended positioning
  statement from `docs/RESEARCH_BRIEF_2026-08-13.md` (Question 13). This
  replaces the prior workbench framing as the lead category everywhere the
  hub, README, technical notes, and this cover state the category; "Evidence
  Integrity Layer" remains only as the internal architecture name one level
  down (see `docs/notebooklm/NLM_02_SOLUTION_EVIDENCE_INTEGRITY_LAYER.md`),
  never as the cover's lead line. Slide-body word count after the change:
  39 of 40 words. Slide 3's DRR-boundary wording was reviewed against the
  same brief and left unchanged; it already states DRR's scope precisely
  and carries the "Public absence is not proof." hedge.

## Slide 2 · Accountability question

- `workspace:10_GIFT_CITY/00_CONTROL/STATUS.md` records zero live
  practitioner conversations and the unclosed workflow questions.
- `workspace:10_GIFT_CITY/00_CONTROL/DECISION_LOG.md` D-010 labels
  the upstream reconciliation need as a document-derived hypothesis.
- `repo:docs/superpowers/specs/2026-08-12-attest-submission-system-design.md`
  keeps buyer, operator and willingness-to-pay gates open.
- 2026-08-13 audit: the three previously unlabeled ruled lines in the right
  column now carry small mono captions ("Statement", "Ledger", "Schedule"),
  naming the three document types already named in the body copy below them
  ("Statements, ledgers and schedules can disagree or leave evidence
  missing."). No new claim; a label added to existing decoration.

## Slide 3 · DRR boundary

- [IFSCA DRR concept note, 20 March 2025](https://www.ifsca.gov.in/Document/Tender/concept-note_drr-consultation_2003202520032025073433.pdf)
  describes structured reporting, validation and submission channels.
- [IFSCA DRR award notice, 9 March 2026](https://www.ifsca.gov.in/CommonDirect/ViewFile?fileName=Award_of_Contract_under_RFPs_for_DRR_Solution_and_ERP_System_20260309_0153.pdf&id=d575554ec59b09e7fde503d3a82787c7)
  records the procurement result.
- [IRIS exchange disclosure, 29 January 2026](https://bsmedia.business-standard.com/_media/bs/data/announcements/bse/29012026/13c21166-8138-4630-a8b3-4f6b2202472e.pdf)
  describes its NEC subcontract and project duration. No source proves a
  provider gap or live DRR production status; the slide says so explicitly and
  describes the procured scope rather than a completed deployment.
- 2026-08-13 audit: "DRR" is now expanded on first use ("DRR (IFSCA's Digital
  Regulatory Reporting platform, procured 2026)") inside the visible body copy
  rather than assuming the acronym is known. The "Public absence is not proof."
  caveat was moved from the DRR (navy) column to sit directly under "No claimed
  gap." in the ATTEST column, since that is the specific claim it qualifies.
  No source or claim changed, only placement and acronym expansion.

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
- 2026-08-13 audit: all five step labels now render at the same (regular)
  weight; step 05 was previously bold while 01 to 04 were regular for no
  documented reason. No content changed.

## Slide 6 · Agent boundary

- `repo:prototype/app.js` replays the disclosed deterministic capture path.
- `repo:artifacts/prototype-trace-1440.png` is the current trace screen.
- `repo:docs/superpowers/specs/2026-08-12-attest-submission-system-design.md`
  prohibits live-model, filing and compliance claims.
- 2026-08-13 audit: added the line "Harness built and tested before any model
  enters," and shortened the heading to "DETERMINISTIC TRACE" to stay inside
  the 40-word body limit. The added line paraphrases the founder-approved
  spine and Q8 answer in `repo:docs/DEFENSE_QA.md` ("We built and
  test-hardened the harness before putting a model inside it" / "We built the
  seatbelt before the car"). `docs/DEFENSE_QA.md` is a private founder handoff,
  not a public artifact; only this path reference is recorded here, not its
  content.

## Slide 7 · Current prototype proof

- `repo:artifacts/prototype-conflict-1440.png` and
  `repo:artifacts/prototype-receipt-1440.png` are committed local captures, not
  drawn mock interfaces. Both were recaptured on 2026-08-13; the receipt now
  shows the Confirming Principal Officer step.
- `repo:.superpowers/sdd/2026-08-12-attest-submission-system/task-5-report.md`
  records the deterministic capture and browser QA receipt.
- 2026-08-13 audit: the two embedded crops were re-cut to whole UI modules.
  The left crop is the full two-candidate comparison card (headers, USD
  values, exact reference and input fingerprint, nothing truncated). The
  right crop is the reviewer decision block through the new Confirming
  Principal Officer confirmation, ending at the card's own border. Neither
  crop cuts a field or sentence mid-line.
- Build-tooling note: `scripts/build-deck.mjs`'s declarative `image.crop`
  (OOXML srcRect) is not honoured by this toolchain's PNG/canvas export path,
  so a fractional crop set that way is invisible in `artifacts/deck/*.png`
  and the montage even though it would appear correct if the raw PPTX were
  opened in PowerPoint. This is why the previous crops looked plausible in
  source but rendered as arbitrary, unbounded slices. `addImage` now crops
  the source PNG pixel-exact with `sharp` before the bytes reach the slide
  (`pixelCrop: {left, top, width, height}`), which renders correctly in every
  export path. Left crop source rect: `{left:337, top:860, width:695,
  height:708}` of the 1440x1647 conflict capture. Right crop source rect:
  `{left:224, top:1855, width:750, height:440}` of the 1440x3011 receipt
  capture.

## Slide 8 · Revenue sensitivity

- `repo:docs/BUSINESS_VIABILITY.md` defines the ₹3L/₹6L/₹12L arithmetic inputs,
  5/20/50-entity cases and the buyer, bundling, legal, paid-test and support gates.
- `repo:docs/superpowers/specs/2026-08-12-attest-submission-system-design.md`
  section 13 states the validation conditions. Values are illustrative
  arithmetic, not TAM, a forecast, pricing evidence or willingness-to-pay proof.
- 2026-08-13 audit: the gates line was rewritten to "Unproven gates: buyer,
  bundling risk, legal perimeter, paid test, support economics" and one
  explicitly labeled hypothesis line was added: "If the wedge locks: the same
  evidence substrate extends to adjacent regulated-reporting workflows
  (hypothesis)." This paraphrases `docs/BUSINESS_VIABILITY.md`'s "Surviving
  value and moat hypothesis" section and the expansion framing in
  `repo:docs/DEFENSE_QA.md` Q17/Q20 (private founder handoff; only the path is
  recorded here). To stay inside the 40-word body limit with both new lines,
  the table was compressed from the full 3-entity-count by 3-price-tier grid
  to its two bounding corners (5 entities at ₹3L and 50 entities at ₹12L),
  which preserves the exact same minimum (₹15L) and maximum (₹6Cr) values as
  the original grid; the interior 20-entity row and ₹6L column were dropped
  from the visible table, not the arithmetic. The disclaimer was shortened to
  "Not TAM or WTP." for the same word-budget reason; the fuller "willingness
  to pay" and "forecast" language remains in `docs/BUSINESS_VIABILITY.md`.

## Slide 9 · Ownership

- `repo:docs/CONTRIBUTOR_SCOPE.md` defines the written
  acceptance/public-attribution gate and the proposed-and-inactive role state.
- `repo:docs/superpowers/specs/2026-08-12-attest-submission-system-design.md`
  section 11 defines the proposed sprint lanes. The deck deliberately omits the
  proposed contributor's name until the gate is closed.
- 2026-08-13 audit: retitled from "Equal contribution means equal
  accountability" to "One accountable founder. One defined finance lane."
  and renamed the second header from "FINANCE & BUSINESS ANALYSIS OWNER" to
  "FINANCE & BUSINESS ANALYSIS LANE," removing language that could imply
  co-founder or ownership status, consistent with `docs/CONTRIBUTOR_SCOPE.md`'s
  explicit rule against calling the proposed contributor a co-founder,
  shareholder, or employee. The second lane's copy was shortened to "Case
  consistency, buyer hypotheses, pricing research, workflow QA." (dropped
  "pitch and demo contribution" to make room). AYUSH TIWARY's copy now reads
  "Engineering, integration, test evidence, packaging. KRISEVA ships
  evidence-first, human-review procurement software in Indian defense today."
  The second sentence is a verbatim reuse of the founder-approved Q10 answer
  in `repo:docs/DEFENSE_QA.md` ("Why trust a defense company entering
  fintech?"), which is the deck's designated placement for that line per that
  document's placement map. `docs/DEFENSE_QA.md` is a private founder handoff,
  not a public artifact; only this path reference is recorded here, not its
  content. The gate band "Proposed contributor · pending written acceptance
  and public attribution." is unchanged.

## Slide 10 · Programme ask

- [GIFT IFIH Young Builders programme page](https://www.giftifih.in/young-builders-program)
  is the primary programme source.
- `repo:docs/MEETING_BRIEF_2026-08-12.md` defines the practitioner-access and DRR
  boundary questions.
- `repo:docs/PRODUCT_DECISION.md` defines the week-eight lock/reject decision.
- 2026-08-13 audit: "FME" is now expanded on first use ("2 FME (fund
  management entity) officers + 2 administrators + 1 independent compliance
  provider"), matching `repo:docs/PRODUCT_DECISION.md`'s five-workflow-
  conversation gate unchanged. The CHALLENGE line was tightened to "Is
  upstream evidence outside DRR/bundled services?" (same question, fewer
  words) to hold the slide inside the 40-word body limit after the FME
  expansion. The DECIDE line's optional "Pre-registered kill conditions"
  addition did not fit the remaining budget, so it was left as "DECIDE · Lock
  or reject by week 8" per the fallback instruction; the pre-registered
  kill-condition framing already lives in `repo:docs/DEFENSE_QA.md` Q16/Q18.
  A footer line was added with the published live-hub and repository
  addresses ("Live: ayushtiwary-ops.github.io/kriseva-attest · Code:
  github.com/ayushtiwary-ops/kriseva-attest"), matching `README.md` and
  `ARTIFACT_INDEX.md`; footers are excluded from the body word budget.

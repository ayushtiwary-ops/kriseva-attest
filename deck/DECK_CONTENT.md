# KRISEVA ATTEST · GIFT IFIH 2026 deck content contract

Audience: GIFT IFIH Young Builders evaluators. The deck asks for access and a
bounded validation opportunity, not approval of ATTEST as KRISEVA's permanent
company wedge. Every visible claim below is rendered from this contract. Titles,
source footers, and page labels are excluded from the 40-word body limit.

<!-- CONTRACT:START -->
```json
{
  "slides": [
    {
      "number": 1,
      "layout": "cover",
      "title": "KRISEVA ATTEST",
      "body": [
        "An entity-side evidence-integrity and human-accountability layer for AI-assisted regulatory reporting in GIFT IFSC.",
        "This prototype is final for this application. Whether it becomes the company's product is deliberately still open.",
        "Research-stage prototype · synthetic data · no filing · no regulator connection"
      ],
      "speakerNotes": [
        "Superseded cover framing, retained for audit only (replaced 2026-08-13):",
        "\"Application product lock. Company wedge not locked.\""
      ],
      "sources": [
        "repo:docs/superpowers/specs/2026-08-12-attest-submission-system-design.md",
        "repo:docs/PRODUCT_DECISION.md"
      ]
    },
    {
      "number": 2,
      "layout": "accountability",
      "title": "The problem: which source backs a reported field?",
      "body": [
        "ACCOUNTABILITY QUESTION",
        "Structured returns do not remove the source question.",
        "Which source supports this reported field?",
        "Statements, ledgers and schedules can disagree or leave evidence missing.",
        "The operator, buyer, frequency, pain and willingness to pay remain unvalidated."
      ],
      "sources": [
        "workspace:10_GIFT_CITY/00_CONTROL/STATUS.md",
        "workspace:10_GIFT_CITY/00_CONTROL/DECISION_LOG.md",
        "repo:docs/superpowers/specs/2026-08-12-attest-submission-system-design.md"
      ]
    },
    {
      "number": 3,
      "layout": "boundary",
      "title": "DRR targets submission; evidence starts upstream",
      "body": [
        "DRR",
        "DRR (IFSCA's Digital Regulatory Reporting platform, procured 2026): structured reporting channels, validation and submission infrastructure.",
        "ATTEST",
        "Provider-neutral source references, disagreement and human review",
        "No filing. No DRR connection. No claimed gap.",
        "Public absence is not proof."
      ],
      "sources": [
        "https://www.ifsca.gov.in/Document/Tender/concept-note_drr-consultation_2003202520032025073433.pdf",
        "https://www.ifsca.gov.in/CommonDirect/ViewFile?fileName=Award_of_Contract_under_RFPs_for_DRR_Solution_and_ERP_System_20260309_0153.pdf&id=d575554ec59b09e7fde503d3a82787c7",
        "https://bsmedia.business-standard.com/_media/bs/data/announcements/bse/29012026/13c21166-8138-4630-a8b3-4f6b2202472e.pdf"
      ]
    },
    {
      "number": 4,
      "layout": "case-ledger",
      "title": "One fictional case makes three evidence states visible",
      "body": [
        "Meridian Horizon Fund I (Meridian Horizon Fund Management IFSC Pvt Ltd) · QE 30 Jun 2026 · fictional",
        "Closing NAV · SUPPORTED · USD 12.4M agrees across two sources",
        "Committed capital · CONFLICTING · USD 25M vs USD 24M",
        "Complaints closed · UNSUPPORTED · no candidate evidence"
      ],
      "sources": [
        "repo:data/synthetic-case.json",
        "repo:src/case-engine.js"
      ]
    },
    {
      "number": 5,
      "layout": "workflow",
      "title": "Preserve the handoff, not just the answer",
      "body": [
        "01 SOURCE · exact page, region or cell",
        "02 COMPARE · preserve agreement and disagreement",
        "03 ESCALATE · no default winner",
        "04 DECIDE · named reviewer and reason",
        "05 RETAIN · local JSON and printable HTML manifest"
      ],
      "sources": [
        "repo:docs/superpowers/specs/2026-08-12-attest-submission-system-design.md",
        "repo:src/case-engine.js",
        "repo:src/manifest.js"
      ]
    },
    {
      "number": 6,
      "layout": "agent-boundary",
      "title": "The prototype knows when to stop",
      "body": [
        "DETERMINISTIC TRACE",
        "PROPOSE · candidate evidence and exact references",
        "ABSTAIN · no candidate evidence; request more",
        "DECIDE · only a named human can accept, correct, reject or defer",
        "No live model. No compliance conclusion. Harness built and tested before any model enters."
      ],
      "sources": [
        "repo:prototype/app.js",
        "repo:artifacts/prototype-trace-1440.png",
        "repo:docs/superpowers/specs/2026-08-12-attest-submission-system-design.md"
      ]
    },
    {
      "number": 7,
      "layout": "prototype-proof",
      "title": "The current build exposes the full evidence record",
      "body": [
        "CURRENT LOCAL BUILD",
        "Conflict stays side by side.",
        "Human reason is required.",
        "Receipt retains fingerprints, both candidates and unresolved evidence.",
        "Synthetic data only · no filing · no regulator connection"
      ],
      "sources": [
        "repo:artifacts/prototype-conflict-1440.png",
        "repo:artifacts/prototype-receipt-1440.png",
        "repo:.superpowers/sdd/2026-08-12-attest-submission-system/task-5-report.md"
      ]
    },
    {
      "number": 8,
      "layout": "sensitivity",
      "title": "Revenue here is a sensitivity test, not a forecast",
      "body": [
        "ILLUSTRATIVE ARR SENSITIVITY",
        "₹3L · ₹12L",
        "5 · ₹15L · ₹60L",
        "50 · ₹1.5Cr · ₹6Cr",
        "Unproven gates: buyer, bundling risk, legal perimeter, paid test, support economics",
        "If the wedge locks: the same evidence substrate extends to adjacent regulated-reporting workflows (hypothesis)",
        "Not TAM/WTP."
      ],
      "sources": [
        "repo:docs/BUSINESS_VIABILITY.md",
        "repo:docs/superpowers/specs/2026-08-12-attest-submission-system-design.md"
      ]
    },
    {
      "number": 9,
      "layout": "ownership",
      "title": "One accountable founder. One defined finance lane.",
      "body": [
        "AYUSH TIWARY",
        "Engineering, integration, test evidence, packaging. KRISEVA ships evidence-first, human-review procurement software in Indian defense today.",
        "FINANCE & BUSINESS ANALYSIS LANE",
        "Case consistency, buyer hypotheses, pricing research, workflow QA.",
        "Proposed contributor · pending written acceptance and public attribution."
      ],
      "sources": [
        "repo:docs/CONTRIBUTOR_SCOPE.md",
        "repo:docs/superpowers/specs/2026-08-12-attest-submission-system-design.md"
      ]
    },
    {
      "number": 10,
      "layout": "programme-ask",
      "title": "Use eight weeks to lock the wedge, or reject it",
      "body": [
        "ACCESS · 2 FME (fund management entity) officers + 2 administrators + 1 independent compliance provider",
        "CHALLENGE · Is upstream evidence outside DRR/bundled services?",
        "TEST · One controlled synthetic workflow only if discovery survives",
        "DECIDE · Lock or reject by week 8",
        "Help us falsify quickly."
      ],
      "sources": [
        "https://www.giftifih.in/young-builders-program",
        "repo:docs/MEETING_BRIEF_2026-08-12.md",
        "repo:docs/PRODUCT_DECISION.md"
      ]
    }
  ]
}
```
<!-- CONTRACT:END -->

## Editable build runtime

`scripts/build-deck.mjs` is the editable source and uses
`@oai/artifact-tool` from a JavaScript ES module. It resolves the package from a
normal installation, `ATTEST_ARTIFACT_WORKSPACE`, `NODE_PATH`, or the ignored
`.tmp/artifact-tool-workspace` initialized by the presentation-skill setup helper.
No private cache or user path is committed. Run `npm run deck`, then
`npm run deck:render` to regenerate the PPTX, PDF, ten PNGs, montage, and receipts.
The rebuild contract is visual-semantic: ordered copy, source notes, named layout,
physical typography, and materially equivalent rendered slides. PPTX/PDF archive
bytes, package metadata, and internal object IDs are explicitly not promised stable.

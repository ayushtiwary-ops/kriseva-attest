# KRISEVA ATTEST release QA report

**Inspection date:** 12 August 2026  
**Scope:** local synthetic submission package  
**Release verdict: LOCAL RELEASE CANDIDATE**

No publication, deployment, form mutation, terms acceptance, or submission was performed by this release process.

## Automated contract

The release gate covers unit state and manifest behavior, browser interaction and accessibility, public claim/privacy scanning, deterministic capture states, deck build/render mechanics, video media properties, governed checksums, and repository cleanliness. Final integration counts on 12 August 2026: 75 unit tests passed, 77 browser tests passed, claim and privacy scan passed over 33 public files, dependency audit reported 0 vulnerabilities, and the video media contract verification passed.

## Visual inspection receipt

| Surface | Inspected artifact | Required check | Result |
|---|---|---|---|
| Wireframe desktop | `artifacts/wireframes-desktop.png` | Six named screens, task/action/error/mobile notes, no crop or overlap | Pass |
| Wireframe mobile | `artifacts/wireframes-mobile.png` | Single-column reading order, contained evidence rows, no horizontal overflow | Pass |
| Prototype dashboard mobile | `artifacts/prototype-dashboard-390.png` | Synthetic marker, protected default state, legible controls | Pass |
| Prototype dashboard desktop | `artifacts/prototype-dashboard-1440.png` | Case frame, evidence states, hierarchy, no clipping | Pass |
| Prototype conflict mobile | `artifacts/prototype-conflict-390.png` | Both candidates, no default winner, decision controls contained | Pass |
| Prototype conflict desktop | `artifacts/prototype-conflict-1440.png` | Side-by-side evidence, abstention boundary, form labels and values | Pass |
| Prototype receipt mobile | `artifacts/prototype-receipt-390.png` | Named reviewer, reason, timestamp, unresolved item, export controls | Pass |
| Prototype receipt desktop | `artifacts/prototype-receipt-1440.png` | Source fingerprints, both candidates, human decision, unresolved evidence | Pass |
| Pitch deck | `artifacts/deck/deck-montage.png` | Ten pages, source-led hierarchy, proof captures, no clipping or overlap | Pass after final deck re-review |
| Pitch-deck PDF | `deck/KRISEVA_ATTEST_GIFT_2026.pdf` | Ten full-page renders, readable type, no font substitution | Pass after final deck re-review |
| Demo opening | `video/KRISEVA_ATTEST_DEMO_90S.mp4` | Research-stage framing and no private browser chrome | Pass |
| Demo conflict | `video/KRISEVA_ATTEST_DEMO_90S.mp4` | Both values remain visible; no invented winner | Pass |
| Demo decision | `video/KRISEVA_ATTEST_DEMO_90S.mp4` | Named human and reason remain explicit | Pass |
| Demo closing | `video/KRISEVA_ATTEST_DEMO_90S.mp4` | Unresolved evidence and practitioner-testing ask remain visible | Pass |

## Media and export checks

- Wireframe release: desktop PNG, mobile PNG, and one-page PDF; same pinned-runtime hashes repeat.
- Prototype release: five governed states at 390, 768, and 1440 pixels; JSON and printable HTML downloads retain source fingerprints, competing candidates, human action, and unresolved evidence.
- Deck release: editable ten-slide PPTX, ten-page PDF, ten slide PNGs, source notes, and layout receipts. Visual and semantic consistency is the governed determinism boundary; container bytes may vary when the exporter writes metadata or relationship identifiers.
- Video release: seven-scene, 1920 × 1080, H.264 High/BT.709, AAC stereo, 30 fps, exactly 2,700 frames, 90.000000 seconds, -15.9 LUFS, -1.4 dBTP, a continuous low-level pink-noise bed under the narration so no silence window is ever detected, and scenes 4-5 are a genuine recorded Playwright interaction against the local prototype (not a screenshot sequence).

## Claim and privacy boundary

The governed public-release set is enumerated in `scripts/verify-claims.mjs`. The scanner normalizes common Unicode and entity evasions, examines raw markup and visible text, and checks prohibited maturity, regulator, traction, performance, identity, secret, path, email, phone, and date-of-birth patterns. Private founder handoff documents are separately classified in `ARTIFACT_INDEX.md` and must not be placed into a public repository export.

## Remaining human gates

- Organizer confirmation of stage semantics and one-link format.
- Founder reconciliation of applicant fields and proposed contributor status.
- Surface-specific contributor acceptance before any attribution.
- Curated public export, public clean-session link verification, and checksum refresh.
- Founder readback of the live form and terms.
- Founder-controlled submission.

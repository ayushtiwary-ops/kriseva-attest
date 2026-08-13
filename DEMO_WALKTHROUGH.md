<img src="assets/kriseva-logo.svg" alt="KRISEVA monogram" width="64">

# KRISEVA ATTEST demo walkthrough

RESEARCH-STAGE PROTOTYPE · SYNTHETIC DEMO DATA · NOT A REGULATORY FILING · NO REGULATOR CONNECTION

This walkthrough describes one guided pass through the interactive prototype, screen by screen, plus a short path for a time-poor reviewer. Everything in it, the fund, the people, the documents, is fictional and constructed for this demonstration. No real entity, filing, or individual is described anywhere in this repository.

## Who the persona is

**Priya Nair** is the fictional Compliance Officer at **Meridian Horizon Fund Management IFSC Pvt Ltd**, a fictional fund management entity. She is preparing the evidence behind the **Meridian Horizon Fund I** return for the **quarter ended 30 June 2026**. In the prototype she is the named reviewer: she inspects the source-to-field comparison, decides the one conflicting field with a stated reason, and dispositions every anomaly flag on the risk and anomaly board.

**Rohan Mehta** is the fictional Principal Officer. He completes the maker-checker step: he confirms the evidence record after Priya's review, and the prototype's code rejects a confirming officer whose name matches the deciding reviewer's, so his confirmation has to come from someone else.

Both names are fictional demo personas built for this repository. The prototype labels each of their name fields with a visible "(demo persona)" qualifier so no one mistakes them for real people, and the case itself, its four source documents, and its three governed fields are synthetic demo data, generated for this repository and not drawn from any real fund, administrator, or investor record.

## The 10-minute demo

The prototype has seven screens, in this fixed order. A step strip under the top navigation always names the current one.

### Step 1 of 7: Open the case (case dashboard)

**What she sees:** The case register: case ID `meridian-horizon-q2-2026`, fund name "Meridian Horizon Fund I", entity name "Meridian Horizon Fund Management IFSC Pvt Ltd", and "Quarter ended 30 June 2026". All three governed fields, Closing NAV, Committed capital, and Investor complaints closed, show PENDING. A single "Run evidence review" action is available; nothing else is.

**What she does:** She reads the case register and clicks "Run evidence review".

**Why it matters:** The case, its four sources, and its three governed fields are fixed before any comparison runs. Nothing about scope can be redefined mid-review, which is the first thing an auditor checks.

### Step 2 of 7: Inspect the evidence (source-to-field workspace)

**What she sees:** The field index now reads Closing NAV SUPPORTED, Committed capital CONFLICTING, Investor complaints closed UNSUPPORTED. The workspace opens on Committed capital: two candidate cards side by side, Candidate A (Administrator statement, "USD 25,000,000", page 2, row Committed capital) and Candidate B (Subscription register extract, "USD 24,000,000", Schedule A, cell C11), each carrying its exact reference and its source fingerprint.

**What she does:** She compares both candidate cards, the exact page/cell references, and both fingerprints, then follows "Send disagreement to conflict queue".

**Why it matters:** Every candidate value is tied to an exact document location and a fingerprint before any human acts on it. A decision made from this screen is grounded in something inspectable, not a summary she has to take on faith.

### Step 3 of 7: Decide the conflict (conflict queue)

**What she sees:** "Two sources disagree", the same two candidate cards, and the decision form: an action choice (Accept selected source / Correct with selected source / Reject proposed field / Defer pending evidence), a source selector, a field labeled "Reviewer, Compliance Officer (demo persona)", and a reason field. No action, source, or name is pre-selected.

**What she does:** She checks "Accept selected source", selects the Administrator statement candidate ("USD 25,000,000"), types "Priya Nair" as reviewer, and enters the reconciliation reason: "Administrator figure ties to the executed subscription register; earlier schedule superseded." Then she clicks "Record human decision".

**Why it matters:** The prototype proposes no default winner. The conflict stays visible before and after the decision, and it only clears once a named human states a reason. That is the accountability boundary the product is built around.

### Step 4 of 7: Read the trace (agent trace)

**What she sees:** A seven-step deterministic trace: intake, compare, propose, an explicit ABSTAIN on Investor complaints closed, a deterministic SCAN, four raised anomaly FLAGs, and AWAIT. Below it, a separate "Recorded live run" panel: the model id, the run timestamp, an instruction fingerprint, an envelope digest, a replay-verification line, per-field candidates and abstentions, and ten deterministic validator outcomes.

**What she does:** She reads the deterministic trace, then the recorded live run panel, and checks that the replay-verification line confirms the on-screen digest matches the committed record.

**Why it matters:** The deterministic trace and the recorded live model run are visually and textually separated, so nobody can mistake one for the other. See "Where the AI is" below for the exact boundary this panel states.

### Step 5 of 7: Disposition the flags (risk and anomaly board)

**What she sees:** Six risk indicator cards (evidence coverage 2/3, conflict rate 1/3, abstention count 1, decision override direction, maker-checker separation status, open anomaly count) and four anomaly flag cards, each with a severity, a lens, an exact reference, and its own disposition form:

| Flag | Severity | Lens |
|---|---|---|
| No evidence coverage | HIGH | COMPLIANCE |
| Duplicate document fingerprint | HIGH | FRAUD ANALYSIS |
| Conflict resolved toward higher value | MEDIUM | FRAUD ANALYSIS |
| Stale source | LOW | RISK |

**What she does:** On "Duplicate document fingerprint" (the internal ledger extract and the NAV custodian confirmation carry the identical fingerprint `synthetic:ledger:38a4c1`), she selects "Escalate for investigation" and records a reason, for example: "Two independently sourced documents should not share one fingerprint; needs a source-control check before this cycle closes." On the remaining three flags she selects "Acknowledge with reason" and records a specific reason for each, for example:

- No evidence coverage: "Investor complaints closed is an open evidence request; following up with the compliance calendar owner directly."
- Conflict resolved toward higher value: "Administrator statement is the operative source of record this quarter; full reasoning is on the conflict decision."
- Stale source: "Subscription register predates the quarter by 49 days; the next register refresh is already scheduled."

**Why it matters:** A flag stays open, visible, and unresolved until a named human closes it with a reason. A fraud-relevant signal like a duplicate fingerprint cannot be silently cleared; escalating it (instead of acknowledging it) is a deliberate, attributed choice, and the board carries the record of that choice.

### Step 6 of 7: Confirm sign-off (review and sign-off)

**What she sees:** Three gates, the conflict-decision gate, the anomaly-flag-disposition gate, and the officer-confirmation gate, each visibly cleared or blocked; a decision ledger listing the state of all three fields; and the sign-off form (a field labeled "Principal Officer (demo persona)" and a confirmation checkbox), disabled until both prior gates clear.

**What she does:** Priya hands the case to Rohan. With both gates cleared, Rohan opens this screen, types "Rohan Mehta" in the Principal Officer field, checks "I confirm the evidence record for all three fields has been reviewed", and clicks "Confirm sign-off".

**Why it matters:** Maker-checker separation is enforced in code, not just in copy: the confirming officer's name is checked against the deciding reviewer's name and the confirmation is rejected on a match. One person cannot both propose and confirm the same record.

### Step 7 of 7: Export the receipt (evidence receipt)

**What she sees:** A receipt header with a risk summary ("4 anomaly flags · 0 open · 4 dispositioned"), every source fingerprint, the manifest's own content fingerprint, both preserved committed-capital candidates, the deciding reviewer's record, the confirming Principal Officer's record, the still-open "Investor complaints closed" item, and two export buttons, now enabled.

**What she does:** She downloads the JSON evidence manifest and the printable HTML evidence manifest.

**Why it matters:** Both exports carry the same content fingerprint shown on screen, both named actors, and the field that is still unresolved. What leaves the browser is exactly what was reviewed, not a cleaned-up summary of it.

## The 90-second short path

For a reviewer with limited time, five stops carry the whole argument:

1. **Dashboard.** One fixed synthetic case, three governed fields, all PENDING.
2. **Run review.** One click turns PENDING into one supported, one conflicting, one unsupported field, deterministically.
3. **Conflict decision.** Two candidate values, no default winner, a named reviewer and a reason required to proceed.
4. **Risk board, at a glance.** Four anomaly flags with severity, lens, and an exact reference each, still open until a named human dispositions them.
5. **Receipt.** Both named actors, the unresolved field, and a content fingerprint, exportable only after sign-off.

## What she walks away with

The JSON and printable HTML evidence manifests both carry: every source fingerprint; both committed-capital candidates, not just the accepted one; Priya Nair's decision, action, and reason; the anomaly-flag dispositions, including the escalation; Rohan Mehta's Principal Officer confirmation; the still-open Investor complaints closed item; and a manifest content fingerprint, so any later change to the record is detectable. The printable HTML manifest and the on-screen receipt show the same first 16 characters of that fingerprint.

## Where the AI is

The deterministic seven-step trace on the agent trace screen is prototype logic: fixed rules over a fixed synthetic case, no model call. Directly beneath it, a separate "Recorded live run" panel discloses an actual, timestamped call to a real model (its reported id and canonical model name are shown on screen). The panel's own replay button re-derives the envelope's digest in the browser without calling the model again, to show the on-disk record has not been altered since it was recorded.

The boundary is stated on that panel itself: this is a recorded run, replay is deterministic, the model proposed candidate values and abstained where evidence was absent, and named humans, Priya and then Rohan, decided. Nothing on the agent trace screen, deterministic or recorded, writes a value into the record on its own. A value only enters the evidence manifest once a named human accepts, corrects, rejects, or defers it.

## Reset instructions

A "Reset demo" control is available in the header at all times, and again in the review panel once the receipt is reached. Either one reloads the fixed synthetic case, discards every decision, disposition, and sign-off made in the current browser session, returns all three fields to PENDING, and returns to the case dashboard. Nothing is written outside the browser tab, so closing the tab has the same effect.

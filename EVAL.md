# KRISEVA ATTEST evaluation harness

SYNTHETIC DEMO DATA · RESEARCH-STAGE PROTOTYPE. This is a measurement of a controlled, synthetic evaluation set, not a production accuracy claim. Every document, fund name, and figure below is fabricated for this evaluation and does not describe a real fund, administrator, or investor.

## Dataset

- Instances: 60 labeled (field, document) pairs across the three governed fields (Closing NAV, Committed capital, Investor complaints closed).
- Variant types per field: clean (varied currency/count formatting), decoy (target value present alongside distractor numbers), missing (field genuinely absent from the document; correct behavior is abstention), conflict (paired documents that deliberately disagree), and format-edge (uncommon but still explicit phrasing).
- Documents: `data/source-documents/eval/*.txt`, generated deterministically by `scripts/run-eval.mjs`. Labels: `data/eval-set.json`.
- Model: `claude-haiku-4-5-20251001` (reported canonical model: `claude-haiku-4-5`), effort `low`.
- Run date: 2026-08-13.
- Total model calls this run: 60 (one call per labeled instance, the same extraction prompt as `scripts/live-extract.mjs`).
- Errored calls (excluded from precision/recall, reported separately): 0.
- Calls that needed at least one retry: 0.

## Metric definitions

This harness never reports a single undifferentiated "accuracy" figure. All rates are decimals (0 to 1), not percentages.

- **Precision** = correct extractions / all extractions the model attempted (found=true). A found value with the wrong normalized value counts against precision.
- **Recall** = correct extractions / all instances where a value was truly present. A found-but-wrong value also counts against recall (it did not successfully recall the true value), alongside missed (abstained) instances.
- **F1** = harmonic mean of precision and recall.
- **Coverage** = fraction of truly-present-value instances where the model attempted an extraction at all (found=true), regardless of correctness. Coverage can exceed the correctness rate when the model attempts an answer but gets the value wrong.
- **Abstention rate** = fraction of instances (of any expected outcome) where the model reported `found=false`.
- **Evidence-localization success rate** = among correct extractions (TP), the fraction whose reported line location exactly matched the labeled location.
- **Human-review-remaining rate** = fraction of instances that were not a clean, correct, automatic proposal (abstentions, wrong values, and hallucinated values all still require human review under the PROPOSE/ABSTAIN boundary). Equal to `1 - (TP / total)`.
- **Conflict-detection recall** = fraction of planted conflict pairs where the model correctly and independently extracted the correct (and therefore differing) value from both member documents. A wrong or missed extraction on either member counts the pair as not detected.

## Results by field

| Field | N | Precision | Recall | F1 | Coverage | Abstention rate | Evidence-localization | Human-review-remaining |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Closing NAV | 20 | 1.00 | 1.00 | 1.00 | 1.00 | 0.20 | 1.00 | 0.20 |
| Committed capital | 20 | 1.00 | 1.00 | 1.00 | 1.00 | 0.20 | 1.00 | 0.20 |
| Investor complaints closed | 20 | 1.00 | 1.00 | 1.00 | 1.00 | 0.30 | 1.00 | 0.30 |
| **All fields (micro-average)** | 60 | 1.00 | 1.00 | 1.00 | 1.00 | 0.23 | 1.00 | 0.23 |

## Conflict-detection recall

Conflict-detection recall: 1.00 (5 of 5 planted conflict pairs correctly and independently extracted on both sides).

| Conflict group | Members | Detected |
|---|---:|---|
| cg-closing-nav-01 | 2 | yes |
| cg-closing-nav-02 | 2 | yes |
| cg-committed-capital-01 | 2 | yes |
| cg-committed-capital-02 | 2 | yes |
| cg-investor-complaints-closed-01 | 2 | yes |

## Caveats

- This is a synthetic, controlled test set authored for this evaluation. It is not a production accuracy claim, not a benchmark against real regulatory filings, and not a claim about performance on documents unlike these.
- All instances use a single model (`claude-haiku-4-5-20251001`) at a single effort setting. No comparison across models or settings is made here.
- Every instance targets exactly one field in one short document; the harness does not evaluate multi-field or long-document extraction.
- Full per-instance model output is recorded in `data/eval-results.json` for independent re-scoring.

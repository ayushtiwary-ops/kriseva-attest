# Public claims register

This register governs the submission hub, repository front door, and prototype copy. A public statement must stay within the wording and evidence class below.

## Allowed factual descriptions

| Topic | Allowed wording | Evidence |
|---|---|---|
| Stage | Research-stage prototype | Repository design lock and local implementation |
| Data | Synthetic demo data; one fictional entity and three fictional sources | `data/synthetic-case.json` |
| Review states | One supported, one conflicting, and one unsupported field | Case-engine tests and browser tests |
| Trace | Recorded deterministic prototype trace; no live model call | Prototype UI and browser tests |
| Human boundary | A named reviewer records a reason for a material decision | Case engine and prototype acceptance tests |
| Export | Local JSON and printable HTML evidence manifests | Manifest and browser-download tests |
| Hub | JS-free local artifact index with active prototype, wireframes, and technical notes | `index.html` and hub browser tests |

## Required visible boundaries

- Not a regulatory filing.
- Not connected to IFSCA systems.
- The prototype does not interpret regulation or determine compliance.
- The demonstration uses no real regulated data.
- The deterministic demonstration makes no live model call.
- The prototype has no customers, pilots, deployment, regulatory approval, or production-readiness claim.

## Prohibited claim classes

- Market traction, buyer validation, revenue, adoption, or willingness to pay.
- Accuracy, time saving, return on investment, or error-reduction figures.
- Operational maturity, regulated deployment, enterprise authorization, or absolute security.
- Regulator relationship, integration, endorsement, admission, approval, or filing authority.
- Legal or regulatory interpretation and compliance determinations.
- Permanent, unchangeable, or externally verified evidence assurances.
- Public team roles without a current written role and publication record.
- Undefined alternative product names.

## Publication controls

Repository publication, hosted deployment, application mutation, terms acceptance, and submission remain founder approval gates. Pending controls stay non-links until a real artifact and verified destination exist.

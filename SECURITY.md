# Security boundary

This repository contains a static synthetic demonstration, not a production security architecture.

## Demonstrated controls

- Only repository-owned synthetic fixture data is loaded.
- The hub uses no JavaScript, analytics, trackers, remote fonts, or third-party assets.
- Browser acceptance tests reject unexpected remote requests and failed local resources.
- Export files are local, bounded to the synthetic case, and contain no script or remote resource.
- Source fingerprints are identifiers in a fictional fixture; they are not a claim of immutable storage or independent verification.

## Not established

The repository does not establish production authorization, tenant isolation, key management, deployment hardening, enterprise access control, non-repudiation, incident response, or regulated-data handling. No independent security assessment has been performed.

Do not load customer, confidential, regulated, bank, KYC, or personal records into this demonstration. A real evaluation would require a separately reviewed architecture, threat model, data agreement, access model, retention policy, and deployment receipt.

Report security findings through the repository's private owner-controlled review process. No public contact route is asserted here.

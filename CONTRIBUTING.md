# Contributing

Contributions must preserve the prototype's evidence and human-decision boundaries.

## Before proposing a change

1. Use synthetic or public evidence only.
2. Add a failing test for behavior changes and observe the intended failure.
3. Keep source candidates visible when they disagree.
4. Keep unsupported fields unresolved instead of synthesizing values.
5. Preserve the named-reviewer and reason requirement for material decisions.
6. Add no remote font, tracker, analytics call, third-party embed, guessed URL, private path, personal data, credential, or secret.

## Required checks

```bash
npm test
npm run verify:claims
npm audit --audit-level=low
git diff --check
```

Do not deploy, publish, push, upload artifacts, mutate an application form, accept terms, or submit on another person's behalf. External actions require separate founder approval.

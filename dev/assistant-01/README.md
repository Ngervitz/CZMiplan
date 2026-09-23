# ASSISTANT-01 — System Prompt + Test Harness v1

DEV-only. Does not implement product UX. Does not change production code.

```bash
node dev/assistant-01/harness.js
node dev/assistant-01/harness.js --live   # requires CZ_CLAUDE_API_KEY or ANTHROPIC_API_KEY
```

Baseline is write-once: `baseline-v1/results.json` is not overwritten.

Unrelated: do not include `dev/narrative-05-qa.js`.

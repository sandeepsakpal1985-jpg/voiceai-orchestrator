# AI provider setup

Automated tests use `TestAiProvider`. CI must not require a live LLM key.

## Environment

```
AI_ENABLED=false
AI_PROVIDER=none
AI_API_KEY=
AI_MODEL=gpt-4o-mini
AI_MAX_OUTPUT_TOKENS=400
AI_MAX_INPUT_CHARS=8000
```

| Value | When |
|-------|------|
| `AI_ENABLED=false` | Default development, test, and production until you deliberately turn AI on |
| `AI_PROVIDER=test` | Local/CI only. Forbidden in production |
| `AI_PROVIDER=openai` | Optional live Chat Completions via HTTPS `fetch`. Requires `AI_API_KEY` |

Production fails fast if `AI_ENABLED=true` with `test`/`none` or a missing key. Production boots with AI off and no key.

Never put provider keys in the repository, `/health`, audit metadata, or the browser.

## Local with the test provider

```
AI_ENABLED=true
AI_PROVIDER=test
```

Restart the API if Playwright `reuseExistingServer` is true; otherwise the webServer env flags are ignored.

## Optional live OpenAI check (manual)

1. Set `AI_ENABLED=true`, `AI_PROVIDER=openai`, `AI_API_KEY` from the provider dashboard.
2. Log in as `parent@example.test`.
3. Open Aarav Student 360 and ask “How is my child doing?”
4. Confirm the answer uses Student 360 facts and that citations match the panel (attendance, latest test, pending assignments).
5. Confirm a sibling switch to Diya does not reuse Aarav’s numbers.

Do not mark this procedure VALIDATED unless those steps actually ran against a live key. Status when keys are absent: **BLOCKED — EXTERNAL PROVIDER**.

This document does not claim that OpenAI (or any vendor) retains or deletes prompts. Retention is defined by the provider agreement you sign, not by KluCoach code.

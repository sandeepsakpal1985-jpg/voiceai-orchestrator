# Git Security Cleanup — Push Protection Recovery

**Date:** 2026-09-12  
**Branch:** `master`  
**Remote:** `origin` → `https://github.com/sandeepsakpal1985-jpg/voiceai-orchestrator.git`

## Incident summary

GitHub push protection rejected `master` because secret material exists in **local-only unpushed history** (not in commit `804acb6`).

| Item | Value |
|------|-------|
| Blocked push target | `origin/master` |
| Unpushed commit count | **72** (between `origin/master` @ `d0893a2` and pre-cleanup `HEAD`) |
| New safe commit (Hostinger pack) | `804acb6` — 12 deployment files, no `.env` |
| Primary offending commit | `edf4a346` |
| Secondary `.env` introduction | `be05441` (file added earlier in history) |

## Offending paths (metadata only)

| Path | Secret types reported by GitHub | Action |
|------|----------------------------------|--------|
| `.env` (repo root, tracked) | OpenAI API key, Twilio Account SID, Resend API key | Remove from **all reachable history**; never commit |
| `scripts/test_resend_email.py` | Resend API key hard-coded as `os.getenv` default | Rewrite to env-only; redact historical literals |

**No secret values are recorded in this document.**

## Credential rotation (owner action required)

| Provider | Status |
|----------|--------|
| OpenAI | **MUST ROTATE / REVOKE** |
| Twilio | **MUST ROTATE / REVOKE** |
| Resend | **MUST ROTATE / REVOKE** |

New credentials belong only in local `.env` or an approved secrets manager — never in Git.

## Proposed cleanup strategy

1. **Backup:** create `backup/pre-secret-cleanup` pointing at pre-rewrite `HEAD`.
2. **History rewrite (local only):** `git filter-repo --force`:
   - `--path .env --invert-paths` (purge tracked `.env` from all commits)
   - `--replace-text` (redact hard-coded Resend default in `scripts/test_resend_email.py` history)
3. **Working tree fixes:** hardened `.gitignore`; `test_resend_email.py` requires `RESEND_API_KEY` env var.
4. **Verify:** scan reachable history for `.env` path and known key patterns (no values printed).
5. **Tests:** run project test suite on cleaned tree.
6. **Push:** stop and wait for explicit approval; use `git push --force-with-lease origin master` only after verification.

## Intentionally preserved

- KluCaller Hostinger deploy pack (`804acb6` content — may receive new hash after rewrite)
- `.env.example` templates with placeholders (`replace_me`, etc.)
- Untracked `ai-sales-agent/klucaller-v2/` source (not bulk-added)

## Explicit non-actions

- Do **not** use GitHub unblock URLs
- Do **not** bypass push protection
- Do **not** `git reset --hard` / destroy local work
- Do **not** push without post-cleanup verification and owner approval

---

## Post-cleanup verification (2026-09-12)

| Check | Result |
|-------|--------|
| Backup branch | `backup/pre-secret-cleanup` @ pre-rewrite `804acb6` |
| Cleaned HEAD | `2bcbc52` → security follow-up commit pending |
| `.env` in `master` history | **Removed** (`git log master -- .env` empty) |
| `.env` tracked at HEAD | **No** |
| Original Resend literal in `master` | **Not found** (`re_imKo*` grep empty) |
| `scripts/test_resend_email.py` at HEAD (working tree) | Requires `RESEND_API_KEY` env var — no hard-coded default |
| Historical `test_resend_email.py` in rewritten commits | Literal replaced with `[REDACTED]` placeholder in `89e50fb`; superseded by env-only fix |
| Unpushed commits (`origin/master..HEAD`) | **87** (rewritten hashes) |
| Hostinger deploy pack | **Preserved** — 12 files @ `2bcbc52` |
| KluCaller pytest (`klucaller-v2/tests`) | **62 passed** |
| `.gitignore` | Updated: `.env`, `.env.*`, `!.env.example`, `backend/.venv/` |

### Worktree credential scan (tracked `master`, metadata only)

| File | Line | Type |
|------|------|------|
| `scripts/test_resend_email.py` | 11 (historical commit only) | Resend placeholder `[REDACTED]` — not a live credential |
| `socialpilot/SECURITY_AUDIT.md` | (multiple) | Documentation examples — review separately |

### Push status

**NOT PUSHED.** Awaiting explicit owner approval.

```bash
git push --force-with-lease origin master
```

**Owner must rotate:** OpenAI, Twilio, Resend credentials that were exposed in the pre-cleanup `backup/pre-secret-cleanup` branch / old history.

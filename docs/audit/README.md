# Audit — Pouch

Security and quality audits for the Pouch project.

> **For the next session / agent: start here.**

## Latest audit

### [2026-07-25 Security Audit](./2026-07-25-security-audit.md)
Complete audit performed before the **Jul 30 deadline**. Found 6 CRITICAL, 10 HIGH, 13 MEDIUM, and ~15 LOW/INFO issues. All CRITICAL findings manually verified against source.

**Start with:**
1. [`2026-07-25-security-audit.md`](./2026-07-25-security-audit.md) — full findings with file:line refs and fixes.
2. [`FOLLOW-UP-ACTION-PLAN.md`](./FOLLOW-UP-ACTION-PLAN.md) — prioritized execution table with status checkboxes. Update it as fixes land.

## TL;DR of the 6 CRITICAL issues

| ID | One-liner |
|----|-----------|
| C1 | Bitrefill webhook has **no signature verification** — unauthenticated, anyone can forge events. |
| C2 | Demo-mode auth bypass — `DEMO_MODE=true` (or any boot error) opens **all** endpoints unauthenticated. |
| C3 | `POST /auth/demo` issues a real 24h JWT in **every** environment. |
| C4 | `/agent/chat` + `/balance` + `/orders` trust `userId` from body/query (**IDOR**). |
| C5 | Hardcoded wallet addresses bypass the funds whitelist (escape hatch). |
| C6 | Real send/swap failures fabricate a fake "delivered" receipt for **any** user. |

## What's already good (don't touch)

- Hexagonal architecture, `Result<T,E>` + `DomainError` typing.
- `.env` correctly gitignored (verified not committed).
- SQL parameterized (Drizzle), JWT pinned to HS256, no `dangerouslySetInnerHTML`.
- Every LLM path has a deterministic regex fallback.
- `typecheck` passes clean on the domain package.

## Workflow for fixes

```bash
git switch -c audit-fixes
# work top-to-bottom in FOLLOW-UP-ACTION-PLAN.md
pnpm typecheck && pnpm test
# commit per-fix: fix(security): C1 — webhook HMAC verification
```

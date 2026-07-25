# Audit — Pouch

Security and quality audits for the Pouch project.

> **For the next session / agent: start here.**

## ➡️ Read [`SESSION-HANDOFF.md`](./SESSION-HANDOFF.md) first

It has the exact repo state, what's done (C1–C6 shipped, merged, pushed),
what's open (demo flow under production, Workstream B/C priority), and the
findings discovered during implementation that aren't in the original audit.

## Status at a glance

- ✅ **Workstream A (6 CRITICAL): DONE** — merged to `main`, pushed to `origin/main`.
- ⏭️ **Workstream B (10 HIGH): not started.** Demo-relevant first (H2, H6, H3).
- ⏭️ **Workstream C (13 MEDIUM + LOWs): not started.**

## The documents

| Doc | What it's for |
|-----|---------------|
| [`SESSION-HANDOFF.md`](./SESSION-HANDOFF.md) | **Start here.** Current state + open decisions + how to resume. |
| [`2026-07-25-security-audit.md`](./2026-07-25-security-audit.md) | Full audit (CRITICAL + HIGH + MEDIUM + LOW with file:line refs). |
| [`FOLLOW-UP-ACTION-PLAN.md`](./FOLLOW-UP-ACTION-PLAN.md) | Execution table with `[x]`/`[ ]` status. C1–C6 marked done. |

## TL;DR of the 6 CRITICAL issues (all fixed)

| ID | One-liner | Status |
|----|-----------|--------|
| C1 | Bitrefill webhook has **no signature verification** — unauthenticated, anyone can forge events. | ✅ |
| C2 | Demo-mode auth bypass — `DEMO_MODE=true` (or any boot error) opens **all** endpoints unauthenticated. | ✅ |
| C3 | `POST /auth/demo` issues a real 24h JWT in **every** environment. | ✅ |
| C4 | `/agent/chat` + `/balance` + `/orders` trust `userId` from body/query (**IDOR**). | ✅ |
| C5 | Hardcoded wallet addresses bypass the funds whitelist (escape hatch). | ✅ |
| C6 | Real send/swap failures fabricate a fake "delivered" receipt for **any** user. | ✅ |

## What's already good (don't touch)

- Hexagonal architecture, `Result<T,E>` + `DomainError` typing.
- `.env` correctly gitignored (verified not committed).
- SQL parameterized (Drizzle), JWT pinned to HS256, no `dangerouslySetInnerHTML`.
- Every LLM path has a deterministic regex fallback.
- `typecheck` passes clean on all packages.

## Verification commands

```bash
pnpm typecheck   # 8/8 expected
pnpm test        # 8/8 expected (api=49 tests, web=12)
```

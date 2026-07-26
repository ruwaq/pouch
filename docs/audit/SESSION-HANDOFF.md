# Session Handoff — Audit Fixes + Demo Plan (2026-07-26, sesión 2)

> **For the next session: read this first.** Status snapshot at the end of the
> 2026-07-26 second session. The user wants to ship a live real-money demo by
> **Jul 30**, risk-controlled (judges are non-malicious). This is the single
> source of truth.

---

## TL;DR — dónde estamos parados

- ✅ **PASO 0** (secrets del repo público) — cerrado y re-verificado.
- ✅ **Item #1 — Re-enable demo fallback** — DONE, en producción. Judges sin login entran (HTTP 200).
- ✅ **Bug fix: Try Demo button** — `/auth/demo` route now mounted in production when `DEMO_FALLBACK_ENABLED=true` (antes solo en dev). Commit `019300b`, deployado.
- 🟡 **Item #2 — Gemini 3.6 Flash chat upgrade** — **EN PROGRESO, 5/9 tareas hechas**. Faltan T6-T9. T1-T5 pusheados a origin/main.
- ⏭️ **Re-priorización confirmada:** como los jueces NO son maliciosos, dejamos la seguridad de fondos al gate C5 existente y **priorizamos funcionalidad**.

**Estado de git:** `main` = `origin/main`, todo pusheado.

---

## 🟢 PRIMER PASO de la próxima sesión — continuar Item #2 (T6-T9)

Todo está pusheado y deployado. Arrancar con **T6 (/health unification)** usando subagent-driven development.

### Commits recientes en origin/main

| Commit | Qué |
|--------|-----|
| `019300b` | **fix: mount /auth/demo in prod when DEMO_FALLBACK_ENABLED=true** |
| `fbc3cde` | handoff update |
| `506a982` | T5 multi-turn contents |
| `6838f47` | T4 AbortController 15s timeout (L6) |
| `57dffd6` | T3 generationConfig thinking-ready |
| `fd75138` | T2 review M1 (all-thoughts test) |
| `145691a` | T2 skip thought:true parts |
| `5bdf18a` | T1 fix honest JSDoc + resolveLlmModel tests |
| `b024c47` | T1 DEFAULT_LLM_MODEL=gemini-3.6-flash |
| `bcb5dd3` | plan del upgrade (9 tareas) |
| `fb03477` | spec del upgrade |
| `08ce163` | DEMO_FALLBACK_ENABLED |

---

## 🟡 Item #2 — Gemini 3.6 Chat Upgrade (EN PROGRESO, 5/9 tareas)

### Documentos de referencia
- **Spec:** `docs/superpowers/specs/2026-07-26-gemini-3.6-chat-upgrade-design.md`
- **Plan (9 tareas bite-sized, TDD):** `docs/superpowers/plans/2026-07-26-gemini-3.6-chat-upgrade.md`
- **Metodología:** subagent-driven development (implementer + spec review + quality review por tarea).

### Tareas HECHAS y aprobadas (commits arriba)

| # | Tarea | Commit | Verificación |
|---|-------|--------|--------------|
| T1 | `DEFAULT_LLM_MODEL='gemini-3.6-flash'` + `resolveLlmModel()` helper exportado en `packages/infra-ai/src/factory.ts` | `b024c47` + `5bdf18a` | tests unitarios en factory.test.ts |
| T2 | Parser skip `thought:true` parts en `gemini-provider.ts` (helper `firstVisiblePart`) — el bug de los 241 tokens ocultos de 3.6 | `145691a` + `fd75138` | 4 tests nuevos en gemini-provider.test.ts |
| T3 | `GENERATION_CONFIG {maxOutputTokens:2048, temp:0.7, topP:0.95}` en ambos métodos | `57dffd6` | test asserta el body del fetch |
| T4 | `AbortController` 15s timeout (cierra audit L6) + **AbortError non-retryable** | `6838f47` | test con fetch colgado, aborta a los 15s |
| T5 | Multi-turn `contents` real (cambia port `LlmTextRequest` + `ConversationTurn`; `buildContents` helper; reply strategy mapea `agent→model`) | `506a982` | 2 tests nuevos, typecheck 8/8 repo |

**Baseline actual:** `pnpm typecheck` 8/8 ✅ · `pnpm --filter @pouch/infra-ai test` 48/48 ✅ (era 40 antes del item). **No rompe ningún consumer** (`@pouch/api`, `@pouch/web` typecheck verde).

### Tareas PENDIENTES (T6-T9) — instrucciones ya en el plan

| # | Tarea | Archivos |
|---|-------|----------|
| **T6** | `/health` usa el shared model source (hoy hardcodea `gemini-3.5-flash` en `apps/api/src/app.ts:112`, ignora `LLM_MODEL`). Importar `resolveLlmModel` de `@pouch/infra-ai`, usarlo en la URL del probe. + test nuevo en `apps/api/src/app.test.ts`. | `apps/api/src/app.ts`, `apps/api/src/app.test.ts` |
| **T7** | Silenciar logs `[demo] LLM config...` y `[demo] replyStrategy...` detrás de `DEBUG_LLM` en `apps/api/src/bootstrap/create-demo-agent-service.ts` (~líneas 145, 153). | `create-demo-agent-service.ts` |
| **T8** | `.env:84` y `.env.example` → `LLM_MODEL=gemini-3.6-flash` (con comentario explicando el thinking model). **`.env` NO se commitea** (gitignored), solo `.env.example`. | `.env`, `.env.example` |
| **T9** | `pnpm typecheck && pnpm build && pnpm test` (full repo) → subir `LLM_MODEL=gemini-3.6-flash` a Vercel Production (**¡usar `printf` no `echo`!** ver lección abajo) → `vercel --prod --yes` → smoke: `/api/agent/chat` debe dar reply en español, no truncado, sin thoughts leak. + actualizar este handoff + push. | — |

**Lección aprendida esta sesión (¡importante!):** al crear env vars en Vercel con `echo "true" | vercel env add ...`, el valor queda con `\n` al final y la comparación `=== 'true'` falla silenciosamente. **Usar `printf 'valor'` (sin newline)** y verificar con `od -c` antes de deployar. Ya pasó con `DEMO_FALLBACK_ENABLED`.

### Follow-up pendiente (no bloqueante, capturado por reviewer)
- **Medium — double-send de history:** en T5, la historia se envía dos veces (inlined text en `buildPrompt` + structured `contents`). El spec lo permitió como transitional. Si el smoke de T9 muestra problemas de calidad, este es el primer lever — quitar el `historyBlock` inlined de `llm-reply-strategy.ts:50-52` y los `${historyBlock}` en cada caso del switch.
- **Minor — temperature compartida (T3):** 0.7 para tool-routing y text-gen. Si el intent parsing falla en smoke, bajar temp solo para `generateWithTools`.
- **Minor — body-read timeout (T4):** el AbortController cubre el fetch pero no `res.json()`. Gap chico para JSON corto.

---

## ✅ Item #1 — Re-enable demo fallback (DONE, en producción)

Commit `08ce163` (este sí está pusheado). Env var `DEMO_FALLBACK_ENABLED=true` en Vercel Production.

- Producción **sin** flag → sigue 401 (C2 intacto, default seguro).
- Producción **con** `DEMO_FALLBACK_ENABLED=true` → judges sin cookie entran como `demo-user`. El gate C5 sigue bloqueando envíos externos.
- Cookie inválida/tampered → cae a `demo-user` (no 401), para que un cookie vencido nunca bloquee a un juez.
- **Smoke verificado en producción esta sesión:** `/api/balance` sin cookie → 200 + `demo-user` + $13.87. `/api/agent/chat` sin cookie → 200 + Gemini respondió end-to-end.

---

## ✅ PASO 0 — re-verificado esta sesión

`gemini-3.5-flash` (viejo) ya NO está en uso para el chat (migrado a 3.6 en este item, parcialmente). Los secrets rotados siguen firmes: JWT forjado con placeholder viejo → **401**; con secreto actual → **200** + balance real.

**Cookie name correction (bug de mi primer smoke, no de la app):** el cookie es `pouch_session` (**underscore**), no `pouch-session`. El endpoint `/api/balance` es **GET**, no POST. El JWT payload solo necesita `sub` (+ opcional `evmAddress`).

---

## Demo decisions (LOCKED — user confirmed)

El usuario quiere **demo en vivo con dinero REAL**, pero los jueces **no son maliciosos**. Esto cambió las prioridades esta sesión: **funcionalidad primero, seguridad de fondos al mínimo necesario** (el gate C5 ya existe).

| Decision | Value |
|----------|-------|
| Deploy | `https://pouch-orpin.vercel.app` (producción). Sin staging. |
| Access control | **Sin Magic login.** URL compartida privadamente con jueces. Demo fallback habilitado via `DEMO_FALLBACK_ENABLED=true`. |
| Money | **Assets reales del wallet principal** (el de los fondos). |
| Fund safety | **Gate C5 existente** (`private-key-provider.ts:392`) bloquea cualquier envío fuera de nuestras wallets derivadas. No se construye whitelist nueva — los jueces no son adversarios. |
| Balance | Debe actualizar **en tiempo real** (hoy no lo hace — ver item #4). |
| Bitrefill | **DEMO mode only.** Label "DEMO" claro. Sin compras reales. |
| LLM | **Gemini 3.6 Flash** (verificado funciona con la key actual, ~0.95s, pero es thinking model). |
| Wallet visibility | Siempre mostrar la on-chain address + link al explorer (feature de la sesión anterior, DONE). |
| Chat quality | **"Mejora exponencial"** — item #2 en curso. + **modo educativo** (item #3): el asistente explica cómo funciona el sistema mientras opera. |

---

## Build queue (prioridad funcional, no la original de seguridad)

### 🔴 En progreso / siguientes
1. **Item #2 — Gemini 3.6 chat upgrade** → **terminar T6-T9** (ver arriba).
2. **Item #3 — Sistema-guía (modo educativo):** brainstorm + spec + plan + TDD. El system prompt (`packages/infra-ai/src/system-prompt.ts`) ya tiene contenido educativo aprovechable. El asistente debe explicar el sistema a los jueces mientras opera.
3. **Item #4 — Real-time balance:** `balance-service.ts` delega a `accountProvider.getUnifiedBalance()` sin polling/refresh. Implementar cache TTL corta + refresh on-chain.

### 🟡 Después
4. **H3** — amount validation (`private-key-provider.ts:483,531`): NaN/negativos llegan a `parseEther`, crashea la demo.
5. **H6** — timeouts/AbortController en web3 calls (el patrón de T4 se puede reusar).
6. **Wallet 3/4 clarity:** las fallback AVAX wallets no tienen address → si un juez dice "envía a Wallet 3", el gate bloquea con mensaje confuso. UX.
7. **H2** — slippage math (`private-key-provider.ts:734`): subprecia ~40x. Sigue importando incluso con jueces no maliciosos (cada swap come valor en uso normal).

### 🟢 Pulido / verificación
8. Bitrefill DEMO label + rate limit (`/agent/chat`) + gas caps.
9. **Smoke final con movimiento real chico antes del 30.**

---

## Cómo arrancar la próxima sesión

1. **Decidir el push:** `git push origin main` (9 commits locales) — recomendado antes de seguir, para no acumular.
2. **Re-smokear item #1 + PASO 0** (que sigan firmes): `curl` a `/api/balance` sin cookie → 200; JWT forjado viejo → 401.
3. **Continuar item #2:** abrir `docs/superpowers/plans/2026-07-26-gemini-3.6-chat-upgrade.md` y ejecutar **T6** con subagent-driven development (implementer + spec review + quality review). El usuario aprobó esta metodología y trabajar directo en `main`.

**Comandos de verificación (re-run anytime):**
```bash
cd "/Users/munay/dev/UXmaxx Hackathon"
pnpm typecheck                              # 8/8 esperado
pnpm --filter @pouch/infra-ai test          # 48/48 esperado (post-T5)
pnpm test                                   # full repo
pnpm build                                  # 8/8 esperado
```

---

## Archivos de referencia
- `docs/audit/README.md` — entry point del audit.
- `docs/audit/2026-07-25-security-audit.md` — audit completo.
- `docs/audit/FOLLOW-UP-ACTION-PLAN.md` — tabla de fixes (CRITICAL todos `[x]`).
- `docs/audit/SESSION-HANDOFF.md` — **este archivo.**
- `docs/superpowers/specs/2026-07-26-gemini-3.6-chat-upgrade-design.md` — spec del item #2.
- `docs/superpowers/plans/2026-07-26-gemini-3.6-chat-upgrade.md` — plan 9 tareas del item #2 (T1-T5 done, T6-T9 pendientes).

---

## What NOT to touch sin checkear con el usuario
- **C2/C3 behavior** — `allowDemoFallback` default seguro + mount de `/auth/demo`. El flag `DEMO_FALLBACK_ENABLED` es el escape hatch deliberado.
- **El `demo-user` fallback** en `balance.ts`/`agent.ts` — rompe la demo de jueces.
- **Las hardcoded AVAX Wallet 3/4** (`private-key-provider.ts:~347`) — sin address a propósito.
- **La elección de wallet** — main wallet locked.
- **Los Vercel env vars** — PASO 0 cerrado. No rotar secrets sin razón.
- **El system prompt text** (`system-prompt.ts`) — se toca en el item #3 (sistema-guía), no antes.

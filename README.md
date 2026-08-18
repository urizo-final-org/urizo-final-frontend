# AX Module Studio Frontend

React/Vite frontend for the local Spring-primary AX Module Studio stack.

## Canonical local ingress

Open the full local product only through Nginx at
`http://127.0.0.1:18080/`. In the canonical Compose profile, the React/Vite
service port `5173` is internal-only and is not published to the host. Nginx
owns every browser-facing `/`, `/api`, and `/internal` route so product calls
remain same-origin.

`pnpm run dev` is available for isolated frontend development, but its direct
Vite URL is not the full-profile acceptance ingress.

## Local full workflow

The default screen is a real API workbench for the deterministic Stage 3 path:

```text
Project
→ local fixture Connector preview, activation and sync
→ Knowledge Base build and authoritative Job polling
→ Knowledge version activation or rollback
→ Chatbot query against the server-selected Active version
```

The browser obtains a boot-random loopback session from
`GET /internal/dev/product-session`. The token remains in memory and is never
rendered, logged, or stored. Product mutations send `Authorization`,
`X-Trace-Id`, and `Idempotency-Key` headers through the same-origin `/api`
gateway. The connector uses the contract-valid
`https://fixture.invalid/api` identity; the Spring local-full profile must
intercept it with the deterministic fixture adapter and must not perform an
outbound public-data request.

## Local Provider CMS

The existing Stage 2 Provider credential UI remains available under
`#providers` and in the **LLM Providers** sidebar item.

- Run it only with the Backend `dev` profile.
- Enter credentials only in the browser password fields.
- The UI never redisplays a saved credential and clears its input after save.
- OpenAI and Gemini connection tests use deliberately tiny inference limits;
  the Anthropic test uses the Models API without paid inference.

## Toolchain

- Node `24.14.0` (`.node-version` and `package.json#engines`)
- pnpm `11.9.0`
- lockfile version `9.0`

```powershell
pnpm install --frozen-lockfile
pnpm run dev
pnpm run verify
```

The integrated container uses `pnpm run dev:container`; Nginx owns host ingress.
No runtime mock switch exists. Unit tests stub transport only inside Vitest.

## Verified local-full checkpoint

The latest local checkpoint passed all of the following gates:

- `pnpm run verify`: Vitest `2` files / `8` tests, TypeScript app and Node
  configuration checks, and the Vite production build.
- Secure-default Docker build with Node `24.14.0`, pnpm `11.9.0`, frozen lock
  supply-chain verification, an optional build-only extra CA secret, and TLS
  verification enabled by default.
- Non-root, read-only runtime smoke with the version-pinned shared Corepack
  cache and runtime Corepack network access disabled.
- Actual same-origin Nginx E2E covering Project idempotent replay and list/get
  restore; deterministic Connector preview, activation, and sync; two
  Knowledge builds with activation, archive, and rollback; grounded and
  refused RAG outcomes; and authoritative Job list/get restoration.
- Browser QA at a 1280 px viewport: all five workflow cards reported zero
  control overflow, document `scrollWidth` equalled `clientWidth`, API,
  Readiness, and Session were ready, the console had no warnings or errors,
  and all three Provider CMS connection-test controls rendered correctly.

## Team policy authority

Cross-repository workflow, current Wave/Slice state, assignments, and Git/PR policy are owned by the
sibling Master repository. Start from the canonical parent workspace and follow
`../urizo-final-master/AGENTS.md`; this README contains only Frontend runtime and verification facts.

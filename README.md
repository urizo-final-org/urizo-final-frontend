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

## Current application paths

The default administrator route is `/admin/members`. The highest-privilege
Agent settings workspace is available to `SUPER_ADMIN` at `/admin/models`; its
`Provider·Model` and `Agent·Workflow` tabs use the Backend APIs, while the Tool
policy view reads the registered MCP catalog.

The browser obtains a boot-random loopback session from
`GET /internal/dev/product-session`. The token remains in memory and is never
rendered, logged, or stored. Product mutations send `Authorization`,
`X-Trace-Id`, and `Idempotency-Key` headers through the same-origin `/api`
gateway. The connector uses the contract-valid
`https://fixture.invalid/api` identity; the Spring local-full profile must
intercept it with the deterministic fixture adapter and must not perform an
outbound public-data request.

Provider credentials are managed from the `Provider·Model` tab in Agent settings.

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

## Team policy authority

Cross-repository workflow, current Wave/Slice state, assignments, and Git/PR policy are owned by the
sibling Master repository. Start from the canonical parent workspace and follow
`../urizo-final-master/AGENTS.md`; this README contains only Frontend runtime and verification facts.

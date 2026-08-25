# Frontend Repository Agent Entry

## Common authority routing

- This file is a repository entry point, not a copy of team policy.
- Cross-repository policy, roles, Wave/WBS state, assignments, Git/PR workflow, and shared safety rules are owned only by the sibling `../urizo-final-master/AGENTS.md` and its required current-status documents.
- Before planning or editing, read that Master authority from the canonical parent workspace. If the sibling Master checkout is unavailable, do not infer current work from this repository alone; reopen the canonical four-repository workspace or synchronize Master first.
- Claude Code uses `CLAUDE.md`, which imports this file. Do not add a second copy of common policy there.

## Repository-local scope

- Own React user interfaces, browser behavior, frontend delivery assets, and consumption of the Backend public contract.
- Do not add Spring Backend, Flyway migration, or Python LangGraph runtime source here.
- Keep version pins, build commands, and repository-local verification in `README.md`, `package.json`, and the lockfile rather than duplicating them in agent policy.

## AI feature boundary convention

- For AI features 2 through 6, follow the ownership map in the sibling Master's
  `docs/product/AI_CORE_FUTURE_CONSIDERATIONS_v0.1.md`.
- Use `features/knowledge`, `features/coding`, `features/cms/assistant`, and
  `features/orchestration` as the assigned boundaries. An empty assigned boundary may be tracked with `.gitkeep`.
- Keep Route and Navigation registration in `app`. Put Backend calls in the owning feature's `api.ts`
  and reuse shared HTTP, session, and error handling from `shared/api`.
- Prefer local React state. Add a feature Store only when multiple screens share the same state.
- Start with a flat feature folder. Add `components/` or other subfolders only when the implementation needs them,
  and keep tests close to the feature.
- Do not add common sample data to the boundary scaffold. Add fixtures with the assigned feature tests after its contract is defined.

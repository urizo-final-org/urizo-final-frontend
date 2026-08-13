export type RouteId = 'local-full' | 'providers'

export const DEFAULT_ROUTE: RouteId = 'local-full'

export interface RouteDefinition {
  id: RouteId
  /** Sidebar group heading rendered above the first route of each group. */
  group: string
  label: string
  glyph: string
}

/** Registry order is the sidebar order. */
export const routes: RouteDefinition[] = [
  { id: 'local-full', group: 'DATA · KNOWLEDGE', label: 'Local Full Workflow', glyph: '⌘' },
  { id: 'providers', group: 'SETTINGS', label: 'LLM Providers', glyph: '◇' },
]

export function routeFromHash(hash: string): RouteId {
  return hash === '#providers' ? 'providers' : DEFAULT_ROUTE
}

export function hashForRoute(route: RouteId): string {
  return route === 'providers' ? 'providers' : 'local-full'
}

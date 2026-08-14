import type { AdminRole } from '../shared/api/session'

export type RouteId = 'local-full' | 'providers'

export const DEFAULT_ROUTE: RouteId = 'local-full'

export interface RouteDefinition {
  id: RouteId
  /** Sidebar group heading rendered above the first route of each group. */
  group: string
  label: string
  glyph: string
  /**
   * Roles allowed to open the route, or undefined when every administrator may.
   *
   * <p>Hiding a route is a usability feature only. The server repeats every authorization check, so
   * this list must never be the sole thing keeping an operator out of an operation.
   */
  allowedRoles?: AdminRole[]
}

/** Registry order is the sidebar order. */
export const routes: RouteDefinition[] = [
  { id: 'local-full', group: 'DATA · KNOWLEDGE', label: 'Local Full Workflow', glyph: '⌘' },
  {
    id: 'providers',
    group: 'SETTINGS',
    label: 'LLM Providers',
    glyph: '◇',
    // Platform LLM credential registration and rotation stays in the delivery-company lane.
    allowedRoles: ['SUPER_ADMIN'],
  },
]

export function routesForRole(role: AdminRole): RouteDefinition[] {
  return routes.filter((route) => permitsRole(route, role))
}

export function permitsRole(route: RouteDefinition, role: AdminRole): boolean {
  return route.allowedRoles === undefined || route.allowedRoles.includes(role)
}

/**
 * Narrows a requested route to one the role may actually open.
 *
 * <p>A hash typed by hand is a client-supplied claim like any other, so a route outside the role
 * falls back to the default instead of rendering.
 */
export function routeForRole(requested: RouteId, role: AdminRole): RouteId {
  const definition = routes.find((route) => route.id === requested)
  return definition && permitsRole(definition, role) ? requested : DEFAULT_ROUTE
}

export function routeFromHash(hash: string): RouteId {
  return hash === '#providers' ? 'providers' : DEFAULT_ROUTE
}

export function hashForRoute(route: RouteId): string {
  return route === 'providers' ? 'providers' : 'local-full'
}

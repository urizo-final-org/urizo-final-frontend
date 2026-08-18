import type { AdminRole } from '../shared/api/session'

export type RouteId = 'local-full' | 'providers'

export const DEFAULT_ROUTE: RouteId = 'local-full'

export interface RouteDefinition {
  id: RouteId
  /** react-router path, always absolute from the app root. */
  path: string
  /** Sidebar group heading rendered above the first route of each group. */
  group: string
  label: string
  glyph: string
  /**
   * Roles allowed to open the route, or undefined when every administrator may.
   *
   * <p>Hiding a route is a usability feature only. The server repeats every authorization check, so
   * this list must never be the sole thing keeping an operator out of an operation. Because the
   * router only registers a <Route> for a permitted entry (see AppShell), a role outside
   * allowedRoles has no matching route at all rather than a hidden one.
   */
  allowedRoles?: AdminRole[]
}

/** Registry order is the sidebar order. */
export const routes: RouteDefinition[] = [
  { id: 'local-full', path: '/local-full', group: 'DATA · KNOWLEDGE', label: 'Local Full Workflow', glyph: '⌘' },
  {
    id: 'providers',
    path: '/providers',
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

export function pathForRoute(route: RouteId): string {
  return routes.find((definition) => definition.id === route)?.path ?? routes[0].path
}

export function routeIdForPath(pathname: string): RouteId | undefined {
  return routes.find((definition) => definition.path === pathname)?.id
}

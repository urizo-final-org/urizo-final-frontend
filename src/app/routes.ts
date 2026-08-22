import type { AdminRole } from '../shared/api/session'

export type RouteId = 'members' | 'menus' | 'contents' | 'boards' | 'templates'
export interface RouteDefinition { id: RouteId; path: string; group: string; label: string; glyph: string; allowedRoles: AdminRole[] }
const admins: AdminRole[] = ['SUPER_ADMIN', 'GENERAL_ADMIN']

export const routes: RouteDefinition[] = [
  { id: 'members', path: '/admin/members', group: 'CMS', label: '회원 관리', glyph: '◎', allowedRoles: admins },
  { id: 'menus', path: '/admin/menus', group: 'CMS', label: '메뉴 관리', glyph: '☷', allowedRoles: admins },
  { id: 'contents', path: '/admin/contents', group: 'CMS', label: '컨텐츠 관리', glyph: '▤', allowedRoles: admins },
  { id: 'boards', path: '/admin/boards', group: 'CMS', label: '게시판 관리', glyph: '▦', allowedRoles: admins },
  { id: 'templates', path: '/admin/templates', group: 'CMS', label: '템플릿 관리', glyph: '◇', allowedRoles: admins },
]

export function routesForRole(role: AdminRole) { return routes.filter((route) => route.allowedRoles.includes(role)) }
export function defaultRouteForRole(_role: AdminRole): RouteId { return 'members' }
export function pathForRoute(route: RouteId) { return routes.find((item) => item.id === route)?.path ?? '/admin/members' }
export function routeIdForPath(pathname: string) { return routes.find((item) => item.path === pathname)?.id }

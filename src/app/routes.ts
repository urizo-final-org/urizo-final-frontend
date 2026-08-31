import type { AdminRole } from '../shared/api/session'
import type { IconName } from '../shared/ui/icons'

/** Screens backed by the CMS API. */
export type CmsRouteId = 'members' | 'menus' | 'contents' | 'boards' | 'templates'
/** Operations screens; some remain static while Agent/System settings now include Profile API reads and writes. */
export type OpsRouteId = 'home' | 'agents' | 'models' | 'rag' | 'devops' | 'approvals' | 'runs' | 'settings' | 'system-settings' | 'sites'
export type RouteId = CmsRouteId | OpsRouteId

export interface RouteDefinition {
  id: RouteId
  path: string
  group: string
  label: string
  glyph: string
  icon: IconName
  allowedRoles: AdminRole[]
  /** Static mockup with no backing API. */
  mock?: true
  /** Route remains available but is omitted from the sidebar. */
  hiddenFromNavigation?: true
}
const admins: AdminRole[] = ['SUPER_ADMIN', 'GENERAL_ADMIN']
const superAdmins: AdminRole[] = ['SUPER_ADMIN']

export const routes: RouteDefinition[] = [
  { id: 'home', path: '/admin/home', group: '개요', label: '홈', glyph: '⬚', icon: 'layout-dashboard', allowedRoles: admins, mock: true },
  { id: 'members', path: '/admin/members', group: '개요', label: '회원 관리', glyph: '◎', icon: 'users', allowedRoles: admins },
  { id: 'menus', path: '/admin/menus', group: '개요', label: '메뉴 관리', glyph: '☷', icon: 'menu', allowedRoles: admins },
  { id: 'contents', path: '/admin/contents', group: '개요', label: '컨텐츠 관리', glyph: '▤', icon: 'file-text', allowedRoles: admins },
  { id: 'boards', path: '/admin/boards', group: '개요', label: '게시판 관리', glyph: '▦', icon: 'message-square', allowedRoles: admins },
  { id: 'templates', path: '/admin/templates', group: '개요', label: '템플릿 관리', glyph: '◇', icon: 'layout-template', allowedRoles: admins },
  { id: 'agents', path: '/admin/agents', group: 'AI 운영', label: 'Agent 관리', glyph: '◈', icon: 'bot', allowedRoles: admins, mock: true, hiddenFromNavigation: true },
  { id: 'models', path: '/admin/models', group: 'AI 운영', label: 'Agent 설정', glyph: '◧', icon: 'boxes', allowedRoles: superAdmins },
  { id: 'rag', path: '/admin/rag', group: 'AI 운영', label: 'RAG 관리', glyph: '▩', icon: 'database', allowedRoles: admins, mock: true },
  { id: 'devops', path: '/admin/llm-devops', group: 'AI 운영', label: 'LLM DevOps', glyph: '◑', icon: 'code-2', allowedRoles: admins, mock: true },
  { id: 'approvals', path: '/admin/approvals', group: '거버넌스', label: '승인 관리', glyph: '◍', icon: 'shield-check', allowedRoles: admins, mock: true },
  { id: 'runs', path: '/admin/runs', group: '거버넌스', label: '실행 이력', glyph: '◌', icon: 'history', allowedRoles: admins, mock: true },
  { id: 'settings', path: '/admin/settings', group: '환경', label: '설정', glyph: '⚙', icon: 'settings', allowedRoles: admins, mock: true },
  { id: 'system-settings', path: '/admin/system-settings', group: '환경', label: '시스템 설정', glyph: '◫', icon: 'sliders-horizontal', allowedRoles: superAdmins },
  { id: 'sites', path: '/admin/sites', group: '환경', label: '사이트 관리', glyph: '◎', icon: 'globe-2', allowedRoles: superAdmins, mock: true },
]

/** Groups the canvas lets the operator fold away; 개요 always stays open. */
export const foldableGroups = ['AI 운영', '거버넌스', '환경']

const cmsRouteIds: CmsRouteId[] = ['members', 'menus', 'contents', 'boards', 'templates']
export function isCmsRouteId(route: RouteId): route is CmsRouteId { return (cmsRouteIds as RouteId[]).includes(route) }

export function routesForRole(role: AdminRole) { return routes.filter((route) => route.allowedRoles.includes(role)) }
export function navigationRoutesForRole(role: AdminRole) { return routesForRole(role).filter((route) => !route.hiddenFromNavigation) }
export function defaultRouteForRole(_role: AdminRole): RouteId { return 'members' }
export function pathForRoute(route: RouteId) { return routes.find((item) => item.id === route)?.path ?? '/admin/members' }
export function routeIdForPath(pathname: string) { return routes.find((item) => item.path === pathname)?.id }
export function groupForRoute(route: RouteId) { return routes.find((item) => item.id === route)?.group ?? '개요' }
export function labelForRoute(route: RouteId) { return routes.find((item) => item.id === route)?.label ?? '' }

import { Fragment, type ReactNode } from 'react'
import type { AdminRole } from '../shared/api/session'
import { routesForRole, type RouteId } from './routes'

/**
 * Line icons for the sidebar. A route without an icon falls back to its `glyph`, so adding a route
 * never leaves a blank slot in the nav.
 */
const icons: Partial<Record<RouteId, ReactNode>> = {
  members: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  menus: <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>,
  contents: <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></>,
  boards: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />,
  templates: <><rect width="18" height="7" x="3" y="3" rx="1" /><rect width="9" height="7" x="3" y="14" rx="1" /><rect width="5" height="7" x="16" y="14" rx="1" /></>,
}

function NavIcon({ route, glyph }: { route: RouteId; glyph: string }) {
  const icon = icons[route]
  if (!icon) return <span className="w-4 text-center text-[15px] leading-none" aria-hidden="true">{glyph}</span>
  return <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
}

export function AppNavigation({
  activeRoute,
  role,
  onNavigate,
}: {
  activeRoute: RouteId
  role: AdminRole
  onNavigate: (route: RouteId) => void
}) {
  let renderedGroup: string | null = null

  return (
    <nav className="mt-1 grid gap-[2px]" aria-label="관리자 메뉴">
      {routesForRole(role).map((route) => {
        const groupHeading = route.group === renderedGroup ? null : route.group
        renderedGroup = route.group
        const active = activeRoute === route.id
        return (
          <Fragment key={route.id}>
            {groupHeading && (
              <p className="m-0 mx-[10px] mb-[7px] mt-4 text-[10px] font-bold leading-none tracking-[0.1em] text-navy-heading">
                {groupHeading} 관리
              </p>
            )}
            <button
              className={`flex w-full items-center gap-[11px] rounded-md px-[10px] py-[10px] text-left text-xs text-navy-text hover:bg-navy-active hover:text-white ${
                active ? 'bg-navy-active text-white shadow-[inset_3px_0_var(--accent)]' : ''
              }`}
              onClick={() => onNavigate(route.id)}
            >
              <NavIcon route={route.id} glyph={route.glyph} />
              {route.label}
            </button>
          </Fragment>
        )
      })}
    </nav>
  )
}

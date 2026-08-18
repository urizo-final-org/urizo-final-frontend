import { Fragment } from 'react'
import type { AdminRole } from '../shared/api/session'
import { routesForRole, type RouteId } from './routes'

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
    <nav
      className="mt-7 grid gap-[5px] max-[820px]:mt-3 max-[820px]:flex max-[820px]:flex-wrap"
      aria-label="관리자 메뉴"
    >
      {routesForRole(role).map((route) => {
        const groupHeading = route.group === renderedGroup ? null : route.group
        renderedGroup = route.group
        const active = activeRoute === route.id
        return (
          <Fragment key={route.id}>
            {groupHeading && (
              <p className="m-0 mx-[10px] mb-[5px] mt-4 font-mono text-[9px] font-bold leading-none tracking-[0.14em] text-[#59677c] max-[820px]:hidden">
                {groupHeading}
              </p>
            )}
            <button
              className={`flex w-full items-center gap-[10px] rounded-[9px] border border-transparent px-3 py-[11px] text-left text-xs text-[#94a1b6] hover:bg-white/[0.045] hover:text-[#e6eaf2] max-[820px]:w-auto ${
                active ? 'border-[rgba(134,117,244,0.25)] bg-[rgba(105,87,232,0.22)] text-white' : ''
              }`}
              onClick={() => onNavigate(route.id)}
            >
              <span
                className={`w-[18px] text-center text-[15px] ${active ? 'text-[#b6aaff]' : 'text-[#6e7b91]'}`}
                aria-hidden="true"
              >
                {route.glyph}
              </span>{' '}
              {route.label}
            </button>
          </Fragment>
        )
      })}
    </nav>
  )
}

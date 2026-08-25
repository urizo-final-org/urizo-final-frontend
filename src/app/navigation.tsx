import { Fragment, useState } from 'react'
import type { AdminRole } from '../shared/api/session'
import { Icon } from '../shared/ui/icons'
import { foldableGroups, routesForRole, type RouteId } from './routes'

export function AppNavigation({
  activeRoute,
  role,
  onNavigate,
}: {
  activeRoute: RouteId
  role: AdminRole
  onNavigate: (route: RouteId) => void
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  let renderedGroup: string | null = null

  function toggle(group: string) {
    setCollapsed((current) => ({ ...current, [group]: !current[group] }))
  }

  return (
    <nav className="flex flex-1 flex-col gap-[2px] overflow-y-auto px-2 pb-2" aria-label="관리자 메뉴">
      {routesForRole(role).map((route) => {
        const groupHeading = route.group === renderedGroup ? null : route.group
        renderedGroup = route.group
        const foldable = foldableGroups.includes(route.group)
        const open = !collapsed[route.group]
        const active = activeRoute === route.id
        return (
          <Fragment key={route.id}>
            {groupHeading && (foldable ? (
              <button
                type="button"
                className="flex w-full items-center gap-[6px] bg-transparent px-[10px] pb-[5px] pt-[14px] text-left text-[9.5px] font-bold tracking-[.09em] text-sb-muted"
                onClick={() => toggle(route.group)}
                aria-expanded={open}
              >
                <span className="flex-1">{groupHeading}</span>
                <span className={`flex transition-transform ${open ? '' : '-rotate-90'}`}><Icon name="chevron-down" size={13} /></span>
              </button>
            ) : (
              <p className="m-0 px-[10px] pb-[5px] pt-[14px] text-[9.5px] font-bold tracking-[.09em] text-sb-muted">{groupHeading}</p>
            ))}
            {(!foldable || open) && (
              <button
                type="button"
                className={`flex w-full items-center gap-[9px] rounded-[5px] px-[10px] py-[7px] text-left text-[12.5px] ${
                  active ? 'bg-sb-active font-semibold text-white' : 'font-medium text-sb-item hover:bg-sb-active/60 hover:text-white'
                }`}
                onClick={() => onNavigate(route.id)}
              >
                <Icon name={route.icon} size={15} />
                <span className="flex-1 truncate">{route.label}</span>
                {route.count && <span className="rounded-[9px] bg-[#fdf1e0] px-[6px] py-[1px] text-[9.5px] font-bold text-[#9a6829]">{route.count}</span>}
              </button>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}

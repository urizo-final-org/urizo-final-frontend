import { Fragment, useState } from 'react'
import type { AdminRole } from '../shared/api/session'
import { Icon } from '../shared/ui/icons'
import { foldableGroups, navigationRoutesForRole, type RouteId } from './routes'

const temporaryMockTitle = '임시 목업 · 향후 필요 시 현재 Runtime 계약 기준으로 구현'

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
    <nav className="flex flex-1 flex-col gap-[0.125rem] overflow-y-auto px-2 pb-2" aria-label="관리자 메뉴">
      {navigationRoutesForRole(role).map((route) => {
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
                className="flex w-full items-center gap-[0.375rem] bg-transparent px-[0.625rem] pb-[0.3125rem] pt-[0.875rem] text-left text-[0.59375rem] font-bold tracking-[.09em] text-sb-muted"
                onClick={() => toggle(route.group)}
                aria-expanded={open}
              >
                <span className="flex-1">{groupHeading}</span>
                <span className={`flex transition-transform ${open ? '' : '-rotate-90'}`}><Icon name="chevron-down" size={13} /></span>
              </button>
            ) : (
              <p className="m-0 px-[0.625rem] pb-[0.3125rem] pt-[0.875rem] text-[0.59375rem] font-bold tracking-[.09em] text-sb-muted">{groupHeading}</p>
            ))}
            {(!foldable || open) && (
              <button
                type="button"
                className={`flex w-full items-center gap-[0.5625rem] rounded-[0.3125rem] px-[0.625rem] py-[0.4375rem] text-left text-[0.78125rem] ${
                  active ? 'bg-sb-active font-semibold text-white' : 'font-medium text-sb-item hover:bg-sb-active/60 hover:text-white'
                }`}
                onClick={() => onNavigate(route.id)}
              >
                <Icon name={route.icon} size={15} />
                <span className="flex-1 truncate">{route.label}</span>
                {route.mock && <span
                  className="shrink-0 rounded border border-[#49657d] bg-[#233b50] px-[0.3125rem] py-[0.0625rem] text-[0.53125rem] font-semibold text-[#cfe2ef]"
                  title={temporaryMockTitle}
                >임시</span>}
              </button>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}

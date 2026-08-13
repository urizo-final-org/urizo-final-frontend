import { Fragment } from 'react'
import { routes, type RouteId } from './routes'

export function AppNavigation({
  activeRoute,
  onNavigate,
}: {
  activeRoute: RouteId
  onNavigate: (route: RouteId) => void
}) {
  let renderedGroup: string | null = null

  return (
    <nav aria-label="관리자 메뉴">
      {routes.map((route) => {
        const groupHeading = route.group === renderedGroup ? null : route.group
        renderedGroup = route.group
        return (
          <Fragment key={route.id}>
            {groupHeading && <p>{groupHeading}</p>}
            <button
              className={activeRoute === route.id ? 'is-active' : ''}
              onClick={() => onNavigate(route.id)}
            >
              <span aria-hidden="true">{route.glyph}</span> {route.label}
            </button>
          </Fragment>
        )
      })}
    </nav>
  )
}

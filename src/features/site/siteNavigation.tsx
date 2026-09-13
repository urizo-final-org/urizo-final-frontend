import { Link } from 'react-router-dom'
import type { Menu } from '../cms/api'

export function orderedMenus(menus: Menu[], parentId: number | null) {
  return menus.filter((menu) => menu.parentId === parentId)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)
}

/** 대메뉴 클릭은 CMS 노출 순서의 첫 하위메뉴로 이동한다. 자식이 없으면 자신의 연결을 유지한다. */
export function menuDestination(menu: Menu, menus: Menu[]) {
  const path = orderedMenus(menus, menu.id)[0]?.path ?? menu.path
  return path.startsWith('/') ? path : `/${path}`
}

function ancestorsOf(menu: Menu, menus: Menu[]) {
  const ancestors: Menu[] = []
  const visited = new Set<number>([menu.id])
  let parent = menus.find((item) => item.id === menu.parentId)
  while (parent && !visited.has(parent.id)) {
    ancestors.unshift(parent)
    visited.add(parent.id)
    const parentId = parent.parentId
    parent = menus.find((item) => item.id === parentId)
  }
  return ancestors
}

/** 현재 위치만 타이틀 배너 안에 둔다. 하위 메뉴 탭은 별도의 흰색 영역을 유지한다. */
export function SectionBreadcrumb({ menu, menus }: { menu?: Menu; menus: Menu[] }) {
  if (!menu) return null
  return <nav aria-label="현재 위치" className="mt-7 border-t border-white/20 pt-4 text-xs text-white/80">
    <ol className="m-0 flex list-none flex-wrap items-center gap-x-3 gap-y-2 p-0">
      <li><Link to="/" className="text-inherit no-underline hover:underline">홈</Link></li>
      {ancestorsOf(menu, menus).map((item) => <li key={item.id} className="flex items-center gap-3"><span aria-hidden="true">›</span><Link to={menuDestination(item, menus)} className="text-inherit no-underline hover:underline">{item.name}</Link></li>)}
      <li className="flex items-center gap-3"><span aria-hidden="true">›</span><span aria-current="page" className="font-bold text-white">{menu.name}</span></li>
    </ol>
  </nav>
}

export function SectionNavigation({ menu, menus }: { menu?: Menu; menus: Menu[] }) {
  if (!menu) return null
  const section = ancestorsOf(menu, menus)[0] ?? menu
  const siblings = orderedMenus(menus, menu.parentId === null ? menu.id : menu.parentId)
  if (siblings.length === 0) return null
  return <div className="border-b border-line bg-panel">
    <div className="mx-auto max-w-[68.75rem] px-5">
      <nav aria-label={`${section.name} 하위 메뉴`} className="flex gap-6 overflow-x-auto">
        {siblings.map((item) => <Link key={item.id} to={item.path.startsWith('/') ? item.path : `/${item.path}`} aria-current={item.id === menu.id ? 'page' : undefined}
          className={`shrink-0 border-b-2 px-1 py-4 text-sm font-bold no-underline ${item.id === menu.id ? 'border-primary text-primary' : 'border-transparent text-body hover:border-primary hover:text-primary'}`}>{item.name}</Link>)}
      </nav>
    </div>
  </div>
}

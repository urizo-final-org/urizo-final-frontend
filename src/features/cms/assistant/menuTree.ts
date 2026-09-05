/** 미리보기 트리가 쓰는 메뉴 한 건. 화면이 이미 들고 있는 값만 쓴다. */
export type AssistantMenu = {
  id: number
  name: string
  path: string
  parentId: number | null
  /** 연결 상태를 그대로 보여주는 설명. 삭제 확인에서만 쓴다. */
  link?: string
}

export type MenuChange = 'none' | 'added' | 'moved' | 'changed' | 'removed'

export type MenuTreeNode = {
  key: string
  name: string
  path: string
  change: MenuChange
  /** 이동 전 자리. 서수이며 이동이 아닐 때는 `null`이다. */
  from: number | null
  children: MenuTreeNode[]
}

export type MenuCommand = { operation: string; fields: Record<string, unknown> }

/** 아직 만들어지지 않은 메뉴의 자리표. 화면 안에서만 쓰고 서버로 보내지 않는다. */
const NEW_MENU_ID = -1

type Entry = { menu: AssistantMenu; change: MenuChange; from: number | null }

/**
 * 명령서 하나를 지금 목록에 얹어 결과 트리를 만든다.
 *
 * 파이프라인이 주는 미리보기는 대상 한 행뿐이라 순서 변경 결과를 담지 못한다.
 * 화면은 전체 목록을 이미 가지고 있으므로 `position`과 대상 id만으로 결과 순서가 나온다.
 * 번호 규칙(`10` 간격·부모 + 1)은 Backend가 알고, 화면은 순서만 계산한다.
 */
export function menuPreviewTree(
  menus: AssistantMenu[],
  command: MenuCommand,
  targetId: string,
): MenuTreeNode[] {
  const entries: Entry[] = menus.map((menu) => ({ menu, change: 'none', from: null }))
  const fields = command.fields ?? {}

  if (command.operation === 'DELETE') {
    const removal = menuRemoval(menus, targetId)
    if (!removal) return tree(entries)
    const gone = new Set([removal.target.id, ...removal.children.map((child) => child.id)])
    return tree(entries.map((entry) => gone.has(entry.menu.id) ? { ...entry, change: 'removed' } : entry))
  }

  if (command.operation === 'CREATE') {
    const parentId = numberOrNull(fields.parentId)
    const created: Entry = {
      menu: {
        id: NEW_MENU_ID,
        name: text(fields.name) ?? '새 메뉴',
        path: text(fields.path) ?? '',
        parentId,
      },
      change: 'added',
      from: null,
    }
    return tree(place(entries, created, parentId, position(fields)))
  }

  const current = entries.find((entry) => String(entry.menu.id) === targetId)
  if (!current) return tree(entries)
  const parentId = 'parentId' in fields ? numberOrNull(fields.parentId) : current.menu.parentId
  const menu: AssistantMenu = {
    ...current.menu,
    name: text(fields.name) ?? current.menu.name,
    path: text(fields.path) ?? current.menu.path,
    parentId,
  }
  const place_ = position(fields)
  if (place_ === null) {
    const change: MenuChange = Object.keys(fields).length > 0 ? 'changed' : 'none'
    return tree(entries.map((entry) => entry === current ? { menu, change, from: null } : entry))
  }
  const moved: Entry = { menu, change: 'moved', from: ordinal(entries, current) }
  return tree(place(entries.filter((entry) => entry !== current), moved, parentId, place_))
}

/**
 * 삭제로 함께 사라지는 것들. 대메뉴를 지우면 하위가 딸려 나간다.
 *
 * 트리로는 딸려 나가는 게 잘 안 보여 삭제만 목록으로 확인한다. 계층이 2단계라
 * `parentId`로 한 번만 거르면 된다.
 */
export function menuRemoval(
  menus: AssistantMenu[],
  targetId: string,
): { target: AssistantMenu; children: AssistantMenu[] } | null {
  const target = menus.find((menu) => String(menu.id) === targetId)
  if (!target) return null
  return { target, children: menus.filter((menu) => menu.parentId === target.id) }
}

/** 변경 지점 주변만 펼치려면 이 가지 안에 바뀐 것이 있는지 알아야 한다. */
export function hasMenuChange(node: MenuTreeNode): boolean {
  return node.change !== 'none' || node.children.some((child) => child.change !== 'none')
}

/** 같은 부모의 형제 목록에 대상을 원하는 자리로 끼운다. 자리를 말하지 않으면 맨 뒤다. */
function place(
  entries: Entry[],
  node: Entry,
  parentId: number | null,
  at: number | null,
): Entry[] {
  const group = entries.filter((entry) => entry.menu.parentId === parentId)
  const others = entries.filter((entry) => entry.menu.parentId !== parentId)
  const index = at === null ? group.length : Math.max(0, Math.min(at - 1, group.length))
  return [...others, ...group.slice(0, index), node, ...group.slice(index)]
}

/** 계층이 2단계라 재귀가 필요 없다. 대메뉴를 훑고 그 아래만 한 번 더 거른다. */
function tree(entries: Entry[]): MenuTreeNode[] {
  return entries
    .filter((entry) => entry.menu.parentId === null)
    .map((top) => node(top, entries.filter((entry) => entry.menu.parentId === top.menu.id)))
}

function node(entry: Entry, children: Entry[]): MenuTreeNode {
  return {
    key: `${entry.menu.id}:${entry.change}`,
    name: entry.menu.name,
    path: entry.menu.path,
    change: entry.change,
    from: entry.from,
    children: children.map((child) => node(child, [])),
  }
}

function ordinal(entries: Entry[], entry: Entry): number {
  return entries.filter((other) => other.menu.parentId === entry.menu.parentId).indexOf(entry) + 1
}

function position(fields: Record<string, unknown>): number | null {
  const value = fields.position
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

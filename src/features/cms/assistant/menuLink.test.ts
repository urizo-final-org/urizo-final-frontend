import { expect, test } from 'vitest'
import { linkLabel, menuPreviewTree, NO_LINK, type AssistantLinkTargets, type AssistantMenu } from './menuTree'

/** 연결 상태가 저마다 다른 목록. `link`는 메뉴 화면이 이미 계산해 넘기는 값이다. */
const menus: AssistantMenu[] = [
  { id: 10, name: '소개', path: '/about', parentId: null, link: '게시판 · 공지사항' },
  { id: 11, name: '회사 소개', path: '/about/company', parentId: 10, link: NO_LINK },
  { id: 40, name: '고객지원', path: '/support', parentId: null, link: NO_LINK },
]

const targets: AssistantLinkTargets = {
  contents: [{ id: 12, title: '회사 소개' }, { id: 20, title: '이용 안내' }],
  boards: [{ id: 3, name: '공지사항' }, { id: 7, name: '자료실' }],
}

function find(tree: ReturnType<typeof menuPreviewTree>, name: string) {
  for (const node of tree) {
    if (node.name === name) return node
    const child = node.children.find((item) => item.name === name)
    if (child) return child
  }
  return undefined
}

test('연결 이름은 타입을 앞에 붙여 사람이 읽는 말로 만든다', () => {
  expect(linkLabel('CONTENT', 12, targets)).toBe('컨텐츠 · 회사 소개')
  expect(linkLabel('BOARD', 3, targets)).toBe('게시판 · 공지사항')
  expect(linkLabel(null, null, targets)).toBe(NO_LINK)
})

test('목록에 없는 대상은 번호를 노출하지 않고 미지정으로 둔다', () => {
  expect(linkLabel('CONTENT', 999, targets)).toBe('컨텐츠 · 미지정')
  expect(linkLabel('BOARD', 3, undefined)).toBe('게시판 · 미지정')
})

test('새로 연결하면 연결 없음에서 붙는 대상으로 보여준다', () => {
  const tree = menuPreviewTree(
    menus, { operation: 'UPDATE', fields: { targetType: 'CONTENT', targetId: 12 } }, '11', targets)

  expect(find(tree, '회사 소개')?.link).toEqual({ before: NO_LINK, after: '컨텐츠 · 회사 소개' })
})

test('연결을 바꾸면 떼어지는 쪽과 붙는 쪽이 함께 남는다', () => {
  const tree = menuPreviewTree(
    menus, { operation: 'UPDATE', fields: { targetType: 'CONTENT', targetId: 12 } }, '10', targets)

  // 떼어지는 쪽이 안 보이면 잘못 고른 대상을 승인 전에 잡을 수 없다.
  expect(find(tree, '소개')?.link).toEqual({ before: '게시판 · 공지사항', after: '컨텐츠 · 회사 소개' })
})

test('연결을 끊는 것도 변경으로 보여준다', () => {
  const tree = menuPreviewTree(
    menus, { operation: 'UPDATE', fields: { targetType: null, targetId: null } }, '10', targets)

  expect(find(tree, '소개')?.link).toEqual({ before: '게시판 · 공지사항', after: NO_LINK })
})

test('이름만 바꾸면 연결 줄을 그리지 않는다', () => {
  const tree = menuPreviewTree(
    menus, { operation: 'UPDATE', fields: { name: '회사 안내' } }, '10', targets)

  const node = find(tree, '회사 안내')
  expect(node?.change).toBe('changed')
  expect(node?.link).toBeNull()
})

test('같은 대상을 다시 연결하면 바뀐 것이 없어 줄을 그리지 않는다', () => {
  const tree = menuPreviewTree(
    menus, { operation: 'UPDATE', fields: { targetType: 'BOARD', targetId: 3 } }, '10', targets)

  expect(find(tree, '소개')?.link).toBeNull()
})

test('등록하며 연결하면 전이 없어 붙는 것만 적는다', () => {
  const tree = menuPreviewTree(menus, {
    operation: 'CREATE',
    fields: { name: '자료실', path: '/resources', parentId: 40, targetType: 'BOARD', targetId: 7 },
  }, 'new', targets)

  const created = find(tree, '자료실')
  expect(created?.change).toBe('added')
  expect(created?.link).toEqual({ before: null, after: '게시판 · 자료실' })
})

test('연결 없이 등록하면 연결 줄이 없다', () => {
  const tree = menuPreviewTree(menus, {
    operation: 'CREATE', fields: { name: '자료실', path: '/resources', parentId: 40 },
  }, 'new', targets)

  expect(find(tree, '자료실')?.link).toBeNull()
})

test('자리를 옮기면서 연결도 바꾸면 둘 다 남는다', () => {
  const tree = menuPreviewTree(menus, {
    operation: 'UPDATE', fields: { position: 1, targetType: 'CONTENT', targetId: 20 },
  }, '10', targets)

  const node = find(tree, '소개')
  expect(node?.change).toBe('moved')
  expect(node?.link).toEqual({ before: '게시판 · 공지사항', after: '컨텐츠 · 이용 안내' })
})

test('삭제는 연결 줄을 붙이지 않는다', () => {
  const tree = menuPreviewTree(menus, { operation: 'DELETE', fields: {} }, '10', targets)

  const node = find(tree, '소개')
  expect(node?.change).toBe('removed')
  expect(node?.link).toBeNull()
})

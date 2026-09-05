import { expect, test } from 'vitest'
import { hasMenuChange, menuPreviewTree, menuRemoval, type AssistantMenu } from './menuTree'

/** 대메뉴 둘과 하위 셋. 목록은 API가 준 표시 순서 그대로다. */
const menus: AssistantMenu[] = [
  { id: 10, name: '소개', path: '/about', parentId: null },
  { id: 11, name: '회사 소개', path: '/about/company', parentId: 10 },
  { id: 12, name: '비전', path: '/about/vision', parentId: 10 },
  { id: 13, name: '연혁', path: '/about/history', parentId: 10 },
  { id: 40, name: '고객지원', path: '/support', parentId: null },
  { id: 41, name: '문의하기', path: '/support/contact', parentId: 40 },
]

test('moving a child to the first place reorders only its own group', () => {
  const tree = menuPreviewTree(menus, { operation: 'UPDATE', fields: { position: 1 } }, '12')

  expect(tree.map((node) => node.name)).toEqual(['소개', '고객지원'])
  expect(tree[0].children.map((node) => node.name)).toEqual(['비전', '회사 소개', '연혁'])
  expect(tree[0].children[0].change).toBe('moved')
  expect(tree[0].children[0].from).toBe(2)
  expect(tree[1].children.map((node) => node.change)).toEqual(['none'])
})

test('moving a top menu carries its children without marking them', () => {
  const tree = menuPreviewTree(menus, { operation: 'UPDATE', fields: { position: 1 } }, '40')

  expect(tree.map((node) => node.name)).toEqual(['고객지원', '소개'])
  expect(tree[0].change).toBe('moved')
  expect(tree[0].from).toBe(2)
  expect(tree[0].children.map((node) => node.name)).toEqual(['문의하기'])
  expect(tree[0].children.every((node) => node.change === 'none')).toBe(true)
})

test('a position past the last sibling lands at the end', () => {
  const tree = menuPreviewTree(menus, { operation: 'UPDATE', fields: { position: 9 } }, '11')

  expect(tree[0].children.map((node) => node.name)).toEqual(['비전', '연혁', '회사 소개'])
  expect(tree[0].children[2].change).toBe('moved')
})

test('a create without a position appends to its parent', () => {
  const tree = menuPreviewTree(
    menus,
    { operation: 'CREATE', fields: { name: '자료실', path: '/support/archive', parentId: 40 } },
    'new',
  )

  expect(tree[1].children.map((node) => node.name)).toEqual(['문의하기', '자료실'])
  expect(tree[1].children[1].change).toBe('added')
  expect(tree[1].children[1].path).toBe('/support/archive')
})

test('a create with a position lands at that place among top menus', () => {
  const tree = menuPreviewTree(
    menus,
    { operation: 'CREATE', fields: { name: '회사', path: '/company', position: 1 } },
    'new',
  )

  expect(tree.map((node) => node.name)).toEqual(['회사', '소개', '고객지원'])
  expect(tree[0].change).toBe('added')
  expect(tree[0].children).toEqual([])
})

test('deleting a top menu marks it and its children as removed', () => {
  const tree = menuPreviewTree(menus, { operation: 'DELETE', fields: {} }, '10')

  expect(tree[0].change).toBe('removed')
  expect(tree[0].children.map((node) => node.change)).toEqual(['removed', 'removed', 'removed'])
  expect(tree[1].change).toBe('none')
})

test('a rename keeps the place and shows the new name', () => {
  const tree = menuPreviewTree(menus, { operation: 'UPDATE', fields: { name: 'About' } }, '11')

  expect(tree[0].children.map((node) => node.name)).toEqual(['About', '비전', '연혁'])
  expect(tree[0].children[0].change).toBe('changed')
  expect(tree[0].children[0].from).toBeNull()
})

test('the removal list names every menu that disappears', () => {
  const removal = menuRemoval(menus, '10')

  expect(removal?.target.name).toBe('소개')
  expect(removal?.children.map((menu) => menu.name)).toEqual(['회사 소개', '비전', '연혁'])
  expect(menuRemoval(menus, '41')?.children).toEqual([])
  expect(menuRemoval(menus, '999')).toBeNull()
})

test('only the branch around the change reports itself as changed', () => {
  const tree = menuPreviewTree(menus, { operation: 'UPDATE', fields: { position: 1 } }, '12')

  expect(hasMenuChange(tree[0])).toBe(true)
  expect(hasMenuChange(tree[1])).toBe(false)
})

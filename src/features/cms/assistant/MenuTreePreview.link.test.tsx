import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import MenuTreePreview from './MenuTreePreview'
import type { MenuTreeNode } from './menuTree'

function node(value: Partial<MenuTreeNode> = {}): MenuTreeNode {
  return {
    key: '10:changed', name: '소개', path: '/about',
    change: 'changed', from: null, link: null, children: [],
    ...value,
  }
}

test('연결이 바뀌면 떼어지는 쪽과 붙는 쪽을 함께 그린다', () => {
  render(<MenuTreePreview nodes={[node({ link: { before: '게시판 · 공지사항', after: '컨텐츠 · 회사 소개' } })]} />)

  expect(screen.getByText('연결')).toBeInTheDocument()
  expect(screen.getByText('게시판 · 공지사항')).toBeInTheDocument()
  expect(screen.getByText('컨텐츠 · 회사 소개')).toBeInTheDocument()
})

test('등록은 전이 없어 붙는 것만 그린다', () => {
  render(<MenuTreePreview nodes={[node({ change: 'added', link: { before: null, after: '게시판 · 자료실' } })]} />)

  expect(screen.getByText('게시판 · 자료실')).toBeInTheDocument()
  expect(screen.queryByText(/공지사항/)).not.toBeInTheDocument()
})

test('연결이 그대로면 줄 자체가 없다', () => {
  render(<MenuTreePreview nodes={[node()]} />)

  expect(screen.queryByText('연결')).not.toBeInTheDocument()
})

test('하위 메뉴의 연결 변경도 그린다', () => {
  render(<MenuTreePreview nodes={[node({
    key: '10:none', change: 'none',
    children: [node({ key: '11:changed', name: '회사 소개', path: '/about/company', link: { before: '연결 없음', after: '컨텐츠 · 이용 안내' } })],
  })]} />)

  // 바뀐 하위가 있으면 가지가 펼쳐진 채로 그려진다.
  expect(screen.getByText('컨텐츠 · 이용 안내')).toBeInTheDocument()
})

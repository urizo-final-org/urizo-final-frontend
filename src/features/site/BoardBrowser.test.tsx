import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import BoardBrowser, { postText } from './BoardBrowser'
import { SubPage } from './PublicSite'
import type { Board, Post, Menu } from '../cms/api'

const board: Board = { id: 4, name: '여행 소식', description: '여행 샘플', createdAt: '2026-09-11', updatedAt: '2026-09-11' }
const posts: Post[] = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, boardId: 4, title: `여행 소식 ${i + 1}`,
  body: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: i === 18 ? '숲길 산책' : '여행 안내' }] }] }),
  authorId: '1', authorName: '관리자', createdAt: '2026-09-11', updatedAt: '2026-09-11',
  regionCodeId: i % 2 ? 1 : 2, categoryCodeId: i % 3 ? 3 : 4, thumbnailImageId: 7, thumbnailAlt: '숲길 샘플' }))
afterEach(() => vi.unstubAllGlobals())
function Location() { const loc = useLocation(); return <output aria-label="현재 주소">{loc.pathname + loc.search}</output> }
function open(value = board, entry = '/news') { return render(<MemoryRouter initialEntries={[entry]}><BoardBrowser board={value} posts={posts} /><Location /></MemoryRouter>) }

test('30 posts paginate by ten and invalid page input is clamped', () => {
  const view = open()
  expect(screen.getAllByRole('link')).toHaveLength(10)
  expect(screen.getByText('여행 소식 1')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '다음' }))
  expect(screen.getByText('여행 소식 11')).toBeInTheDocument()
  expect(screen.queryByText('여행 소식 1')).not.toBeInTheDocument()
  expect(screen.getByLabelText('현재 주소')).toHaveTextContent('page=2')
  view.unmount()
  open(board, '/news?page=999')
  expect(screen.getByText('여행 소식 21')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()
})

test('search finds document text, resets page, and handles zero results', () => {
  open(board, '/news?page=3')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '숲길' } })
  fireEvent.click(screen.getByRole('button', { name: '검색' }))
  expect(screen.getByText('여행 소식 19')).toBeInTheDocument()
  expect(screen.getAllByRole('link')).toHaveLength(1)
  expect(screen.getByLabelText('현재 주소')).not.toHaveTextContent('page=')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '없는 검색어' } })
  fireEvent.click(screen.getByRole('button', { name: '검색' }))
  expect(screen.getByText('검색 조건에 맞는 게시물이 없습니다.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '초기화' }))
  expect(screen.getAllByRole('link')).toHaveLength(10)
})

test('card board filters by separate region and category while retaining disabled labels', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([
    { id: 1, groupKey: 'REGION', value: 'SEOUL', label: '서울', displayOrder: 0, enabled: true },
    { id: 2, groupKey: 'REGION', value: 'GANGWON', label: '강원', displayOrder: 1, enabled: false },
    { id: 3, groupKey: 'CATEGORY', value: 'NEWS', label: '소식', displayOrder: 0, enabled: true },
    { id: 4, groupKey: 'CATEGORY', value: 'GUIDE', label: '안내', displayOrder: 1, enabled: true },
  ]), { headers: { 'Content-Type': 'application/json' } })))
  open({ ...board, displayType: 'CARD', regionGroupKey: 'REGION', categoryGroupKey: 'CATEGORY' })
  await screen.findByRole('option', { name: '강원' })
  fireEvent.change(screen.getByLabelText('지역'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('분류'), { target: { value: '4' } })
  expect(screen.getAllByRole('link')).toHaveLength(5)
  expect(screen.getAllByAltText('숲길 샘플')[0]).toHaveAttribute('src', '/api/site/images/7')
  expect(screen.getByLabelText('현재 주소')).toHaveTextContent('region=2')
  expect(screen.getByLabelText('현재 주소')).toHaveTextContent('category=4')
})

test('list board without optional groups has no irrelevant filters or code request', () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  open()
  expect(screen.queryByLabelText('지역')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('분류')).not.toBeInTheDocument()
  expect(fetcher).not.toHaveBeenCalled()
})

test('search extracts visible document text rather than JSON attributes', () => {
  expect(postText(posts[18].body)).toContain('숲길 산책')
  expect(postText(posts[18].body)).not.toContain('paragraph')
  expect(postText('옛 마크다운')).toBe('옛 마크다운')
})

test('breadcrumb is inside the title hero and child tabs remain outside it', async () => {
  const menus: Menu[] = [
    { id: 1, name: '여행 가이드', path: '/about', parentId: null, displayOrder: 0, targetType: 'NONE', targetId: null },
    { id: 2, name: '소개', path: '/about/company', parentId: 1, displayOrder: 1, targetType: 'CONTENT', targetId: 8 },
  ]
  render(<MemoryRouter><SubPage menu={menus[1]} menus={menus} board={null} content={null} posts={[]} post={null} failure={null} siteName="우리여행" /></MemoryRouter>)
  const hero = screen.getByRole('heading', { level: 1 }).closest('section')!
  expect(within(hero).getByRole('navigation', { name: '현재 위치' })).toBeInTheDocument()
  expect(within(hero).queryByRole('navigation', { name: '여행 가이드 하위 메뉴' })).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('navigation', { name: '여행 가이드 하위 메뉴' })).toBeInTheDocument())
})

test('post uses document renderer and returns to the same filtered list', () => {
  const menu: Menu = { id: 1, name: '소식', path: '/news', parentId: null, displayOrder: 0, targetType: 'BOARD', targetId: 4 }
  render(<MemoryRouter initialEntries={[{ pathname: '/posts/19', state: { boardReturnTo: '/news?q=숲길&page=2' } }]}>
    <SubPage menu={menu} menus={[menu]} board={board} content={null} posts={posts} post={posts[18]} failure={null} siteName="우리여행" />
  </MemoryRouter>)
  expect(screen.getByText('숲길 산책')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '목록으로' })).toHaveAttribute('href', '/news?q=숲길&page=2')
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
})

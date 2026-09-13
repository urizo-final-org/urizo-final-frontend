import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import type { Menu, SiteTemplate } from '../cms/api'
import { PortalFooter, PortalHeader, PortalHome } from './TourPortal'
import { SectionBreadcrumb, SectionNavigation } from './siteNavigation'

const template: SiteTemplate = {
  key: 'MINIMAL', layout: 'BOLD', primaryColor: '#0ea096', siteName: '우리여행',
  headerText: '일상 가까이, 여행은 더 새롭게', footerText: '여행지부터 맛집, 숙소까지 한곳에서.',
  heroImageUrl: '/images/cms/hero-travel-coast.png', heroTitle: '나의 다음 여행',
  heroSubtitle: '새로운 여행을 만나보세요.', heroButtonLabel: '여행 가이드', heroButtonUrl: '/about/company', updatedAt: '',
}
// API 배열 순서와 노출 순서가 달라도 동일한 첫 하위메뉴를 선택해야 한다.
const menus: Menu[] = [
  { id: 9, name: '여행 소식', path: '/support', parentId: null, displayOrder: 30, targetType: 'NONE', targetId: null },
  { id: 3, name: '여행의 가치', path: '/about/vision', parentId: 1, displayOrder: 12, targetType: 'CONTENT', targetId: 2 },
  { id: 1, name: '여행 가이드', path: '/about', parentId: null, displayOrder: 10, targetType: 'NONE', targetId: null },
  { id: 10, name: '공지사항', path: '/support/notices', parentId: 9, displayOrder: 31, targetType: 'BOARD', targetId: 1 },
  { id: 5, name: '자주 묻는 질문', path: '/faq', parentId: null, displayOrder: 20, targetType: 'CONTENT', targetId: 3 },
  { id: 2, name: '우리여행 소개', path: '/about/company', parentId: 1, displayOrder: 11, targetType: 'CONTENT', targetId: 8 },
]

beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value() { this.setAttribute('open', '') } },
    close: { configurable: true, value() { this.removeAttribute('open') } },
  })
})
afterAll(() => {
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

function Location() { const location = useLocation(); return <output aria-label="현재 주소">{location.pathname}{location.search}</output> }
function header(path = '/about/company') {
  return render(<MemoryRouter initialEntries={[path]}><PortalHeader template={template} menus={menus} /><Location /></MemoryRouter>)
}

test('desktop, mobile and sitemap parent links use the first CMS child; leaf links stay intact', () => {
  header()
  for (const name of ['주 메뉴', '모바일 주 메뉴']) {
    const nav = within(screen.getByRole('navigation', { name }))
    expect(nav.getByRole('link', { name: '여행 가이드' })).toHaveAttribute('href', '/about/company')
    expect(nav.getByRole('link', { name: '자주 묻는 질문' })).toHaveAttribute('href', '/faq')
    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual(['여행 가이드', '자주 묻는 질문', '여행 소식'])
  }
  fireEvent.mouseEnter(screen.getByRole('navigation', { name: '주 메뉴' }))
  const sitemap = within(screen.getByRole('navigation', { name: '전체 사이트맵' }))
  expect(sitemap.getByRole('link', { name: '우리여행 소개' })).toBeVisible()
  expect(sitemap.getByRole('link', { name: '공지사항' })).toBeVisible()
  expect(sitemap.getByRole('link', { name: '여행 가이드' })).toHaveAttribute('href', '/about/company')
  fireEvent.click(sitemap.getByRole('link', { name: '공지사항' }))
  expect(screen.getByLabelText('현재 주소')).toHaveTextContent('/support/notices')
  expect(screen.queryByRole('navigation', { name: '전체 사이트맵' })).not.toBeInTheDocument()
})

test('the complete sitemap supports a touch button, keyboard focus and Escape', () => {
  header()
  const button = screen.getByRole('button', { name: '전체 메뉴 열기' })
  fireEvent.click(button)
  expect(button).toHaveAttribute('aria-expanded', 'true')
  fireEvent.keyDown(button, { key: 'Escape' })
  expect(button).toHaveAttribute('aria-expanded', 'false')
  expect(button).toHaveFocus()
  fireEvent.focus(within(screen.getByRole('navigation', { name: '주 메뉴' })).getByRole('link', { name: '여행 가이드' }))
  expect(screen.getByRole('navigation', { name: '전체 사이트맵' })).toBeVisible()
})

test('the header modal sends the same query and category as home to the existing results route', () => {
  header()
  fireEvent.click(screen.getByRole('button', { name: '통합검색 열기' }))
  const dialog = screen.getByRole('dialog', { name: '통합검색' })
  const modal = within(dialog)
  expect(modal.getByLabelText('여행지 검색')).toHaveFocus()
  expect(modal.getAllByRole('tab')).toHaveLength(8)
  const submit = modal.getByRole('button', { name: '검색' })
  const close = modal.getByRole('button', { name: '통합검색 닫기' })
  submit.focus()
  fireEvent.keyDown(submit, { key: 'Tab' })
  expect(close).toHaveFocus()
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
  expect(submit).toHaveFocus()
  fireEvent.click(modal.getByRole('tab', { name: '숙박' }))
  expect(modal.getByLabelText('여행지 검색')).toHaveAttribute('placeholder', '어느 숙소를 찾으시나요?')
  fireEvent.change(modal.getByLabelText('여행지 검색'), { target: { value: '  전주 한옥 & 바다  ' } })
  fireEvent.click(modal.getByRole('button', { name: '검색' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByLabelText('현재 주소')).toHaveTextContent(`/search?${new URLSearchParams({ q: '전주 한옥 & 바다', category: 'stay' })}`)
})

test('search cancellation returns focus without navigation and opening the modal makes no requests', () => {
  const fetcher = vi.spyOn(globalThis, 'fetch')
  header('/search?q=%EC%A0%84%EC%A3%BC&category=food')
  const button = screen.getByRole('button', { name: '통합검색 열기' })
  fireEvent.click(button)
  let dialog = screen.getByRole('dialog', { name: '통합검색' })
  expect(within(dialog).getByLabelText('여행지 검색')).toHaveValue('전주')
  expect(within(dialog).getByRole('tab', { name: '음식' })).toHaveAttribute('aria-selected', 'true')
  fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(button).toHaveFocus()
  expect(screen.getByLabelText('현재 주소')).toHaveTextContent('/search?q=%EC%A0%84%EC%A3%BC&category=food')
  fireEvent.click(button)
  dialog = screen.getByRole('dialog', { name: '통합검색' })
  fireEvent.click(within(dialog).getByRole('button', { name: '통합검색 닫기' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(fetcher).not.toHaveBeenCalled()
  fetcher.mockRestore()
})

test('home shares keyboard category selection and blank queries do not acquire a q parameter', () => {
  render(<MemoryRouter><PortalHome template={template} menus={menus} /><Location /></MemoryRouter>)
  expect(screen.getByRole('link', { name: /여행 가이드\s*메뉴/ })).toHaveAttribute('href', '/about/company')
  fireEvent.keyDown(screen.getByRole('tab', { name: '전체' }), { key: 'ArrowRight' })
  expect(screen.getByRole('tab', { name: '관광지' })).toHaveFocus()
  expect(screen.getByRole('tab', { name: '관광지' })).toHaveAttribute('aria-selected', 'true')
  fireEvent.click(screen.getByRole('button', { name: '검색' }))
  expect(screen.getByLabelText('현재 주소')).toHaveTextContent('/search?category=attraction')
})

test('subpage navigation follows CMS names, hierarchy and order without changing content', () => {
  render(<MemoryRouter><SectionBreadcrumb menu={menus[5]} menus={menus} /><SectionNavigation menu={menus[5]} menus={menus} /></MemoryRouter>)
  const breadcrumbs = within(screen.getByRole('navigation', { name: '현재 위치' }))
  expect(breadcrumbs.getByRole('link', { name: '홈' })).toHaveAttribute('href', '/')
  expect(breadcrumbs.getByRole('link', { name: '여행 가이드' })).toHaveAttribute('href', '/about/company')
  expect(breadcrumbs.getByText('우리여행 소개')).toHaveAttribute('aria-current', 'page')
  const subnav = within(screen.getByRole('navigation', { name: '여행 가이드 하위 메뉴' }))
  expect(subnav.getAllByRole('link').map((link) => link.textContent)).toEqual(['우리여행 소개', '여행의 가치'])
  expect(subnav.getByRole('link', { name: '우리여행 소개' })).toHaveAttribute('aria-current', 'page')
})

test('footer keeps CMS branding and menu destinations, with an empty-menu compatible call', () => {
  const view = render(<MemoryRouter><PortalFooter template={template} menus={menus} /></MemoryRouter>)
  expect(screen.getByRole('contentinfo')).toHaveTextContent(template.footerText)
  expect(within(screen.getByRole('navigation', { name: '사이트 안내' })).getByRole('link', { name: '여행 가이드' })).toHaveAttribute('href', '/about/company')
  expect(screen.getByRole('link', { name: '축제·행사' })).toHaveAttribute('href', '/search?category=event')
  expect(screen.getByRole('contentinfo')).not.toHaveTextContent('Local CMS Demo')
  view.rerender(<MemoryRouter><PortalFooter template={template} /></MemoryRouter>)
  expect(screen.getByRole('contentinfo')).toHaveTextContent(template.siteName)
  expect(screen.queryByRole('navigation', { name: '사이트 안내' })).not.toBeInTheDocument()
})

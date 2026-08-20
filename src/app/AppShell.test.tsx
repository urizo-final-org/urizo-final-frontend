import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import AppShell from './AppShell'

const actorId = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.history.pushState({}, '', '/')
  vi.restoreAllMocks()
})

test('the public URL renders a complete user-facing home page without login', async () => {
  vi.stubGlobal('fetch', publicFetch())
  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: 'Technology for a Better Tomorrow' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'CMS 관리자' })).toHaveAttribute('href', '/admin')
  expect(screen.getAllByRole('link', { name: '소개' }).length).toBeGreaterThan(0)
  expect(screen.getByRole('contentinfo')).toHaveTextContent('AX Bio Studio')
})

test('the admin URL shows the CMS login when no session exists', async () => {
  window.history.pushState({}, '', '/admin')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: { message: 'expired' } }, 401)))
  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: 'CMS 로그인' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '최고관리자' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '일반사용자' })).not.toBeInTheDocument()
})

test('an administrator reaches all five CMS sections', async () => {
  window.history.pushState({}, '', '/admin')
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/refresh') return Promise.resolve(json(session()))
    return Promise.resolve(json([]))
  }))
  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '회원 관리' })).toBeInTheDocument()
  for (const label of ['회원 관리', '메뉴 관리', '컨텐츠 관리', '게시판 관리', '템플릿 관리']) {
    expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
  }
  expect(screen.getByRole('link', { name: /사용자 사이트 열기/ })).toHaveAttribute('href', '/')
})

test('a menu URL renders its mapped static content', async () => {
  window.history.pushState({}, '', '/about/company')
  vi.stubGlobal('fetch', publicFetch())
  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '회사 소개', level: 1 })).toBeInTheDocument()
  expect(await screen.findByText('사람과 기술을 연결합니다')).toBeInTheDocument()
})

function publicFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    if (path === '/api/site/template') return Promise.resolve(json(siteTemplate()))
    if (path === '/api/site/menus') return Promise.resolve(json([
      { id: 1, name: '소개', path: '/about', parentId: null, displayOrder: 10, targetType: 'NONE', targetId: null },
      { id: 2, name: '회사 소개', path: '/about/company', parentId: 1, displayOrder: 11, targetType: 'CONTENT', targetId: 10 },
    ]))
    if (path === '/api/site/boards') return Promise.resolve(json([]))
    if (path === '/api/site/contents/10') return Promise.resolve(json({
      id: 10, authorId: actorId, authorName: '최고 관리자', title: '회사 소개', body: '## 사람과 기술을 연결합니다', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }))
    return Promise.resolve(json([]))
  })
}

function siteTemplate() {
  return {
    key: 'CLASSIC', layout: 'CLASSIC', primaryColor: '#287255', siteName: 'AX Bio Studio',
    headerText: 'Technology · Trust · Growth', footerText: 'AX Bio Studio | 서울특별시 디지털로 123',
    heroImageUrl: '/images/cms/hero-bio.svg', heroTitle: 'Technology for a Better Tomorrow',
    heroSubtitle: '사람과 기술을 연결합니다.', heroButtonLabel: '회사 소개', heroButtonUrl: '/about/company',
    active: true, updatedAt: new Date().toISOString(),
  }
}

function session() {
  return { sessionToken: 'signed-access-jwt-value', expiresAt: new Date(Date.now() + 60_000).toISOString(), actor: { actorId, name: '일반 관리자', role: 'GENERAL_ADMIN' } }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

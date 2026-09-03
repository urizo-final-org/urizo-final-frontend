import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { SITE_UPDATE_EVENT } from '../features/cms/api'
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

test.each(['MINIMAL', 'BOLD', 'CLASSIC'])('the public home renders the %s template layout', async (layout) => {
  vi.stubGlobal('fetch', publicFetch({ ...siteTemplate(), layout }))
  render(<AppShell />)
  expect(await screen.findByRole('region', { name: `${layout} 템플릿 메인` })).toBeInTheDocument()
})

test('an open public page refreshes when CMS data changes', async () => {
  let template = siteTemplate()
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    if (path.startsWith('/api/site/context?path=')) return Promise.resolve(json(siteContext(template)))
    if (path === '/api/site/menus' || path === '/api/site/boards') return Promise.resolve(json([]))
    return Promise.resolve(json([]))
  }))
  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: 'Technology for a Better Tomorrow' })).toBeInTheDocument()

  template = { ...template, heroTitle: 'CMS 변경 즉시 반영' }
  window.dispatchEvent(new Event(SITE_UPDATE_EVENT))
  expect(await screen.findByRole('heading', { name: 'CMS 변경 즉시 반영' })).toBeInTheDocument()
})

test('an initial public Site failure is visible and retry recovers the page', async () => {
  let contextCalls = 0
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    if (path.startsWith('/api/site/context?path=')) {
      contextCalls += 1
      return Promise.resolve(contextCalls === 1
        ? json({ detail: '일시적인 Site 장애입니다.' }, 503)
        : json(siteContext()))
    }
    if (path === '/api/site/menus' || path === '/api/site/boards') return Promise.resolve(json([]))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)

  expect(await screen.findByRole('alert')).toHaveTextContent('일시적인 Site 장애입니다.')
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
  expect(await screen.findByRole('heading', { name: 'Technology for a Better Tomorrow' })).toBeInTheDocument()
  expect(contextCalls).toBe(2)
})

test('an older public Site request cannot overwrite the latest route', async () => {
  window.history.pushState({}, '', '/campaign')
  const campaign = deferred<Response>()
  const eventTemplate = { ...siteTemplate(), siteName: 'Event Site', heroTitle: 'Latest Event Site' }
  const campaignTemplate = { ...siteTemplate(), siteName: 'Campaign Site', heroTitle: 'Stale Campaign Site' }
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    if (path.includes(encodeURIComponent('/campaign'))) return campaign.promise
    if (path.includes(encodeURIComponent('/event'))) return Promise.resolve(json(siteContext(eventTemplate, '/event')))
    if (path === '/api/site/menus' || path === '/api/site/boards') return Promise.resolve(json([]))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  act(() => {
    window.history.pushState({}, '', '/event')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  expect(await screen.findByRole('heading', { name: 'Latest Event Site' })).toBeInTheDocument()

  await act(async () => {
    campaign.resolve(json(siteContext(campaignTemplate, '/campaign')))
    await campaign.promise
  })

  expect(screen.getByRole('heading', { name: 'Latest Event Site' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Stale Campaign Site' })).not.toBeInTheDocument()
})

test('a failed Site transition replaces the stale Site with a retry that can recover', async () => {
  window.history.pushState({}, '', '/campaign')
  let eventCalls = 0
  const campaignTemplate = { ...siteTemplate(), siteName: 'Campaign Site', heroTitle: 'Campaign Home' }
  const eventTemplate = { ...siteTemplate(), siteName: 'Event Site', heroTitle: 'Event Home' }
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    if (path.includes(encodeURIComponent('/campaign'))) return Promise.resolve(json(siteContext(campaignTemplate, '/campaign')))
    if (path.includes(encodeURIComponent('/event'))) {
      eventCalls += 1
      return Promise.resolve(eventCalls === 1
        ? json({ detail: 'Event Site를 불러오지 못했습니다.' }, 503)
        : json(siteContext(eventTemplate, '/event')))
    }
    if (path === '/api/site/menus' || path === '/api/site/boards') return Promise.resolve(json([]))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: 'Campaign Home' })).toBeInTheDocument()

  act(() => {
    window.history.pushState({}, '', '/event')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

  expect(await screen.findByRole('alert')).toHaveTextContent('Event Site를 불러오지 못했습니다.')
  expect(screen.queryByRole('heading', { name: 'Campaign Home' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
  expect(await screen.findByRole('heading', { name: 'Event Home' })).toBeInTheDocument()
  expect(eventCalls).toBe(2)
})

test('the admin URL shows the CMS login when no session exists', async () => {
  window.history.pushState({}, '', '/admin')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: { message: 'expired' } }, 401)))
  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: 'CMS 로그인' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '최고관리자' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '일반사용자' })).not.toBeInTheDocument()
})

test('a configured public path renders that site home and keeps links inside it', async () => {
  window.history.pushState({}, '', '/campaign')
  vi.stubGlobal('fetch', publicFetch(siteTemplate(), '/campaign'))

  render(<AppShell />)

  expect(await screen.findByRole('heading', { name: 'Technology for a Better Tomorrow' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /01 AX Module Studio/ })).toHaveAttribute('href', '/campaign/products/ax-module-studio')
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
  expect(screen.queryByRole('complementary', { name: /자연어 도우미/ })).not.toBeInTheDocument()
})

test('the sidebar consolidates AI model assignment under Agent settings', async () => {
  window.history.pushState({}, '', '/admin/agents')
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/refresh') return Promise.resolve(json(session('SUPER_ADMIN', '최고 관리자')))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: 'Agent 관리' })).toBeInTheDocument()
  const navigation = screen.getByRole('navigation', { name: '관리자 메뉴' })
  expect(within(navigation).queryByRole('button', { name: 'Agent 관리' })).not.toBeInTheDocument()
  expect(within(navigation).getByRole('button', { name: /Agent 설정/ })).toBeInTheDocument()
})

test('only a super administrator can open Agent settings', async () => {
  window.history.pushState({}, '', '/admin/models')
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/refresh') return Promise.resolve(json(session('SUPER_ADMIN', '최고 관리자')))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: 'Agent 설정' })).toBeInTheDocument()
  expect(screen.getByText('최고관리자 전용')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Agent·Workflow' })).toHaveAttribute('aria-selected', 'true')
  const agentSettingsItem = within(screen.getByRole('navigation', { name: '관리자 메뉴' })).getByRole('button', { name: /Agent 설정/ })
  expect(within(agentSettingsItem).queryByText('임시')).not.toBeInTheDocument()
  expect(screen.getByText('실제 API 연결')).toBeInTheDocument()
})

test('a general administrator is redirected away from Agent settings', async () => {
  window.history.pushState({}, '', '/admin/models')
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/refresh') return Promise.resolve(json(session()))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '회원 관리' })).toBeInTheDocument()
  expect(within(screen.getByRole('navigation', { name: '관리자 메뉴' })).queryByRole('button', { name: /Agent 설정/ })).not.toBeInTheDocument()
})

test('only a super administrator can open system settings', async () => {
  window.history.pushState({}, '', '/admin/system-settings')
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    if (path === '/api/auth/refresh') return Promise.resolve(json(session('SUPER_ADMIN', '최고 관리자')))
    if (path === '/api/admin/cms/settings') return Promise.resolve(json({ defaultSiteKey: 'main', defaultTemplateKey: 'CLASSIC', updatedAt: new Date().toISOString() }))
    if (path === '/api/admin/cms/sites') return Promise.resolve(json([cmsSite()]))
    if (path === '/api/cms/templates') return Promise.resolve(json([siteTemplate()]))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '시스템 설정' })).toBeInTheDocument()
  const navigation = screen.getByRole('navigation', { name: '관리자 메뉴' })
  const systemSettingsItem = within(navigation).getByRole('button', { name: /시스템 설정/ })
  expect(within(systemSettingsItem).queryByText('임시')).not.toBeInTheDocument()
  expect(screen.getByText('API 연결')).toBeInTheDocument()
  expect(await screen.findByLabelText('기본 사이트')).toHaveValue('main')
})

test('a general administrator is redirected away from system settings', async () => {
  window.history.pushState({}, '', '/admin/system-settings')
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/refresh') return Promise.resolve(json(session()))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '회원 관리' })).toBeInTheDocument()
  const navigation = screen.getByRole('navigation', { name: '관리자 메뉴' })
  expect(within(navigation).queryByRole('button', { name: /시스템 설정/ })).not.toBeInTheDocument()
})

test('only a super administrator can open site management', async () => {
  window.history.pushState({}, '', '/admin/sites')
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    if (path === '/api/auth/refresh') return Promise.resolve(json(session('SUPER_ADMIN', '최고 관리자')))
    if (path === '/api/admin/cms/sites') return Promise.resolve(json([cmsSite()]))
    if (path === '/api/cms/templates') return Promise.resolve(json([siteTemplate()]))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '사이트 관리' })).toBeInTheDocument()
  const navigation = screen.getByRole('navigation', { name: '관리자 메뉴' })
  expect(within(navigation).getByRole('button', { name: /사이트 관리/ })).toBeInTheDocument()
  expect(screen.queryByText('임시 목업')).not.toBeInTheDocument()
  expect(await screen.findByLabelText('사이트명')).toHaveValue('AX Bio Studio')
})

test('a general administrator is redirected away from site management', async () => {
  window.history.pushState({}, '', '/admin/sites')
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/refresh') return Promise.resolve(json(session()))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '회원 관리' })).toBeInTheDocument()
  const navigation = screen.getByRole('navigation', { name: '관리자 메뉴' })
  expect(within(navigation).queryByRole('button', { name: /사이트 관리/ })).not.toBeInTheDocument()
})

test.each([
  ['/admin/menus', '메뉴 관리', '메뉴 AI', '컨텐츠 본문, 게시글, 템플릿은 변경하지 않아요.'],
  ['/admin/contents', '컨텐츠 관리', '컨텐츠 AI', '메뉴 구조, 게시판·게시글, 템플릿은 변경하지 않아요.'],
  ['/admin/boards', '게시판 관리', '게시판 AI', '메뉴 연결, 정적 컨텐츠, 템플릿은 변경하지 않아요.'],
  ['/admin/templates', '템플릿 관리', '템플릿 AI', '메뉴, 컨텐츠 본문, 게시판·게시글은 변경하지 않아요.'],
])('%s shows a page-scoped AI panel', async (path, section, assistant, excluded) => {
  window.history.pushState({}, '', path)
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/refresh') return Promise.resolve(json(session()))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: section })).toBeInTheDocument()
  const panel = screen.getByRole('complementary', { name: `${section} 자연어 도우미` })
  expect(within(panel).getByRole('heading', { name: assistant })).toBeInTheDocument()
  expect(within(panel).getByText('현재 화면 전용')).toBeInTheDocument()
  expect(within(panel).getByText(excluded)).toBeInTheDocument()
  expect(within(panel).getByText('목록에서 항목을 선택하면 그 대상에 적용합니다.')).toBeInTheDocument()
  expect(within(panel).getByRole('button', { name: '요청 분석하기' })).toBeDisabled()
})

test('the assistant asks which item to change when no target is selected', async () => {
  window.history.pushState({}, '', '/admin/contents')
  const contents = [
    { id: 1, authorId: actorId, authorName: '관리자', title: '회사 소개', body: '본문', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z' },
    { id: 2, authorId: actorId, authorName: '관리자', title: '회사 연혁', body: '본문', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z' },
    { id: 3, authorId: actorId, authorName: '관리자', title: '문의하기', body: '본문', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z' },
  ]
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/auth/refresh') return Promise.resolve(json(session()))
    if (url === '/api/cms/contents') return Promise.resolve(json(contents))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '컨텐츠 관리' })).toBeInTheDocument()
  const panel = screen.getByRole('complementary', { name: '컨텐츠 관리 자연어 도우미' })

  const submit = within(panel).getByRole('button', { name: '요청 분석하기' })
  expect(submit).toBeDisabled()

  fireEvent.change(within(panel).getByPlaceholderText('CMS 변경 요청을 입력하세요'), { target: { value: '회사 소개 본문 다듬어줘' } })
  expect(submit).toBeEnabled()
  fireEvent.click(submit)

  expect(await within(panel).findByText('어느 것을 바꿀까요?')).toBeInTheDocument()
  expect(within(panel).getByRole('button', { name: '회사 소개' })).toBeInTheDocument()
  expect(within(panel).getByRole('button', { name: '회사 연혁' })).toBeInTheDocument()
  expect(within(panel).queryByRole('button', { name: '문의하기' })).not.toBeInTheDocument()
})

test('the assistant only accepts requests on the screens that support them', async () => {
  window.history.pushState({}, '', '/admin/boards')
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/refresh') return Promise.resolve(json(session()))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '게시판 관리' })).toBeInTheDocument()
  const panel = screen.getByRole('complementary', { name: '게시판 관리 자연어 도우미' })
  expect(within(panel).getByText('게시판 관리 화면은 아직 자연어 변경을 지원하지 않습니다.')).toBeInTheDocument()
})

test('the menu assistant opens and offers a new menu beside the existing ones', async () => {
  window.history.pushState({}, '', '/admin/menus')
  const menus = [
    { id: 10, name: '소개', path: '/about', parentId: null, displayOrder: 10, targetType: 'NONE', targetId: null },
    { id: 11, name: '회사 소개', path: '/about/company', parentId: 10, displayOrder: 11, targetType: 'CONTENT', targetId: 3 },
  ]
  const contents = [
    { id: 3, authorId: actorId, authorName: '관리자', title: '회사 소개', body: '본문', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' },
  ]
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/auth/refresh') return Promise.resolve(json(session()))
    if (url === '/api/cms/menus') return Promise.resolve(json(menus))
    if (url === '/api/cms/contents') return Promise.resolve(json(contents))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '메뉴 관리' })).toBeInTheDocument()
  const panel = screen.getByRole('complementary', { name: '메뉴 관리 자연어 도우미' })
  expect(within(panel).queryByText('메뉴 관리 화면은 아직 자연어 변경을 지원하지 않습니다.')).not.toBeInTheDocument()
  expect(within(panel).getByText('선택하지 않고 요청하면 새 메뉴 만들기를 고를 수 있어요.')).toBeInTheDocument()

  /** 경로와 연결은 따로 읽힌다. 유형은 표로, 대상 이름은 그 옆에 둔다. */
  const linked = await screen.findByRole('button', { name: /\/about\/company/ })
  expect(within(linked).getByText('/about/company')).toBeInTheDocument()
  expect(within(linked).getByText('컨텐츠')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /연결 없음/ })).toBeInTheDocument()

  fireEvent.change(within(panel).getByPlaceholderText('CMS 변경 요청을 입력하세요'), { target: { value: '자료실 메뉴 만들어 줘' } })
  fireEvent.click(within(panel).getByRole('button', { name: '요청 분석하기' }))

  expect(await within(panel).findByText('어느 것을 바꿀까요?')).toBeInTheDocument()
  expect(within(panel).getByRole('button', { name: '새 메뉴 만들기' })).toBeInTheDocument()
})

test('the menu assistant waits for the preview the pipeline fills in later', async () => {
  window.history.pushState({}, '', '/admin/menus')
  const profileVersionId = '99999999-9999-4999-8999-999999999999'
  const jobId = '88888888-8888-4888-8888-888888888888'
  const menus = [
    { id: 10, name: '소개', path: '/about', parentId: null, displayOrder: 10, targetType: 'NONE', targetId: null },
    { id: 40, name: '고객지원', path: '/support', parentId: null, displayOrder: 40, targetType: 'NONE', targetId: null },
  ]
  /** 생성 응답에는 미리보기가 없다. 다시 읽었을 때 채워져 있어야 화면이 넘어간다. */
  const created = {
    schemaVersion: '1.0',
    jobId,
    traceId: '77777777-7777-4777-8777-777777777777',
    profileVersionId,
    pipelineAttempt: 1,
    stateVersion: 1,
    status: 'ACTIVE',
    requestText: '상위 메뉴 없이 "자료실" 메뉴를 새로 만들어 줘',
    resource: { type: 'MENU', id: 'new' },
    structuredCommand: null,
    previewId: null,
    previewHash: null,
    previewValid: false,
    approvalDecision: null,
    approvalFeedback: null,
    createdAt: '2026-09-02T09:00:00Z',
    updatedAt: '2026-09-02T09:00:00Z',
  }
  const previewed = {
    ...created,
    status: 'WAITING_APPROVAL',
    previewId: '66666666-6666-4666-8666-666666666666',
    previewHash: `sha256:${'a'.repeat(64)}`,
    previewValid: true,
    structuredCommand: {
      operation: 'CREATE',
      fields: { name: '자료실', path: '/support/archive', parentId: 40 },
    },
  }
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/auth/refresh') return Promise.resolve(json(session('SUPER_ADMIN', '최고 관리자')))
    if (url === '/api/cms/menus') return Promise.resolve(json(menus))
    if (url.startsWith('/api/admin/ai/profile-versions')) {
      return Promise.resolve(json([{ profileVersionId, profileKey: 'NATURAL_CMS', status: 'ACTIVE' }]))
    }
    if (url === '/api/natural-cms/jobs') return Promise.resolve(json(created))
    if (url === `/api/natural-cms/jobs/${jobId}`) return Promise.resolve(json(previewed))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '메뉴 관리' })).toBeInTheDocument()
  const panel = screen.getByRole('complementary', { name: '메뉴 관리 자연어 도우미' })

  fireEvent.change(within(panel).getByPlaceholderText('CMS 변경 요청을 입력하세요'), { target: { value: '자료실 메뉴 만들어 줘' } })
  fireEvent.click(within(panel).getByRole('button', { name: '요청 분석하기' }))
  fireEvent.click(await within(panel).findByRole('button', { name: '새 메뉴 만들기' }))

  expect(await within(panel).findByText('승인 대기')).toBeInTheDocument()

  fireEvent.click(within(panel).getByRole('button', { name: '변경 내용 자세히 보기' }))
  const modal = await screen.findByRole('dialog', { name: '메뉴 관리 변경 미리보기' })
  expect(within(modal).getByText('자료실')).toBeInTheDocument()
  expect(within(modal).getByText('추가')).toBeInTheDocument()
  expect(within(modal).queryByText('아직 변경 내용을 받지 못했습니다.')).not.toBeInTheDocument()
})

test('the page-scoped AI panel collapses to a rail and expands again', async () => {
  window.history.pushState({}, '', '/admin/menus')
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/refresh') return Promise.resolve(json(session()))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  await screen.findByRole('heading', { name: '메뉴 관리' })
  const expanded = screen.getByRole('complementary', { name: '메뉴 관리 자연어 도우미' })
  fireEvent.click(within(expanded).getByRole('button', { name: '메뉴 AI 패널 접기' }))

  const collapsed = screen.getByRole('complementary', { name: '메뉴 관리 자연어 도우미' })
  expect(within(collapsed).getByRole('button', { name: '메뉴 AI 패널 펼치기' })).toHaveAttribute('aria-expanded', 'false')
  expect(within(collapsed).queryByText('현재 화면 전용')).not.toBeInTheDocument()

  fireEvent.click(within(collapsed).getByRole('button', { name: '메뉴 AI 패널 펼치기' }))
  expect(within(screen.getByRole('complementary', { name: '메뉴 관리 자연어 도우미' })).getByRole('button', { name: '메뉴 AI 패널 접기' })).toHaveAttribute('aria-expanded', 'true')
})

test('an administrator previews a template and saves only contract fields', async () => {
  window.history.pushState({}, '', '/admin/templates')
  const bold = { ...siteTemplate(), key: 'BOLD', layout: 'BOLD', siteName: 'AX Creative' }
  let savedBody: Record<string, unknown> | null = null
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (path === '/api/auth/refresh') return Promise.resolve(json(session()))
    if (path === '/api/cms/templates' && !init?.method) return Promise.resolve(json([siteTemplate(), bold]))
    if (path === '/api/cms/templates/BOLD' && init?.method === 'PUT') {
      savedBody = JSON.parse(String(init.body)) as Record<string, unknown>
      return Promise.resolve(json({ ...bold, ...savedBody }))
    }
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '템플릿 관리' })).toBeInTheDocument()
  expect(await screen.findByText('Header와 메인 영역의 배치·여백·강조 방식을 선택합니다.')).toBeInTheDocument()
  expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'BOLD 템플릿 미리보기' }))
  expect(screen.getByRole('dialog', { name: 'BOLD 템플릿 미리보기' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '닫기' }))

  fireEvent.click(screen.getByRole('button', { name: 'BOLD 템플릿 선택' }))
  fireEvent.click(await screen.findByRole('button', { name: '템플릿 저장' }))
  await waitFor(() => expect(savedBody).not.toBeNull())
  const status = await screen.findByRole('status')
  expect(status).toHaveTextContent('템플릿을 저장했습니다.')
  expect(status).toHaveClass('cms-success-toast')
  expect(window.localStorage.getItem(SITE_UPDATE_EVENT)).toBeTruthy()
  expect(Object.keys(savedBody ?? {}).sort()).toEqual([
    'footerText', 'headerText', 'heroButtonLabel', 'heroButtonUrl', 'heroImageUrl', 'heroSubtitle',
    'heroTitle', 'layout', 'primaryColor', 'siteName',
  ])
})

test('an administrator sees a clear template save failure', async () => {
  window.history.pushState({}, '', '/admin/templates')
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (path === '/api/auth/refresh') return Promise.resolve(json(session()))
    if (path === '/api/cms/templates' && !init?.method) return Promise.resolve(json([siteTemplate()]))
    if (path === '/api/cms/templates/CLASSIC' && init?.method === 'PUT') return Promise.resolve(json({ detail: '입력값을 확인하세요.' }, 400))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '템플릿 관리' })).toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button', { name: '템플릿 저장' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('템플릿을 저장하지 못했습니다. 입력값을 확인하세요.')
})

test('a menu URL renders its mapped static content', async () => {
  window.history.pushState({}, '', '/about/company')
  vi.stubGlobal('fetch', publicFetch())
  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '회사 소개', level: 1 })).toBeInTheDocument()
  expect(await screen.findByText('사람과 기술을 연결합니다')).toBeInTheDocument()
})

function publicFetch(template = siteTemplate(), publicPath = '/') {
  return vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    if (path.startsWith('/api/site/context?path=')) return Promise.resolve(json(siteContext(template, publicPath)))
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
    updatedAt: new Date().toISOString(),
  }
}

function siteContext(template = siteTemplate(), publicPath = '/') {
  return { key: 'main', name: template.siteName, publicPath, template }
}

function cmsSite() {
  return {
    key: 'main', name: 'AX Bio Studio', publicPath: '/', templateKey: 'CLASSIC',
    enabled: true, defaultSite: true, updatedAt: new Date().toISOString(),
  }
}

function session(role: 'SUPER_ADMIN' | 'GENERAL_ADMIN' = 'GENERAL_ADMIN', name = '일반 관리자') {
  return { sessionToken: 'signed-access-jwt-value', expiresAt: new Date(Date.now() + 60_000).toISOString(), actor: { actorId, name, role } }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((onResolve) => { resolve = onResolve })
  return { promise, resolve }
}

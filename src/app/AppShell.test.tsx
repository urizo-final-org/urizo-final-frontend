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

test('the public URL renders the tour portal home without login, isolated from the admin theme', async () => {
  // dev가 추가한 테마 격리 검사를 유지한다 — 관리자 다크 테마가 사이트로 새면 안 된다.
  window.localStorage.setItem('axms-admin-theme', 'dark')
  vi.stubGlobal('fetch', publicFetch())
  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '어디로 떠나볼까요?' })).toBeInTheDocument()
  const header = within(screen.getByRole('banner'))
  expect(header.getByRole('link', { name: /AX Bio Studio/ })).toHaveAttribute('href', '/')
  expect(header.getByText('Technology · Trust · Growth')).toBeInTheDocument()
  expect(header.getByRole('link', { name: 'CMS 관리자' })).toHaveAttribute('href', '/admin')
  const menu = within(header.getByRole('navigation', { name: '주 메뉴' }))
  expect(menu.getByRole('link', { name: '소개' })).toHaveAttribute('href', '/about')
  expect(menu.getByRole('link', { name: '회사 소개' })).toHaveAttribute('href', '/about/company')
  const cmsHero = within(screen.getByRole('region', { name: 'CLASSIC 템플릿 메인' }))
  expect(cmsHero.getByRole('heading', { name: 'Technology for a Better Tomorrow' })).toBeInTheDocument()
  expect(cmsHero.getByText('사람과 기술을 연결합니다.')).toBeInTheDocument()
  expect(cmsHero.getByRole('link', { name: /회사 소개/ })).toHaveAttribute('href', '/about/company')
  const footer = within(screen.getByRole('contentinfo'))
  expect(footer.getByText('AX Bio Studio | 서울특별시 디지털로 123')).toBeInTheDocument()
  expect(footer.getByText('© 2026 AX Bio Studio. Local CMS Demo.')).toBeInTheDocument()
  // 홈 섹션은 코퍼스 집계 상위 3개 카테고리다. 근거 없는 큐레이션 제목을 쓰지 않는다.
  for (const section of ['관광지', '음식', '숙박']) {
    expect(screen.getByRole('heading', { name: section, level: 2 })).toBeInTheDocument()
  }
  // 검색·챗봇은 배선됐지만 홈 큐레이션은 여전히 고정이다. 고지가 그 구분을 정확히 말해야 한다.
  expect(within(screen.getByRole('note')).getByText('샘플 데이터 · 추천 목록은 고정입니다')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '관광 도우미 열기' })).toBeInTheDocument()
  // 탭은 확정 8종이다. 시안이 6종이어도 이 개수를 따라가지 않는다.
  const tabs = within(screen.getByRole('tablist', { name: '여행 검색 카테고리' })).getAllByRole('tab')
  expect(tabs.map((tab) => tab.textContent)).toEqual(['전체', '관광지', '숙박', '음식', '체험·레저', '추천코스', '쇼핑', '축제·행사'])
  // dev가 추가한 테마 격리 검사. 포털 색 토큰이 .site-app 스코프에 있으므로 이 래퍼가 곧 전제다.
  expect(document.querySelector('.site-app')).toBeInTheDocument()
  expect(document.querySelector('.admin-app')).not.toBeInTheDocument()
})

test('a home search moves to the results screen with a side filter', async () => {
  vi.stubGlobal('fetch', publicFetch())
  render(<AppShell />)
  fireEvent.change(await screen.findByPlaceholderText('어디로 떠나볼까요?'), { target: { value: '전주 한옥스테이' } })
  fireEvent.click(screen.getByRole('button', { name: '검색' }))
  // 조사는 받침으로 고른다 — '한옥스테이'는 받침이 없으므로 '와'.
  expect(await screen.findByRole('heading', { name: /“전주 한옥스테이”와 일치하는 검색 결과/ })).toBeInTheDocument()
  // 건수는 단언하지 않는다. citations 길이는 서버가 정하고(CITATION_LIMIT 이하) 화면 결정이 아니다.
  // 400ms 디바운스가 있어 카드는 즉시 나오지 않는다.
  await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0), { timeout: 3000 })
  const filter = () => screen.getByRole('complementary', { name: '검색 필터' })
  expect(within(filter()).getAllByRole('button')).toHaveLength(8)
  fireEvent.click(within(filter()).getByRole('button', { name: '숙박' }))
  await waitFor(() => expect(within(filter()).getByRole('button', { name: '숙박' })).toHaveAttribute('aria-current', 'true'))
  // 탭 전환은 프론트 필터링이 아니라 category 파라미터가 붙은 재검색 URL이다(I7 연동 지점).
  expect(window.location.search).toContain('category=stay')
  expect(window.location.search).toContain('q=')
})

test('the results screen sends the selected tab to the server as category prefixes', async () => {
  window.history.pushState({}, '', '/search?q=%EC%9E%90%EC%97%B0&category=attraction')
  const fetcher = publicFetch()
  vi.stubGlobal('fetch', fetcher)
  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: /“자연”과 일치하는 검색 결과/ })).toBeInTheDocument()

  // 탭 필터는 프론트에서 거르지 않고 서버로 간다. 상위 N건을 받아 프론트에서 거르면
  // 결과가 0건이 되기 쉽다 — WHERE가 ORDER BY·LIMIT보다 먼저라 "필터 후 상위 N건"은
  // 서버에서만 성립한다.
  await waitFor(() => {
    const call = fetcher.mock.calls.find(([input]) => String(input) === '/api/public/chat/query')
    expect(call).toBeDefined()
    const body = JSON.parse(String((call?.[1] as RequestInit).body))
    expect(body.query).toBe('자연')
    // '관광지'는 접두 하나로 표현되지 않는다 — 단일 값 계약이었다면 이 탭이 깨진다.
    expect(body.category).toEqual(['NA', 'HS', 'VE'])
  }, { timeout: 3000 })
})

test('the results screen keeps a refusal out of the error path', async () => {
  window.history.pushState({}, '', '/search?q=%EB%B9%84%ED%8A%B8%EC%BD%94%EC%9D%B8')
  vi.stubGlobal('fetch', publicFetch(siteTemplate(), '/', {
    body: chatAnswer({ outcome: 'REFUSED', answer: '근거를 찾지 못했습니다.', citations: [] }),
  }))
  render(<AppShell />)
  // 거절은 RAG가 제대로 동작한 결과다. 장애 문구·재시도 버튼을 붙이면 성과가 장애로 보인다.
  expect(await screen.findByText('근거 문서를 찾지 못했습니다', undefined, { timeout: 3000 })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
})

test('the results screen asks for a query instead of calling the API with an empty one', async () => {
  window.history.pushState({}, '', '/search?category=stay')
  const fetcher = publicFetch()
  vi.stubGlobal('fetch', fetcher)
  render(<AppShell />)
  expect(await screen.findByText('검색어를 입력해 주세요')).toBeInTheDocument()
  // F7: 탭만 눌러 들어온 화면에서 빈 질의를 보내지 않는다(rate limit 예산 낭비).
  await new Promise((resolve) => setTimeout(resolve, 600))
  expect(fetcher.mock.calls.some(([input]) => String(input) === '/api/public/chat/query')).toBe(false)
})

test('the results screen never shows a score, rating or review count', async () => {
  window.history.pushState({}, '', '/search?q=%EC%A0%84%EC%A3%BC')
  vi.stubGlobal('fetch', publicFetch())
  render(<AppShell />)
  await screen.findByRole('complementary', { name: '검색 필터' })
  // F2: 원점수·정규화·별점 환산 어느 형태로도 노출하지 않는다.
  expect(document.body.textContent).not.toMatch(/[★☆]|\d건의 리뷰|\d\.\d\s*점/)
})

test('the home search placeholder follows the selected tab', async () => {
  vi.stubGlobal('fetch', publicFetch())
  render(<AppShell />)
  const tablist = within(await screen.findByRole('tablist', { name: '여행 검색 카테고리' }))
  const field = () => screen.getByLabelText('여행지 검색')
  expect(field()).toHaveAttribute('placeholder', '어디로 떠나볼까요?')
  // 시안 원문 6종 + 시안에 없어 팀이 정한 2종(전체·축제·행사).
  fireEvent.click(tablist.getByRole('tab', { name: '숙박' }))
  expect(field()).toHaveAttribute('placeholder', '어느 숙소를 찾으시나요?')
  fireEvent.click(tablist.getByRole('tab', { name: '추천코스' }))
  expect(field()).toHaveAttribute('placeholder', '어떤 여행 코스를 찾으시나요?')
  fireEvent.click(tablist.getByRole('tab', { name: '축제·행사' }))
  expect(field()).toHaveAttribute('placeholder', '어떤 축제를 찾으시나요?')
})

test('a home tab selection carries its category into the search', async () => {
  vi.stubGlobal('fetch', publicFetch())
  render(<AppShell />)
  const tablist = within(await screen.findByRole('tablist', { name: '여행 검색 카테고리' }))
  // 시안대로 탭 클릭은 선택 상태만 바꾸고, 이동은 검색 제출에서 일어난다.
  fireEvent.click(tablist.getByRole('tab', { name: '숙박' }))
  expect(tablist.getByRole('tab', { name: '숙박' })).toHaveAttribute('aria-selected', 'true')
  expect(window.location.pathname).toBe('/')

  fireEvent.click(screen.getByRole('button', { name: '검색' }))
  await waitFor(() => expect(window.location.pathname).toBe('/search'))
  expect(window.location.search).toBe('?category=stay')
})

test('the tour helper opens as a floating panel and closes back to the launcher', async () => {
  vi.stubGlobal('fetch', publicFetch())
  render(<AppShell />)
  fireEvent.click(await screen.findByRole('button', { name: '관광 도우미 열기' }))
  const panel = screen.getByRole('complementary', { name: '관광 도우미' })
  // 배선 후에는 입력이 열려 있다. 열린 입력이 곧 "실제로 동작한다"는 약속이다.
  expect(within(panel).getByLabelText('관광 도우미 메시지')).toBeEnabled()
  // 대화 전에는 근거 섹션이 없다 — 빈 헤더를 남기지 않는다.
  expect(within(panel).queryByText('답변 근거')).not.toBeInTheDocument()
  fireEvent.click(within(panel).getByRole('button', { name: '관광 도우미 닫기' }))
  expect(screen.queryByRole('complementary', { name: '관광 도우미' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '관광 도우미 열기' })).toBeInTheDocument()
})

test('the tour helper states that it answers only from collected documents', async () => {
  vi.stubGlobal('fetch', publicFetch())
  render(<AppShell />)
  await screen.findByRole('button', { name: '관광 도우미 열기' })
  // 닫힌 상태에서는 고지가 없다. 홈 큐레이션 고지와 문구가 달라 서로 잡히지 않는다.
  expect(screen.queryByText(/근거 문서에서 찾은 내용만 답합니다/)).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '관광 도우미 열기' }))
  const panel = within(screen.getByRole('complementary', { name: '관광 도우미' }))
  // 고지는 스크롤 영역 밖에 있어 대화를 내려도 사라지지 않는다(F8-a가 정한 위치).
  expect(panel.getByRole('note')).toHaveTextContent('근거 문서에서 찾은 내용만 답합니다')
})

test('the tour helper answers a question with its citations', async () => {
  vi.stubGlobal('fetch', publicFetch())
  render(<AppShell />)
  fireEvent.click(await screen.findByRole('button', { name: '관광 도우미 열기' }))
  const panel = () => within(screen.getByRole('complementary', { name: '관광 도우미' }))
  fireEvent.change(panel().getByLabelText('관광 도우미 메시지'), { target: { value: '전주 한옥스테이 추천해줘' } })
  fireEvent.click(panel().getByRole('button', { name: '전송' }))

  // 질문 말풍선은 응답을 기다리지 않고 바로 그린다.
  expect(panel().getByText('전주 한옥스테이 추천해줘')).toBeInTheDocument()
  expect(await screen.findByText('전주 한옥마을 인근에 한옥 숙소가 있습니다.')).toBeInTheDocument()
  expect(panel().getByText('답변 근거')).toBeInTheDocument()
  expect(panel().getByText('더 한옥')).toBeInTheDocument()
  // 「홈페이지」는 excerpt의 [홈페이지] 줄에서 나온다. sourceUrl은 합성 주소라 쓰지 않는다(R26).
  expect(panel().getByRole('link', { name: /홈페이지/ })).toHaveAttribute('href', 'http://thehanok.modoo.at')
  expect(screen.queryByText(/api-test\.local/)).not.toBeInTheDocument()
})

test('the tour helper carries the previous question into the next turn', async () => {
  const fetcher = publicFetch()
  vi.stubGlobal('fetch', fetcher)
  render(<AppShell />)
  fireEvent.click(await screen.findByRole('button', { name: '관광 도우미 열기' }))
  const panel = () => within(screen.getByRole('complementary', { name: '관광 도우미' }))

  fireEvent.change(panel().getByLabelText('관광 도우미 메시지'), { target: { value: '전주 한옥스테이 추천해줘' } })
  fireEvent.click(panel().getByRole('button', { name: '전송' }))
  await screen.findByText('전주 한옥마을 인근에 한옥 숙소가 있습니다.')

  fireEvent.change(panel().getByLabelText('관광 도우미 메시지'), { target: { value: '거기 주차 되나요?' } })
  fireEvent.click(panel().getByRole('button', { name: '전송' }))

  await waitFor(() => {
    const bodies = fetcher.mock.calls
      .filter(([input]) => String(input) === '/api/public/chat/query')
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)))
    expect(bodies).toHaveLength(2)
    // 첫 턴에는 문맥이 없다. 여기에 값이 실리면 자기 질문을 자기 문맥으로 보낸 것이다.
    expect('previousQuery' in bodies[0]).toBe(false)
    // 대명사만 남은 후속 질문이 직전 주제를 찾으려면 이 값이 서버까지 가야 한다.
    expect(bodies[1]).toMatchObject({ query: '거기 주차 되나요?', previousQuery: '전주 한옥스테이 추천해줘' })
    // 문맥은 클라이언트가 들고 온다 — 서버가 대화를 기억하는 것처럼 보이면 안 된다.
    expect(bodies[1].conversationId).toBeNull()
  }, { timeout: 3000 })
})

test('the tour helper locks its input while the rate limit holds', async () => {
  // 실서버 실측(9/6): 30회 통과 → 31번째 429 · retryAfterMs 60000. 그 봉투를 그대로 쓴다.
  vi.stubGlobal('fetch', publicFetch(siteTemplate(), '/', {
    status: 429,
    body: { schemaVersion: '1.0', traceId: '44444444-4444-4444-8444-444444444444', error: { code: 'RATE_LIMITED', message: 'Too many public chat requests from this client.', retryable: true, retryAfterMs: 60_000 } },
  }))
  render(<AppShell />)
  fireEvent.click(await screen.findByRole('button', { name: '관광 도우미 열기' }))
  const panel = () => within(screen.getByRole('complementary', { name: '관광 도우미' }))
  fireEvent.change(panel().getByLabelText('관광 도우미 메시지'), { target: { value: '전주 축제' } })
  fireEvent.click(panel().getByRole('button', { name: '전송' }))

  expect(await screen.findByText('요청이 많습니다')).toBeInTheDocument()
  expect(screen.getByText('60초 후 다시 시도해 주세요.')).toBeInTheDocument()
  // 잠그지 않으면 사용자가 계속 눌러 같은 429를 반복해 받고, 검색과 예산을 나눠 쓰는
  // 구조라 검색까지 막힌다. 재시도 버튼도 붙이지 않는다.
  await waitFor(() => expect(panel().getByLabelText('관광 도우미 메시지')).toBeDisabled())
  expect(panel().getByRole('button', { name: '전송' })).toBeDisabled()
})

test('the tour helper shows a refusal without an evidence section', async () => {
  vi.stubGlobal('fetch', publicFetch(siteTemplate(), '/', {
    body: chatAnswer({ outcome: 'REFUSED', answer: '근거를 찾지 못했습니다.', citations: [] }),
  }))
  render(<AppShell />)
  fireEvent.click(await screen.findByRole('button', { name: '관광 도우미 열기' }))
  const panel = () => within(screen.getByRole('complementary', { name: '관광 도우미' }))
  fireEvent.change(panel().getByLabelText('관광 도우미 메시지'), { target: { value: '비트코인 시세 알려줘' } })
  fireEvent.click(panel().getByRole('button', { name: '전송' }))

  expect(await screen.findByText('근거 문서를 찾지 못했습니다')).toBeInTheDocument()
  expect(panel().queryByText('답변 근거')).not.toBeInTheDocument()
})

test.each(['MINIMAL', 'BOLD', 'CLASSIC'])('the tour portal renders its CMS %s hero layout', async (layout) => {
  vi.stubGlobal('fetch', publicFetch({ ...siteTemplate(), layout }))
  render(<AppShell />)
  expect(await screen.findByRole('region', { name: `${layout} 템플릿 메인` })).toBeInTheDocument()
})

// publicPath가 지정된 부속 사이트의 기존 Template Renderer도 계속 유지한다.
test.each(['MINIMAL', 'BOLD', 'CLASSIC'])('a configured sub-site home renders the %s template layout', async (layout) => {
  window.history.pushState({}, '', '/campaign')
  vi.stubGlobal('fetch', publicFetch({ ...siteTemplate(), layout }, '/campaign'))
  render(<AppShell />)
  expect(await screen.findByRole('region', { name: `${layout} 템플릿 메인` })).toBeInTheDocument()
})

test('an open portal refreshes its CMS presentation when CMS data changes', async () => {
  let template = siteTemplate()
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    if (path.startsWith('/api/site/context?path=')) return Promise.resolve(json(siteContext(template)))
    if (path === '/api/site/menus' || path === '/api/site/boards') return Promise.resolve(json([]))
    return Promise.resolve(json([]))
  }))
  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: 'Technology for a Better Tomorrow' })).toBeInTheDocument()

  template = {
    ...template,
    primaryColor: '#6b3fa0',
    siteName: 'CMS 여행 포털',
    headerText: 'CMS 헤더 변경',
    footerText: 'CMS 푸터 변경',
    heroTitle: 'CMS 변경 즉시 반영',
  }
  act(() => window.dispatchEvent(new Event(SITE_UPDATE_EVENT)))
  expect(await screen.findByRole('heading', { name: 'CMS 변경 즉시 반영' })).toBeInTheDocument()
  expect(within(screen.getByRole('banner')).getByRole('link', { name: /CMS 여행 포털/ })).toBeInTheDocument()
  expect(within(screen.getByRole('banner')).getByText('CMS 헤더 변경')).toBeInTheDocument()
  expect(within(screen.getByRole('contentinfo')).getByText('CMS 푸터 변경')).toBeInTheDocument()
  const portal = document.querySelector('.site-app > div') as HTMLElement
  expect(portal.style.getPropertyValue('--primary')).toBe('#6b3fa0')
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
  expect(await screen.findByRole('heading', { name: '어디로 떠나볼까요?' })).toBeInTheDocument()
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
  const adminRoot = document.querySelector('.admin-app')
  expect(adminRoot).toHaveAttribute('data-admin-theme', 'light')
  expect(document.querySelector('.site-app')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '다크 테마 사용' }))
  expect(adminRoot).toHaveAttribute('data-admin-theme', 'dark')
  expect(window.localStorage.getItem('axms-admin-theme')).toBe('dark')
  expect(screen.getByRole('button', { name: '라이트 테마 사용' })).toHaveAttribute('aria-pressed', 'true')
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

/** 마지막 값은 대상을 고르지 않았을 때의 안내다. 등록 경로가 열린 화면만 문구가 다르다. */
test.each([
  ['/admin/menus', '메뉴 관리', '메뉴 AI', '컨텐츠 본문, 게시글, 템플릿은 변경하지 않아요.', '목록에서 고르거나, 바로 요청해 새 메뉴를 만들 수 있어요.'],
  ['/admin/contents', '컨텐츠 관리', '컨텐츠 AI', '메뉴 구조, 게시판·게시글, 템플릿은 변경하지 않아요.', '목록에서 고르거나, 바로 요청해 새 컨텐츠를 만들 수 있어요.'],
  ['/admin/boards', '게시판 관리', '게시판 AI', '메뉴 연결, 정적 컨텐츠, 템플릿은 변경하지 않아요.', '목록에서 고르거나, 바로 요청해 새 게시판·게시글을 만들 수 있어요.'],
  ['/admin/templates', '템플릿 관리', '템플릿 AI', '메뉴, 컨텐츠 본문, 게시판·게시글은 변경하지 않아요.', '목록에서 항목을 선택하면 그 대상에 적용합니다.'],
])('%s shows a page-scoped AI panel', async (path, section, assistant, excluded, empty) => {
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
  expect(within(panel).getByText(empty)).toBeInTheDocument()
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

/** 화면 게이트는 리소스별 작업이 끝난 화면부터 연다. 템플릿은 아직 열지 않았다. */
test('the assistant only accepts requests on the screens that support them', async () => {
  window.history.pushState({}, '', '/admin/templates')
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/refresh') return Promise.resolve(json(session()))
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '템플릿 관리' })).toBeInTheDocument()
  const panel = screen.getByRole('complementary', { name: '템플릿 관리 자연어 도우미' })
  expect(within(panel).getByText('템플릿 관리 화면은 아직 자연어 변경을 지원하지 않습니다.')).toBeInTheDocument()
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
  expect(within(panel).getByText('목록에서 고르거나, 바로 요청해 새 메뉴를 만들 수 있어요.')).toBeInTheDocument()

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
  // 승인 뒤 서버는 새 메뉴를 포함해 돌려준다. 화면이 다시 읽는지 보려는 것이다.
  let applied = false
  const addedMenu = { id: 41, name: '자료실', path: '/support/archive', parentId: 40, displayOrder: 30, targetType: 'NONE', targetId: null }
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/auth/refresh') return Promise.resolve(json(session('SUPER_ADMIN', '최고 관리자')))
    if (url === '/api/cms/menus') return Promise.resolve(json(applied ? [...menus, addedMenu] : menus))
    if (url.startsWith('/api/admin/ai/profile-versions')) {
      return Promise.resolve(json([{ profileVersionId, profileKey: 'NATURAL_CMS', status: 'ACTIVE' }]))
    }
    if (url === '/api/natural-cms/jobs') return Promise.resolve(json(created))
    // 승인 응답은 Queue에 넣은 것까지다. 반영은 그 다음 조회에서 COMPLETED로 나타난다.
    if (url === `/api/natural-cms/jobs/${jobId}/decisions`) {
      applied = true
      return Promise.resolve(json({ ...previewed, approvalDecision: 'APPROVED' }))
    }
    if (url === `/api/natural-cms/jobs/${jobId}`) {
      return Promise.resolve(json(applied ? { ...previewed, status: 'COMPLETED' } : previewed))
    }
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

  // 승인은 서버가 반영한다. 새로고침 없이 목록이 따라와야 한다.
  fireEvent.click(within(modal).getByRole('button', { name: '승인하고 반영' }))
  expect(await screen.findByRole('button', { name: /\/support\/archive/ })).toBeInTheDocument()
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
  vi.stubGlobal('fetch', publicFetch({ ...siteTemplate(), siteName: 'CMS 여행 포털' }))
  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '회사 소개', level: 1 })).toBeInTheDocument()
  expect(screen.getByText('CMS 여행 포털', { selector: 'p' })).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: '사람과 기술을 연결합니다', level: 2 }))
      .toBeInTheDocument()
})

/**
 * 공개 RAG 응답 한 건. 실호출(9/6)에서 받은 모양 그대로다 — `excerpt`에 `[분류]`·`[주소]`·
 * `[홈페이지]` 라벨 줄이 그대로 실려 오고, `sourceUrl`은 열리지 않는 합성 주소다.
 */
function chatAnswer(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.0',
    traceId: '22222222-2222-4222-8222-222222222222',
    conversationId: '33333333-3333-4333-8333-333333333333',
    outcome: 'ANSWERED',
    answer: '전주 한옥마을 인근에 한옥 숙소가 있습니다.',
    citations: [{
      title: '더 한옥',
      excerpt: '[분류] 숙박 > 펜션/민박\n[주소] 전북특별자치도 전주시 완산구 은행로 68-15 (교동)\n[홈페이지] http://thehanok.modoo.at\n[개요]\n한옥마을 최중심지에 위치한다.',
      sourceUrl: 'https://api-test.local/documents/2531409',
      categoryLabel: '숙박 > 펜션/민박',
    }],
    generatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function publicFetch(template = siteTemplate(), publicPath = '/', chat: { status?: number; body?: unknown } = {}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (path === '/api/public/chat/query') {
      const status = chat.status ?? 200
      const body = chat.body ?? chatAnswer()
      // 요청 본문을 스텁이 그대로 들고 있어야 탭→category 전달을 단언할 수 있다.
      void init
      return Promise.resolve(status === 200 ? json(body) : { ok: false, status, json: () => Promise.resolve(body) } as unknown as Response)
    }
    if (path.startsWith('/api/site/context?path=')) return Promise.resolve(json(siteContext(template, publicPath)))
    if (path === '/api/site/menus') return Promise.resolve(json([
      { id: 1, name: '소개', path: '/about', parentId: null, displayOrder: 10, targetType: 'NONE', targetId: null },
      { id: 2, name: '회사 소개', path: '/about/company', parentId: 1, displayOrder: 11, targetType: 'CONTENT', targetId: 10 },
    ]))
    if (path === '/api/site/boards') return Promise.resolve(json([]))
    // 컨텐츠 본문은 편집기 문서다. 서버가 읽는 입구에서 옛 마크다운을 이 모양으로 바꿔 준다.
    if (path === '/api/site/contents/10') return Promise.resolve(json({
      id: 10, authorId: actorId, authorName: '최고 관리자', title: '회사 소개',
      body: JSON.stringify({ type: 'doc', content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '사람과 기술을 연결합니다' }] },
      ] }),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
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

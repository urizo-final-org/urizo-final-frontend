import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import type { OpsRouteId } from '../../app/routes'
import type { ProfileVersion, ProfileVersionApiClient } from '../orchestration/api'
import type { SiteTemplate } from '../cms/api'
import type { CmsSite, CmsSiteSettingsApiClient } from '../site-settings/api'
import type { KnowledgeAdminApi } from '../knowledge/admin-api'
import OpsWorkspace from './OpsWorkspace'

/**
 * `/admin/rag`가 실배선되면서 OpsWorkspace가 세션 역할과 관리자 클라이언트를 받는다.
 * 이 파일의 테스트는 rag 라우트를 렌더하지 않으므로 호출되지 않는 스텁으로 충분하다.
 */
function knowledgeApi() {
  return { resolveTarget: vi.fn(), listVersions: vi.fn(), getJob: vi.fn() } as unknown as KnowledgeAdminApi
}

/**
 * rag가 실배선되면서 선택 상태를 URL 쿼리에 두게 됐다(useSearchParams). 라우터 컨텍스트가
 * 없으면 그 라우트만 렌더에서 죽으므로 이 파일의 렌더를 한 겹 감싼다.
 */
function render(ui: React.ReactElement) {
  return rtlRender(<MemoryRouter initialEntries={['/admin/rag']}>{ui}</MemoryRouter>)
}

afterEach(() => vi.unstubAllGlobals())

const activeVersion: ProfileVersion = {
  profileVersionId: 'version-2', profileKey: 'LLM_OPS', profileVersion: 2, status: 'ACTIVE', createdAt: '2026-08-31T00:00:00Z',
  snapshot: {
    contractVersion: '1.0', profileVersionId: 'version-2', profileKey: 'LLM_OPS', profileVersion: 2,
    nodes: [{ id: 'guardrail', type: 'guardrail', handlerKey: 'common.guardrail', resultPorts: ['passed', 'failed'], config: { locked: true } }],
    edges: [], config: { maxNodes: 1, maxAttempts: 3, loopLimits: [] }, modelBindings: {},
    toolPolicy: { allowedTools: [] }, guardrailProfileKey: 'central.default',
  },
}

function profileApi(overrides: Partial<ProfileVersionApiClient> = {}): ProfileVersionApiClient {
  return {
    list: vi.fn().mockResolvedValue([activeVersion]),
    create: vi.fn(),
    activate: vi.fn(),
    ...overrides,
  }
}

const template: SiteTemplate = {
  key: 'CLASSIC', layout: 'CLASSIC', primaryColor: '#287255', siteName: 'AX Studio', headerText: 'Header', footerText: 'Footer',
  heroImageUrl: '/hero.svg', heroTitle: 'Hero', heroSubtitle: 'Subtitle', heroButtonLabel: '보기', heroButtonUrl: '/about', updatedAt: '2026-08-31T00:00:00Z',
}
const mainSite: CmsSite = {
  key: 'main', name: 'AX Studio', publicPath: '/', templateKey: 'CLASSIC', enabled: true, defaultSite: true, updatedAt: '2026-08-31T00:00:00Z',
}

function siteSettingsApi(overrides: Partial<CmsSiteSettingsApiClient> = {}): CmsSiteSettingsApiClient {
  return {
    settings: vi.fn().mockResolvedValue({ defaultSiteKey: 'main', defaultTemplateKey: 'CLASSIC', updatedAt: '2026-08-31T00:00:00Z' }),
    saveSettings: vi.fn().mockResolvedValue({ defaultSiteKey: 'main', defaultTemplateKey: 'CLASSIC', updatedAt: '2026-08-31T00:00:00Z' }),
    sites: vi.fn().mockResolvedValue([mainSite]),
    createSite: vi.fn().mockResolvedValue(mainSite),
    saveSite: vi.fn().mockResolvedValue(mainSite),
    templates: vi.fn().mockResolvedValue([template]),
    ...overrides,
  }
}

/** Static mockups, so a render plus its heading is the whole contract worth pinning. */
const screens: [Exclude<OpsRouteId, 'home'>, string][] = [
  ['agents', 'Agent 관리'],
  ['rag', 'RAG 관리'],
  ['settings', '설정'],
  ['system-settings', '시스템 설정'],
  ['sites', '사이트 관리'],
]

test.each(screens)('the %s mockup renders its heading', (route, heading) => {
  render(<OpsWorkspace route={route} actorName="일반 관리자" roleLabel="일반관리자" role="SUPER_ADMIN" knowledgeApi={knowledgeApi()} profileApi={profileApi()} siteSettingsApi={siteSettingsApi()} />)
  expect(screen.getByRole('heading', { name: heading, level: 1 })).toBeInTheDocument()
})

test('remaining mockups say their data is not real', () => {
  // rag는 9/6에 실배선됐다(RagAdminPanel). 목업 고지가 남아 있으면 오히려 거짓이므로
  // 이 목록에서 뺀다 — 실배선 검증은 features/knowledge/RagAdminPanel.test.tsx가 한다.
  const wired = ['system-settings', 'sites', 'rag']
  for (const [route] of screens.filter(([route]) => !wired.includes(route))) {
    const view = render(<OpsWorkspace route={route} actorName="일반 관리자" roleLabel="일반관리자" role="SUPER_ADMIN" knowledgeApi={knowledgeApi()} profileApi={profileApi()} siteSettingsApi={siteSettingsApi()} />)
    expect(view.container.textContent).toMatch(/데모|Mock|목업/)
    view.unmount()
  }
})

test('system settings derives locked central guardrails from active Profile Versions', async () => {
  const api = profileApi()
  render(<OpsWorkspace route="system-settings" actorName="최고 관리자" roleLabel="최고관리자" role="SUPER_ADMIN" knowledgeApi={knowledgeApi()} profileApi={api} siteSettingsApi={siteSettingsApi()} />)

  const tabs = within(screen.getByRole('tablist', { name: '시스템 설정 영역' })).getAllByRole('tab')
  expect(tabs).toHaveLength(2)
  expect(tabs[0]).toHaveTextContent('CMS 기본 설정')
  expect(tabs[0]).not.toHaveTextContent('임시')
  expect(tabs[1]).toHaveTextContent('Guardrail Profile')
  expect(tabs[1]).not.toHaveTextContent('임시')
  expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1])
  expect(await screen.findByLabelText('기본 사이트')).toHaveValue('main')
  expect(screen.getByLabelText('선택한 사이트의 적용 템플릿')).toHaveValue('CLASSIC')

  fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
  expect(tabs[1]).toHaveFocus()
  expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
  await waitFor(() => expect(api.list).toHaveBeenCalledWith())
  expect(await screen.findByText('LLM_OPS v2')).toBeInTheDocument()
  expect(screen.getAllByText('central.default').length).toBeGreaterThan(0)
  expect(screen.getByText(/잠금 Guardrail Node 1개 · 삭제\/비활성화 불가/)).toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})

test('central guardrail lookup failures are visible without edit controls', async () => {
  const api = profileApi({ list: vi.fn().mockRejectedValue(new Error('조회 실패 [FORBIDDEN]')) })
  render(<OpsWorkspace route="system-settings" actorName="최고 관리자" roleLabel="최고관리자" role="SUPER_ADMIN" knowledgeApi={knowledgeApi()} profileApi={api} siteSettingsApi={siteSettingsApi()} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Guardrail Profile' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('조회 실패 [FORBIDDEN]')
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
})

test('system settings preserves the selected site template without an editable template selector', async () => {
  const campaign = { ...mainSite, key: 'campaign', name: '캠페인', publicPath: '/campaign', templateKey: 'BOLD', defaultSite: false }
  const bold = { ...template, key: 'BOLD', layout: 'BOLD' }
  const api = siteSettingsApi({
    sites: vi.fn().mockResolvedValue([mainSite, campaign]),
    templates: vi.fn().mockResolvedValue([template, bold]),
    saveSettings: vi.fn().mockResolvedValue({ defaultSiteKey: 'campaign', defaultTemplateKey: 'BOLD', updatedAt: '2026-08-31T01:00:00Z' }),
  })
  render(<OpsWorkspace route="system-settings" actorName="최고 관리자" roleLabel="최고관리자" role="SUPER_ADMIN" knowledgeApi={knowledgeApi()} profileApi={profileApi()} siteSettingsApi={api} />)

  fireEvent.change(await screen.findByLabelText('기본 사이트'), { target: { value: 'campaign' } })
  expect(screen.getByLabelText('선택한 사이트의 적용 템플릿')).toHaveValue('BOLD')
  expect(screen.getByLabelText('선택한 사이트의 적용 템플릿')).toHaveAttribute('readonly')
  expect(screen.getAllByRole('combobox')).toHaveLength(1)
  expect(screen.getByRole('link', { name: '사이트 관리에서 변경' })).toHaveAttribute('href', '/admin/sites')
  fireEvent.click(screen.getByRole('button', { name: '기본 설정 저장' }))

  await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ defaultSiteKey: 'campaign', defaultTemplateKey: 'BOLD' }))
  expect(api.sites).toHaveBeenCalledTimes(2)
  expect(api.templates).not.toHaveBeenCalled()
  expect(api.saveSite).not.toHaveBeenCalled()
  expect(await screen.findByText(/사용자 화면에 반영했습니다/)).toBeInTheDocument()
})

test('system settings requires review if the selected site template changed before saving', async () => {
  const changedSite = { ...mainSite, templateKey: 'BOLD' }
  const api = siteSettingsApi({
    sites: vi.fn().mockResolvedValueOnce([mainSite]).mockResolvedValue([changedSite]),
    saveSettings: vi.fn().mockResolvedValue({ defaultSiteKey: 'main', defaultTemplateKey: 'BOLD', updatedAt: mainSite.updatedAt }),
  })
  render(<OpsWorkspace route="system-settings" actorName="최고 관리자" roleLabel="최고관리자" role="SUPER_ADMIN" knowledgeApi={knowledgeApi()} profileApi={profileApi()} siteSettingsApi={api} />)
  fireEvent.click(await screen.findByRole('button', { name: '기본 설정 저장' }))
  expect(await screen.findByText(/적용 템플릿이 변경되었습니다/)).toBeInTheDocument()
  expect(api.saveSettings).not.toHaveBeenCalled()
  expect(screen.getByLabelText('선택한 사이트의 적용 템플릿')).toHaveValue('BOLD')
  fireEvent.click(screen.getByRole('button', { name: '기본 설정 저장' }))
  await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ defaultSiteKey: 'main', defaultTemplateKey: 'BOLD' }))
})

test.each(['disabled', 'missing'])('system settings refuses a site that became %s before save', async (state) => {
  const api = siteSettingsApi({ sites: vi.fn().mockResolvedValueOnce([mainSite]).mockResolvedValue(state === 'missing' ? [] : [{ ...mainSite, enabled: false }]) })
  render(<OpsWorkspace route="system-settings" actorName="최고 관리자" roleLabel="최고관리자" role="SUPER_ADMIN" knowledgeApi={knowledgeApi()} profileApi={profileApi()} siteSettingsApi={api} />)
  fireEvent.click(await screen.findByRole('button', { name: '기본 설정 저장' }))
  expect(await screen.findByText(/선택한 사이트를 사용할 수 없습니다/)).toBeInTheDocument()
  expect(api.saveSettings).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '기본 설정 저장' })).toBeDisabled()
})

test('system settings does not save stale values when refreshing sites fails', async () => {
  const api = siteSettingsApi({ sites: vi.fn().mockResolvedValueOnce([mainSite]).mockRejectedValue(new Error('사이트 조회 실패')) })
  render(<OpsWorkspace route="system-settings" actorName="최고 관리자" roleLabel="최고관리자" role="SUPER_ADMIN" knowledgeApi={knowledgeApi()} profileApi={profileApi()} siteSettingsApi={api} />)
  fireEvent.click(await screen.findByRole('button', { name: '기본 설정 저장' }))
  expect(await screen.findByText(/CMS 기본 설정을 저장하지 못했습니다.*사이트 조회 실패/)).toBeInTheDocument()
  expect(api.saveSettings).not.toHaveBeenCalled()
  expect(screen.queryByText(/사용자 화면에 반영했습니다/)).not.toBeInTheDocument()
})

test('system settings excludes disabled sites from the default selector', async () => {
  const api = siteSettingsApi({ sites: vi.fn().mockResolvedValue([mainSite, { ...mainSite, key: 'disabled', name: '중지 사이트', enabled: false, defaultSite: false }]) })
  render(<OpsWorkspace route="system-settings" actorName="최고 관리자" roleLabel="최고관리자" role="SUPER_ADMIN" knowledgeApi={knowledgeApi()} profileApi={profileApi()} siteSettingsApi={api} />)
  await screen.findByLabelText('기본 사이트')
  expect(screen.queryByRole('option', { name: /중지 사이트/ })).not.toBeInTheDocument()
})

test('site management saves only the selected site settings', async () => {
  const api = siteSettingsApi({
    saveSite: vi.fn().mockResolvedValue({ ...mainSite, name: '새 사이트', publicPath: '/new' }),
  })
  render(<OpsWorkspace route="sites" actorName="최고 관리자" roleLabel="최고관리자" role="SUPER_ADMIN" knowledgeApi={knowledgeApi()} profileApi={profileApi()} siteSettingsApi={api} />)

  fireEvent.change(await screen.findByLabelText('사이트명'), { target: { value: '새 사이트' } })
  fireEvent.change(screen.getByLabelText(/공개 경로/), { target: { value: '/new' } })
  fireEvent.click(screen.getByRole('button', { name: '사이트 설정 저장' }))

  await waitFor(() => expect(api.saveSite).toHaveBeenCalledWith('main', expect.objectContaining({
    name: '새 사이트', publicPath: '/new', templateKey: 'CLASSIC', enabled: true,
  })))
  expect(await screen.findByText(/사용자 화면에 반영했습니다/)).toBeInTheDocument()
  expect(screen.queryByLabelText('대표 색상')).not.toBeInTheDocument()
})

test('site management creates a second Site with its own path and template', async () => {
  const created = {
    ...mainSite,
    key: 'campaign',
    name: '캠페인',
    publicPath: '/campaign',
    defaultSite: false,
  }
  const createSite = vi.fn().mockResolvedValue(created)
  const api = siteSettingsApi({ createSite })
  render(<OpsWorkspace route="sites" actorName="최고 관리자" roleLabel="최고관리자" role="SUPER_ADMIN" knowledgeApi={knowledgeApi()} profileApi={profileApi()} siteSettingsApi={api} />)

  fireEvent.click(await screen.findByRole('button', { name: '새 사이트' }))
  fireEvent.change(screen.getByLabelText('사이트 키'), { target: { value: 'campaign' } })
  fireEvent.change(screen.getByLabelText('사이트명'), { target: { value: '캠페인' } })
  fireEvent.change(screen.getByLabelText(/공개 경로/), { target: { value: '/campaign' } })
  fireEvent.click(screen.getByRole('button', { name: '사이트 생성' }))

  await waitFor(() => expect(createSite).toHaveBeenCalledWith({
    key: 'campaign', name: '캠페인', publicPath: '/campaign', templateKey: 'CLASSIC', enabled: true,
  }))
  expect(await screen.findByText(/사이트를 생성하고 사용자 화면에 반영했습니다/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /캠페인/ })).toBeInTheDocument()
})

test('site creation exposes key and path conflicts without adding the Site', async () => {
  const createSite = vi.fn().mockRejectedValue(new Error('이미 사용 중인 Site 키 또는 공개 경로입니다.'))
  const api = siteSettingsApi({ createSite })
  render(<OpsWorkspace route="sites" actorName="최고 관리자" roleLabel="최고관리자" role="SUPER_ADMIN" knowledgeApi={knowledgeApi()} profileApi={profileApi()} siteSettingsApi={api} />)

  fireEvent.click(await screen.findByRole('button', { name: '새 사이트' }))
  fireEvent.change(screen.getByLabelText('사이트 키'), { target: { value: 'main' } })
  fireEvent.change(screen.getByLabelText('사이트명'), { target: { value: '중복 사이트' } })
  fireEvent.click(screen.getByRole('button', { name: '사이트 생성' }))

  expect(await screen.findByText(/사이트를 생성하지 못했습니다.*이미 사용 중인 Site 키 또는 공개 경로/)).toBeInTheDocument()
  expect(createSite).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', { name: /중복 사이트/ })).not.toBeInTheDocument()
})

test('site management exposes a clear save failure', async () => {
  const api = siteSettingsApi({ saveSite: vi.fn().mockRejectedValue(new Error('공개 경로 중복')) })
  render(<OpsWorkspace route="sites" actorName="최고 관리자" roleLabel="최고관리자" role="SUPER_ADMIN" knowledgeApi={knowledgeApi()} profileApi={profileApi()} siteSettingsApi={api} />)

  fireEvent.click(await screen.findByRole('button', { name: '사이트 설정 저장' }))
  expect(await screen.findByText(/사이트 설정을 저장하지 못했습니다.*공개 경로 중복/)).toBeInTheDocument()
})

test('general settings removes fake organization, key, permission, and alert controls', () => {
  render(<OpsWorkspace route="settings" actorName="일반 관리자" roleLabel="일반관리자" role="SUPER_ADMIN" knowledgeApi={knowledgeApi()} profileApi={profileApi()} siteSettingsApi={siteSettingsApi()} />)

  expect(screen.getByText(/조직·권한 정책·API Key·알림 저장 API가 없어/)).toBeInTheDocument()
  expect(screen.getByText('CMS 로그인·역할')).toBeInTheDocument()
  expect(screen.getByText('API Key·알림 설정')).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

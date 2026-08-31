import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { OpsRouteId } from '../../app/routes'
import type { ProfileVersion, ProfileVersionApiClient } from '../orchestration/api'
import type { SiteTemplate } from '../cms/api'
import type { CmsSite, CmsSiteSettingsApiClient } from '../site-settings/api'
import OpsWorkspace from './OpsWorkspace'

afterEach(() => vi.unstubAllGlobals())

const activeVersion: ProfileVersion = {
  profileVersionId: 'version-2', profileKey: 'LLM_OPS', profileVersion: 2, status: 'ACTIVE', createdAt: '2026-08-31T00:00:00Z',
  snapshot: {
    contractVersion: '1.0', profileVersionId: 'version-2', profileKey: 'LLM_OPS', profileVersion: 2,
    nodes: [{ type: 'guardrail', config: { locked: true } }], edges: [], config: {}, modelBindings: {}, toolPolicy: {}, guardrailProfileKey: 'central.default',
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
  heroImageUrl: '/hero.svg', heroTitle: 'Hero', heroSubtitle: 'Subtitle', heroButtonLabel: '보기', heroButtonUrl: '/about', active: true, updatedAt: '2026-08-31T00:00:00Z',
}
const mainSite: CmsSite = {
  key: 'main', name: 'AX Studio', publicPath: '/', templateKey: 'CLASSIC', enabled: true, defaultSite: true, updatedAt: '2026-08-31T00:00:00Z',
}

function siteSettingsApi(overrides: Partial<CmsSiteSettingsApiClient> = {}): CmsSiteSettingsApiClient {
  return {
    settings: vi.fn().mockResolvedValue({ defaultSiteKey: 'main', defaultTemplateKey: 'CLASSIC', updatedAt: '2026-08-31T00:00:00Z' }),
    saveSettings: vi.fn().mockResolvedValue({ defaultSiteKey: 'main', defaultTemplateKey: 'CLASSIC', updatedAt: '2026-08-31T00:00:00Z' }),
    sites: vi.fn().mockResolvedValue([mainSite]),
    saveSite: vi.fn().mockResolvedValue(mainSite),
    templates: vi.fn().mockResolvedValue([template]),
    ...overrides,
  }
}

/** Static mockups, so a render plus its heading is the whole contract worth pinning. */
const screens: [OpsRouteId, string][] = [
  ['home', '안녕하세요, 일반 관리자님'],
  ['agents', 'Agent 관리'],
  ['models', '모델 및 Provider 관리'],
  ['rag', 'RAG 관리'],
  ['devops', 'LLM DevOps'],
  ['approvals', '승인 관리'],
  ['runs', '실행 이력'],
  ['settings', '설정'],
  ['system-settings', '시스템 설정'],
  ['sites', '사이트 관리'],
]

test.each(screens)('the %s mockup renders its heading', (route, heading) => {
  render(<OpsWorkspace route={route} actorName="일반 관리자" roleLabel="일반관리자" profileApi={profileApi()} siteSettingsApi={siteSettingsApi()} />)
  expect(screen.getByRole('heading', { name: heading, level: 1 })).toBeInTheDocument()
})

test('remaining mockups say their data is not real', () => {
  for (const [route] of screens.filter(([route]) => route !== 'system-settings' && route !== 'sites')) {
    const view = render(<OpsWorkspace route={route} actorName="일반 관리자" roleLabel="일반관리자" profileApi={profileApi()} siteSettingsApi={siteSettingsApi()} />)
    expect(view.container.textContent).toMatch(/데모|Mock|목업/)
    view.unmount()
  }
})

test('the home mockup greets the signed-in operator, not a fixed name', () => {
  render(<OpsWorkspace route="home" actorName="최고 관리자" roleLabel="최고관리자" profileApi={profileApi()} siteSettingsApi={siteSettingsApi()} />)
  expect(screen.getByRole('heading', { name: '안녕하세요, 최고 관리자님', level: 1 })).toBeInTheDocument()
})

test('system settings derives locked central guardrails from active Profile Versions', async () => {
  const api = profileApi()
  render(<OpsWorkspace route="system-settings" actorName="최고 관리자" roleLabel="최고관리자" profileApi={api} siteSettingsApi={siteSettingsApi()} />)

  const tabs = within(screen.getByRole('tablist', { name: '시스템 설정 영역' })).getAllByRole('tab')
  expect(tabs).toHaveLength(2)
  expect(tabs[0]).toHaveTextContent('CMS 기본 설정')
  expect(tabs[0]).not.toHaveTextContent('임시')
  expect(tabs[1]).toHaveTextContent('Guardrail Profile')
  expect(tabs[1]).not.toHaveTextContent('임시')
  expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1])
  expect(await screen.findByLabelText('기본 사이트')).toHaveValue('main')
  expect(screen.getByLabelText('기본 템플릿')).toHaveValue('CLASSIC')

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
  render(<OpsWorkspace route="system-settings" actorName="최고 관리자" roleLabel="최고관리자" profileApi={api} siteSettingsApi={siteSettingsApi()} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Guardrail Profile' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('조회 실패 [FORBIDDEN]')
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
})

test('system settings saves the selected default site and template', async () => {
  const campaign = { ...mainSite, key: 'campaign', name: '캠페인', publicPath: '/campaign', templateKey: 'BOLD', defaultSite: false }
  const bold = { ...template, key: 'BOLD', layout: 'BOLD', active: false }
  const api = siteSettingsApi({
    sites: vi.fn().mockResolvedValue([mainSite, campaign]),
    templates: vi.fn().mockResolvedValue([template, bold]),
    saveSettings: vi.fn().mockResolvedValue({ defaultSiteKey: 'campaign', defaultTemplateKey: 'BOLD', updatedAt: '2026-08-31T01:00:00Z' }),
  })
  render(<OpsWorkspace route="system-settings" actorName="최고 관리자" roleLabel="최고관리자" profileApi={profileApi()} siteSettingsApi={api} />)

  fireEvent.change(await screen.findByLabelText('기본 사이트'), { target: { value: 'campaign' } })
  fireEvent.change(screen.getByLabelText('기본 템플릿'), { target: { value: 'BOLD' } })
  fireEvent.click(screen.getByRole('button', { name: '기본 설정 저장' }))

  await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ defaultSiteKey: 'campaign', defaultTemplateKey: 'BOLD' })))
  expect(await screen.findByText(/사용자 화면에 반영했습니다/)).toBeInTheDocument()
})

test('site management saves only the selected site settings', async () => {
  const api = siteSettingsApi({
    saveSite: vi.fn().mockResolvedValue({ ...mainSite, name: '새 사이트', publicPath: '/new' }),
  })
  render(<OpsWorkspace route="sites" actorName="최고 관리자" roleLabel="최고관리자" profileApi={profileApi()} siteSettingsApi={api} />)

  fireEvent.change(await screen.findByLabelText('사이트명'), { target: { value: '새 사이트' } })
  fireEvent.change(screen.getByLabelText(/공개 경로/), { target: { value: '/new' } })
  fireEvent.click(screen.getByRole('button', { name: '사이트 설정 저장' }))

  await waitFor(() => expect(api.saveSite).toHaveBeenCalledWith('main', expect.objectContaining({
    name: '새 사이트', publicPath: '/new', templateKey: 'CLASSIC', enabled: true,
  })))
  expect(await screen.findByText(/사용자 화면에 반영했습니다/)).toBeInTheDocument()
  expect(screen.queryByLabelText('대표 색상')).not.toBeInTheDocument()
})

test('site management exposes a clear save failure', async () => {
  const api = siteSettingsApi({ saveSite: vi.fn().mockRejectedValue(new Error('공개 경로 중복')) })
  render(<OpsWorkspace route="sites" actorName="최고 관리자" roleLabel="최고관리자" profileApi={profileApi()} siteSettingsApi={api} />)

  fireEvent.click(await screen.findByRole('button', { name: '사이트 설정 저장' }))
  expect(await screen.findByText(/사이트 설정을 저장하지 못했습니다.*공개 경로 중복/)).toBeInTheDocument()
})

test('general settings removes fake organization, key, permission, and alert controls', () => {
  render(<OpsWorkspace route="settings" actorName="일반 관리자" roleLabel="일반관리자" profileApi={profileApi()} siteSettingsApi={siteSettingsApi()} />)

  expect(screen.getByText(/조직·권한 정책·API Key·알림 저장 API가 없어/)).toBeInTheDocument()
  expect(screen.getByText('CMS 로그인·역할')).toBeInTheDocument()
  expect(screen.getByText('API Key·알림 설정')).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test.each([
  ['approvals' as const, /가짜 요청·건수·처리 버튼을 표시하지 않습니다/, '승인 처리·이력 API'],
  ['runs' as const, /가짜 실행 기록, 로딩 수치, CSV 버튼을 표시하지 않습니다/, '이력 조회·통계 API'],
])('%s exposes only current runtime status', (route, notice, missingContract) => {
  render(<OpsWorkspace route={route} actorName="일반 관리자" roleLabel="일반관리자" profileApi={profileApi()} siteSettingsApi={siteSettingsApi()} />)
  expect(screen.getByText(notice)).toBeInTheDocument()
  expect(screen.getByText(missingContract)).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})

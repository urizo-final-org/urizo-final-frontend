import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest'
import { PortalFooter, PortalHeader, PortalHome } from '../site/TourPortal'
import { CmsApi, CMS_CHANGED_EVENT, SITE_UPDATE_EVENT, type Menu, type SiteTemplate } from './api'
import { Templates } from './CmsWorkspace'
import { TemplatePreview } from './TemplatePreview'

const template: SiteTemplate = {
  key: 'MINIMAL', layout: 'BOLD', siteName: '템플릿 예시 이름', primaryColor: '#0ea096',
  headerText: '메인 안내', footerText: '메인 하단', heroImageUrl: '/images/cms/hero-bio.svg',
  heroTitle: 'Portal Title', heroSubtitle: '포털 설명', heroButtonLabel: '소개 보기', heroButtonUrl: '/about', updatedAt: '',
}
const menus: Menu[] = [{ id: 1, name: '실제 CMS 메뉴', path: '/about', parentId: null, displayOrder: 1, targetType: 'NONE', targetId: null }]
const site = { key: 'main', name: '실제 메인 이름', publicPath: '/', template }
const mainSettings = { key: 'main', name: '최신 메인 이름', publicPath: '/', templateKey: 'MINIMAL', enabled: true, defaultSite: true, updatedAt: '' }
const siteSettingsApi = { sites: vi.fn(), saveSite: vi.fn() }

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
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear() })

test.each(['CLASSIC', 'MINIMAL', 'BOLD'].flatMap((key) => ['CLASSIC', 'MINIMAL', 'BOLD'].map((layout) => [key, layout])))('%s/%s preview renders the same portal markup and brand as the public main, outside the admin theme', (key, layout) => {
  const value = { ...template, key, layout, heroImageUrls: ['/first.png', '/second.png', '/third.png'] }
  const resolved = { ...value, siteName: site.name }
  const publicView = render(<MemoryRouter><PortalHeader template={resolved} menus={menus} /><PortalHome template={resolved} menus={menus} /><PortalFooter template={resolved} menus={menus} /></MemoryRouter>)
  const expected = publicView.container.innerHTML
  publicView.unmount()
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  render(<MemoryRouter><div className="admin-app" data-admin-theme="dark"><TemplatePreview value={value} siteName={site.name} menus={menus} onClose={vi.fn()} /></div></MemoryRouter>)
  const dialog = screen.getByRole('dialog')
  expect(dialog.parentElement).toBe(document.body)
  expect(dialog.closest('.admin-app')).toBeNull()
  expect(dialog).toHaveClass('site-app')
  expect(dialog.style.getPropertyValue('--primary')).toBe(value.primaryColor)
  expect(dialog.style.getPropertyValue('--brand')).toBe(value.primaryColor)
  expect(dialog.querySelector('[inert]')?.innerHTML).toBe(expected)
  expect(dialog.querySelector('h1')).toHaveClass(layout === 'BOLD' ? 'font-black' : layout === 'MINIMAL' ? 'font-semibold' : 'font-extrabold')
  expect(fetcher).not.toHaveBeenCalled()
})

test('preview blocks navigation and search, and supports close and Escape', () => {
  const close = vi.fn()
  function Location() { return <output data-testid="location">{useLocation().pathname}</output> }
  render(<MemoryRouter initialEntries={['/admin/templates']}><Location /><TemplatePreview value={template} onClose={close} /></MemoryRouter>)
  const dialog = screen.getByRole('dialog')
  fireEvent.click(dialog.querySelector('a[href="/about"]')!)
  fireEvent.submit(dialog.querySelector('form')!)
  fireEvent.click(within(dialog).getByRole('button', { name: '통합검색 열기' }))
  expect(screen.queryByRole('dialog', { name: '통합검색' })).not.toBeInTheDocument()
  expect(screen.getByTestId('location')).toHaveTextContent('/admin/templates')
  fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
  fireEvent(dialog, new Event('cancel', { bubbles: false }))
  expect(close).toHaveBeenCalledTimes(2)
})

function setupTemplates() {
  siteSettingsApi.sites.mockReset().mockResolvedValue([mainSettings])
  siteSettingsApi.saveSite.mockReset().mockImplementation(async (key, value) => ({ ...mainSettings, ...value, key }))
  const api = new CmsApi('test-token', vi.fn(), vi.fn())
  let items = [{ ...template, key: 'BOLD', siteName: '다른 템플릿' }, template]
  vi.spyOn(api, 'templates').mockImplementation(async () => items)
  const save = vi.spyOn(api, 'saveTemplate').mockImplementation(async (value) => {
    items = items.map((item) => item.key === value.key ? value : item)
    return value
  })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input).startsWith('/api/site/context?') ? site : menus), { status: 200 })))
  return { api, save }
}

test('a CMS refresh preserves unsaved template edits and keeps AI blocked', async () => {
  const { api } = setupTemplates()
  const context = vi.fn()
  render(<MemoryRouter><Templates api={api} siteSettingsApi={siteSettingsApi} onAssistantContext={context} /></MemoryRouter>)
  await screen.findByText('MINIMAL 템플릿 설정')
  fireEvent.change(screen.getByLabelText(/^메인 대표 문구/), { target: { value: '수동 작성 중' } })
  window.dispatchEvent(new Event(CMS_CHANGED_EVENT))
  await waitFor(() => expect(api.templates).toHaveBeenCalledTimes(2))
  expect(screen.getByLabelText(/^메인 대표 문구/)).toHaveValue('수동 작성 중')
  expect(context.mock.lastCall?.[0]).toMatchObject({ target: { type: 'TEMPLATE', id: 'MINIMAL' }, blockedReason: expect.stringContaining('직접 수정') })
})

test('approval preview uses a separate viewport for mobile media queries', () => {
  render(<MemoryRouter><TemplatePreview value={template} mode="approval" onClose={vi.fn()} /></MemoryRouter>)
  const frame = screen.getByTitle('템플릿 실제 화면') as HTMLIFrameElement
  expect(frame).toHaveAttribute('sandbox', 'allow-same-origin')
  expect(frame.style.width).toBe('100%')
  fireEvent.click(screen.getByRole('button', { name: '모바일 390px' }))
  expect(frame.style.width).toBe('390px')
  fireEvent.load(frame)
  expect(frame.contentDocument?.body.querySelector('[inert]')).not.toBeNull()
  expect(frame.contentDocument?.body.querySelector('h1')).toHaveTextContent('Portal Title')
})

test('selects the main template by key, previews drafts with the real site name, and only saves on explicit submit', async () => {
  const { api, save } = setupTemplates()
  render(<MemoryRouter><Templates api={api} siteSettingsApi={siteSettingsApi} /></MemoryRouter>)
  expect(await screen.findByText('MINIMAL 템플릿 설정')).toBeInTheDocument()
  expect(screen.getByText('메인에 적용 중').closest('button')).toHaveAccessibleName('MINIMAL 템플릿 선택')
  fireEvent.change(screen.getByLabelText(/^메인 대표 문구/), { target: { value: '저장 전 제목' } })
  fireEvent.click(screen.getByRole('button', { name: '현재 입력값 미리보기' }))
  const dialog = screen.getByRole('dialog')
  expect(dialog.querySelector('h1')).toHaveTextContent('저장 전 제목')
  expect(dialog.querySelector('header')).toHaveTextContent(site.name)
  expect(dialog.querySelector('header')).not.toHaveTextContent(template.siteName)
  expect(save).not.toHaveBeenCalled()
  expect(window.localStorage.getItem(SITE_UPDATE_EVENT)).toBeNull()
  fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
  fireEvent.click(screen.getByRole('button', { name: '템플릿 저장' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0]).toMatchObject({ key: 'MINIMAL', heroTitle: '저장 전 제목', siteName: template.siteName })
  await waitFor(() => expect(window.localStorage.getItem(SITE_UPDATE_EVENT)).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'BOLD 템플릿 선택' }))
  expect(screen.getByText('메인에 적용 중').closest('button')).toHaveAccessibleName('MINIMAL 템플릿 선택')
  expect(save).toHaveBeenCalledOnce()
})

test('public context failure is explicit without blocking template editing or inventing the active template', async () => {
  const { api } = setupTemplates()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unavailable')))
  render(<MemoryRouter><Templates api={api} siteSettingsApi={siteSettingsApi} /></MemoryRouter>)
  expect(await screen.findByText(/메인 적용 정보를 확인하지 못했습니다/)).toBeInTheDocument()
  expect(await screen.findByRole('button', { name: '템플릿 저장' })).toBeEnabled()
  expect(screen.queryByText('메인에 적용 중')).not.toBeInTheDocument()
})

test('failed template save retains the draft and does not announce a site update', async () => {
  const { api, save } = setupTemplates()
  save.mockRejectedValue(new Error('save failed'))
  render(<MemoryRouter><Templates api={api} siteSettingsApi={siteSettingsApi} /></MemoryRouter>)
  await screen.findByText('MINIMAL 템플릿 설정')
  fireEvent.change(screen.getByLabelText(/^메인 대표 문구/), { target: { value: '보존할 제목' } })
  fireEvent.click(screen.getByRole('button', { name: '템플릿 저장' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('템플릿을 저장하지 못했습니다.')
  expect(screen.getByLabelText(/^메인 대표 문구/)).toHaveValue('보존할 제목')
  expect(window.localStorage.getItem(SITE_UPDATE_EVENT)).toBeNull()
})

test('applies the selected saved template using current main site fields and updates the active badge', async () => {
  const { api, save } = setupTemplates()
  render(<MemoryRouter><Templates api={api} siteSettingsApi={siteSettingsApi} /></MemoryRouter>)
  expect(await screen.findByRole('button', { name: '적용 완료' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'BOLD 템플릿 선택' }))
  const apply = screen.getByRole('button', { name: '메인에 적용' })
  fireEvent.click(apply)
  fireEvent.click(apply)
  await waitFor(() => expect(siteSettingsApi.saveSite).toHaveBeenCalledExactlyOnceWith('main', { ...mainSettings, templateKey: 'BOLD' }))
  await waitFor(() => expect(screen.getByText('메인에 적용 중').closest('button')).toHaveAccessibleName('BOLD 템플릿 선택'))
  expect(screen.getByRole('button', { name: '적용 완료' })).toBeDisabled()
  expect(save).not.toHaveBeenCalled()
  expect(window.localStorage.getItem(SITE_UPDATE_EVENT)).toBeTruthy()
})

test('requires saving a modified design before applying it', async () => {
  const { api, save } = setupTemplates()
  render(<MemoryRouter><Templates api={api} siteSettingsApi={siteSettingsApi} /></MemoryRouter>)
  await screen.findByText('MINIMAL 템플릿 설정')
  fireEvent.click(screen.getByRole('button', { name: 'BOLD 템플릿 선택' }))
  fireEvent.change(screen.getByLabelText(/^메인 대표 문구/), { target: { value: '새 여행 제목' } })
  expect(screen.getByRole('button', { name: '메인에 적용' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '템플릿 저장' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '메인에 적용' })).toBeEnabled())
  expect(save).toHaveBeenCalledOnce()
  expect(siteSettingsApi.saveSite).not.toHaveBeenCalled()
})

test.each(['save failure', 'missing main'])('failed application preserves the active template: %s', async (reason) => {
  const { api } = setupTemplates()
  if (reason === 'missing main') siteSettingsApi.sites.mockResolvedValue([{ ...mainSettings, publicPath: '/campaign' }])
  else siteSettingsApi.saveSite.mockRejectedValue(new Error('저장 실패'))
  render(<MemoryRouter><Templates api={api} siteSettingsApi={siteSettingsApi} /></MemoryRouter>)
  await screen.findByText('MINIMAL 템플릿 설정')
  fireEvent.click(screen.getByRole('button', { name: 'BOLD 템플릿 선택' }))
  fireEvent.click(screen.getByRole('button', { name: '메인에 적용' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('메인에 적용하지 못했습니다.')
  expect(screen.getByText('메인에 적용 중').closest('button')).toHaveAccessibleName('MINIMAL 템플릿 선택')
  expect(window.localStorage.getItem(SITE_UPDATE_EVENT)).toBeNull()
  if (reason === 'missing main') expect(siteSettingsApi.saveSite).not.toHaveBeenCalled()
})

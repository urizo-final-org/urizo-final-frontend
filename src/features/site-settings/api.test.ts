import { afterEach, expect, test, vi } from 'vitest'
import { CmsSiteSettingsApi, type CmsSiteSettings } from './api'

afterEach(() => vi.unstubAllGlobals())

test('default settings sends only the two writable contract fields', async () => {
  let body: unknown
  vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    body = JSON.parse(String(init?.body))
    return Promise.resolve(json({ defaultSiteKey: 'main', defaultTemplateKey: 'BOLD', updatedAt: '2026-08-31T00:00:00Z' }))
  }))
  const api = new CmsSiteSettingsApi('access-token', vi.fn(), vi.fn())
  const value: CmsSiteSettings = { defaultSiteKey: 'main', defaultTemplateKey: 'BOLD', updatedAt: 'stale-client-value' }

  await api.saveSettings(value)

  expect(body).toEqual({ defaultSiteKey: 'main', defaultTemplateKey: 'BOLD' })
})

test('site save exposes the backend validation detail', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: '이미 사용 중인 공개 경로입니다.' }, 400)))
  const api = new CmsSiteSettingsApi('access-token', vi.fn(), vi.fn())

  await expect(api.saveSite('main', { name: '메인', publicPath: '/used', templateKey: 'CLASSIC', enabled: true }))
    .rejects.toMatchObject({ status: 400, message: '이미 사용 중인 공개 경로입니다.' })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

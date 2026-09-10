import { afterEach, expect, test, vi } from 'vitest'
import { HistoryApi } from './api'
import { fetchWithSessionRefresh } from '../../shared/api/session'

vi.mock('../../shared/api/session', () => ({ fetchWithSessionRefresh: vi.fn() }))
afterEach(() => vi.resetAllMocks())

test('GET-only client encodes filter and cursor with no-store and AbortSignal', async () => {
  vi.mocked(fetchWithSessionRefresh).mockImplementation(async () => new Response(JSON.stringify({ items: [], nextCursor: null, observedAt: '2026-09-10T05:00:00Z' })))
  const api = new HistoryApi('token', vi.fn(), vi.fn())
  const controller = new AbortController()
  await api.approvals('NATURAL_CMS', { query: 'a&b', cursor: 'a/b=', signal: controller.signal })
  const [url, init] = vi.mocked(fetchWithSessionRefresh).mock.calls[0]
  expect(url).toBe('/api/admin/governance/approvals?domain=NATURAL_CMS&limit=25&query=a%26b&cursor=a%2Fb%3D')
  expect(init).toMatchObject({ method: 'GET', cache: 'no-store', signal: controller.signal })
  await api.runs('CMS')
  expect(vi.mocked(fetchWithSessionRefresh).mock.calls[1][0]).toBe('/api/admin/governance/runs?category=CMS&limit=25')
})

test('errors remain errors instead of fabricated empty pages', async () => {
  vi.mocked(fetchWithSessionRefresh).mockResolvedValue(new Response(JSON.stringify({ error: { code: 'HISTORY_UNAVAILABLE', message: '이력 조회 실패' } }), { status: 503 }))
  await expect(new HistoryApi('token', vi.fn(), vi.fn()).runs('ALL')).rejects.toMatchObject({ code: 'HISTORY_UNAVAILABLE', status: 503 })
})

test('session refresh callback updates subsequent request token', async () => {
  vi.mocked(fetchWithSessionRefresh).mockResolvedValue(new Response(JSON.stringify({ items: [] })))
  const refreshed = vi.fn(); const expired = vi.fn()
  const api = new HistoryApi('old-token', refreshed, expired)
  await api.runs('ALL')
  const hooks = vi.mocked(fetchWithSessionRefresh).mock.calls[0][3]!
  const session = { sessionToken: 'new-token' } as Parameters<NonNullable<typeof hooks.onSessionRefreshed>>[0]
  hooks.onSessionRefreshed?.(session)
  vi.mocked(fetchWithSessionRefresh).mockResolvedValue(new Response(JSON.stringify({ items: [] })))
  await api.runs('AI')
  expect(vi.mocked(fetchWithSessionRefresh).mock.calls[1][2]).toBe('new-token')
  expect(refreshed).toHaveBeenCalledWith(session)
  hooks.onSessionExpired?.()
  expect(expired).toHaveBeenCalledOnce()
})

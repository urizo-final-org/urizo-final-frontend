import { afterEach, expect, test, vi } from 'vitest'
import { ProductApiError } from '../../shared/api/error'
import { ProfileVersionApi, type ProfileAuthoringSnapshot } from './api'

afterEach(() => vi.unstubAllGlobals())

const snapshot: ProfileAuthoringSnapshot = {
  nodes: [], edges: [], config: {}, modelBindings: {}, toolPolicy: {}, guardrailProfileKey: 'central.default',
}

test('lists, creates, and activates Profile Versions through the admin contract', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response('[]'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ profileVersionId: 'version-2' }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ profileVersionId: 'version-2', status: 'ACTIVE' })))
  vi.stubGlobal('fetch', fetcher)
  vi.stubGlobal('crypto', { randomUUID: () => 'trace-id' })
  const api = new ProfileVersionApi('token', vi.fn(), vi.fn())

  await expect(api.list('LLM_OPS')).resolves.toEqual([])
  await expect(api.create('LLM_OPS', snapshot)).resolves.toMatchObject({ profileVersionId: 'version-2' })
  await expect(api.activate('version-2')).resolves.toMatchObject({ status: 'ACTIVE' })

  expect(fetcher.mock.calls[0][0]).toBe('/api/admin/ai/profile-versions?profileKey=LLM_OPS')
  expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'POST' })
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ profileKey: 'LLM_OPS', snapshot })
  expect(fetcher.mock.calls[2][0]).toBe('/api/admin/ai/profile-versions/version-2/activate')
})

test('preserves the public error envelope for forbidden and validation failures', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      traceId: 'trace-forbidden', error: { code: 'FORBIDDEN', message: 'Forbidden', retryable: false },
    }), { status: 403 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      traceId: 'trace-validation', error: { code: 'CONTRACT_VALIDATION_FAILED', message: 'Invalid snapshot', retryable: false },
    }), { status: 400 }))
  vi.stubGlobal('fetch', fetcher)
  vi.stubGlobal('crypto', { randomUUID: () => 'trace-id' })
  const api = new ProfileVersionApi('token', vi.fn(), vi.fn())

  const forbidden = await api.list().catch((failure: unknown) => failure)
  expect(forbidden).toBeInstanceOf(ProductApiError)
  expect(forbidden).toMatchObject({ status: 403, code: 'FORBIDDEN', traceId: 'trace-forbidden' })

  const invalid = await api.create('NATURAL_CMS', snapshot).catch((failure: unknown) => failure)
  expect(invalid).toBeInstanceOf(ProductApiError)
  expect(invalid).toMatchObject({ status: 400, code: 'CONTRACT_VALIDATION_FAILED', traceId: 'trace-validation' })
})

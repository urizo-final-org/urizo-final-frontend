import { afterEach, expect, test, vi } from 'vitest'
import { ProductApiError } from '../../shared/api/error'
import { ProfileVersionApi, type ProfileAuthoringSnapshot } from './api'

afterEach(() => vi.unstubAllGlobals())

const snapshot: ProfileAuthoringSnapshot = {
  nodes: [], edges: [], config: { maxNodes: 1, maxAttempts: 3, loopLimits: [] },
  modelBindings: {}, toolPolicy: { allowedTools: [] }, guardrailProfileKey: 'central.default',
}

test('lists, creates, activates, and reads Editor Layout through the admin contract', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response('[]'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ profileVersionId: 'version-2' }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ profileVersionId: 'version-2', status: 'ACTIVE' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ profileVersionId: 'version-2', createdAt: '2026-09-03T00:00:00Z', nodes: [{ id: 'start', x: 48, y: 48 }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ profileVersionId: 'version-2', createdAt: '2026-09-03T00:00:00Z', nodes: [{ id: 'start', x: 48, y: 48 }] }), { status: 201 }))
  vi.stubGlobal('fetch', fetcher)
  vi.stubGlobal('crypto', { randomUUID: () => 'trace-id' })
  const api = new ProfileVersionApi('token', vi.fn(), vi.fn())

  await expect(api.list('LLM_OPS')).resolves.toEqual([])
  await expect(api.create('LLM_OPS', snapshot)).resolves.toMatchObject({ profileVersionId: 'version-2' })
  await expect(api.activate('version-2')).resolves.toMatchObject({ status: 'ACTIVE' })
  await expect(api.getEditorLayout('version-2')).resolves.toMatchObject({ nodes: [{ id: 'start', x: 48, y: 48 }] })
  await expect(api.saveEditorLayout('version-2', [{ id: 'start', x: 48, y: 48 }])).resolves.toMatchObject({ profileVersionId: 'version-2' })

  expect(fetcher.mock.calls[0][0]).toBe('/api/admin/ai/profile-versions?profileKey=LLM_OPS')
  expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'POST' })
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ profileKey: 'LLM_OPS', snapshot })
  expect(fetcher.mock.calls[2][0]).toBe('/api/admin/ai/profile-versions/version-2/activate')
  expect(fetcher.mock.calls[3][0]).toBe('/api/admin/ai/profile-versions/version-2/editor-layout')
  expect(fetcher.mock.calls[4][1]).toMatchObject({ method: 'PUT' })
  expect(JSON.parse(fetcher.mock.calls[4][1].body)).toEqual({ nodes: [{ id: 'start', x: 48, y: 48 }] })
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

test('manages local provider credentials with the one-time CSRF token and never expects a returned secret', async () => {
  const overview = {
    csrfToken: 'csrf-fixture',
    providers: [{ provider: 'OPENAI', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null }],
    checkedAt: '2026-08-31T00:00:00Z',
  }
  const stored = {
    provider: 'OPENAI', configured: true, state: 'STORED', fingerprintSuffix: 'abc123fixture',
    updatedAt: '2026-08-31T00:01:00Z', lastTestedAt: null,
  }
  const tested = {
    provider: 'OPENAI', modelId: 'fixture-model', state: 'VERIFIED', inferenceExecuted: true,
    inputTokens: 1, outputTokens: 1, latencyMs: 12, testedAt: '2026-08-31T00:02:00Z', safeCode: 'OK',
  }
  const removed = { ...stored, configured: false, state: null, fingerprintSuffix: null, updatedAt: null }
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(overview)))
    .mockResolvedValueOnce(new Response(JSON.stringify(stored)))
    .mockResolvedValueOnce(new Response(JSON.stringify(tested)))
    .mockResolvedValueOnce(new Response(JSON.stringify(removed)))
  vi.stubGlobal('fetch', fetcher)
  vi.stubGlobal('crypto', { randomUUID: () => 'trace-id' })
  const api = new ProfileVersionApi('token', vi.fn(), vi.fn())

  await expect(api.listProviderCredentials()).resolves.toEqual(overview)
  await expect(api.storeProviderCredential('OPENAI', 'fixture-credential-value', 'csrf-fixture')).resolves.toEqual(stored)
  await expect(api.testProviderCredential('OPENAI', 'csrf-fixture')).resolves.toEqual(tested)
  await expect(api.deleteProviderCredential('OPENAI', 'csrf-fixture')).resolves.toEqual(removed)

  expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
    '/internal/dev/provider-credentials',
    '/internal/dev/provider-credentials/OPENAI',
    '/internal/dev/provider-credentials/OPENAI/test',
    '/internal/dev/provider-credentials/OPENAI',
  ])
  expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([undefined, 'PUT', 'POST', 'DELETE'])
  expect(new Headers(fetcher.mock.calls[1][1].headers).get('X-AXMS-CSRF')).toBe('csrf-fixture')
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ credential: 'fixture-credential-value' })
  expect(JSON.stringify(stored)).not.toContain('fixture-credential-value')
})

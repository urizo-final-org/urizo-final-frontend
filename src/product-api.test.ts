import { describe, expect, test, vi } from 'vitest'
import { ProductApi, ProductApiError, fetchProductSession } from './product-api'

const requestId = '66666666-6666-4666-8666-666666666666'

describe('ProductApi', () => {
  test('obtains the loopback product session without persisting or echoing the bearer token', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      schemaVersion: '1.0',
      accessToken: 'boot-random-local-token',
      tokenType: 'Bearer',
      actorId: '11111111-1111-4111-8111-111111111111',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const session = await fetchProductSession(fetcher)

    expect(session.actorId).toBe('11111111-1111-4111-8111-111111111111')
    expect(session.bearerToken).toBe('boot-random-local-token')
    expect(fetcher).toHaveBeenCalledWith('/internal/dev/product-session', expect.objectContaining({
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    }))
  })

  test('keeps the browser receiver when the default fetch implementation is used', async () => {
    const receiverSensitiveFetch = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      return Promise.resolve(new Response(JSON.stringify({
        schemaVersion: '1.0',
        accessToken: 'boot-random-bound-token',
        tokenType: 'Bearer',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    vi.stubGlobal('fetch', receiverSensitiveFetch)

    try {
      await expect(fetchProductSession()).resolves.toMatchObject({
        bearerToken: 'boot-random-bound-token',
      })
      expect(receiverSensitiveFetch.mock.instances[0]).toBe(globalThis)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('adds bearer, trace and idempotency headers to a public mutation', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      schemaVersion: '1.0',
      traceId: requestId,
      projectId: '11111111-1111-4111-8111-111111111111',
      name: 'Local Full Demo',
      status: 'ACTIVE',
      createdAt: '2026-08-11T12:00:00Z',
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
    const api = new ProductApi('local-session-token', fetcher, () => requestId)

    await api.createProject({ name: 'Local Full Demo' })

    const [path, init] = fetcher.mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(path).toBe('/api/projects')
    expect(init.method).toBe('POST')
    expect(headers.get('Authorization')).toBe('Bearer local-session-token')
    expect(headers.get('X-Trace-Id')).toBe(requestId)
    expect(headers.get('Idempotency-Key')).toBe(requestId)
    expect(JSON.parse(String(init.body))).toEqual({ schemaVersion: '1.0', name: 'Local Full Demo' })
  })

  test('maps the nested public ErrorEnvelope without losing retry metadata', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      schemaVersion: '1.0',
      traceId: requestId,
      error: {
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'The original request is still running.',
        retryable: true,
        retryAfterMs: 750,
      },
    }), { status: 409, headers: { 'Content-Type': 'application/json' } }))
    const api = new ProductApi('local-session-token', fetcher, () => requestId)

    const failure = await api.createProject({ name: 'Local Full Demo' }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ProductApiError)
    expect(failure).toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
      traceId: requestId,
      retryable: true,
      retryAfterMs: 750,
    })
  })

  test('accepts named collection envelopes from list operations', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      schemaVersion: '1.0',
      traceId: requestId,
      projects: [{
        schemaVersion: '1.0',
        traceId: requestId,
        projectId: '11111111-1111-4111-8111-111111111111',
        name: 'Restored Project',
        status: 'ACTIVE',
        createdAt: '2026-08-11T12:00:00Z',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const api = new ProductApi('local-session-token', fetcher, () => requestId)

    await expect(api.listProjects()).resolves.toEqual([
      expect.objectContaining({ name: 'Restored Project' }),
    ])
  })

  test('emits the exact state-transition and RAG request bodies without client authority fields', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const api = new ProductApi('local-session-token', fetcher, () => requestId)
    const connectorId = '11111111-1111-4111-8111-111111111111'
    const connectorVersionId = '22222222-2222-4222-8222-222222222222'
    const knowledgeBaseId = '33333333-3333-4333-8333-333333333333'
    const knowledgeVersionId = '44444444-4444-4444-8444-444444444444'
    const chatbotId = '55555555-5555-4555-8555-555555555555'

    await api.activateConnector(connectorId, connectorVersionId)
    await api.rollbackKnowledgeBase(knowledgeBaseId, knowledgeVersionId)
    await api.queryChatbot(chatbotId, '서울 축제')

    expect(fetcher.mock.calls.map(([path, init]) => [path, JSON.parse(String((init as RequestInit).body))])).toEqual([
      [`/api/connectors/${connectorId}/versions/${connectorVersionId}/activate`, { schemaVersion: '1.0' }],
      [`/api/knowledge-bases/${knowledgeBaseId}/rollback`, {
        schemaVersion: '1.0',
        targetKnowledgeVersionId: knowledgeVersionId,
      }],
      [`/api/chatbots/${chatbotId}/query`, {
        schemaVersion: '1.0',
        query: '서울 축제',
        topK: 5,
      }],
    ])
  })
})

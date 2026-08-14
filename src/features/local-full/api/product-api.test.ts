import { describe, expect, test, vi } from 'vitest'
import { ProductApiError } from '../../../shared/api/error'
import { fetchCurrentSession, login, logout } from '../../../shared/api/session'
import { ProductApi } from './product-api'

const requestId = '66666666-6666-4666-8666-666666666666'
const actorId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'

function loginResponse(role: 'SUPER_ADMIN' | 'GENERAL_ADMIN', projects: string[] = []): Response {
  return new Response(JSON.stringify({
    schemaVersion: '1.0',
    traceId: requestId,
    sessionToken: 'issued-opaque-session-token-value',
    tokenType: 'Bearer',
    expiresAt: '2026-08-13T17:00:00Z',
    actor: { actorId, role, assignedProjectIds: projects },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('session', () => {
  test('exchanges credentials for a session carrying the server-derived actor', async () => {
    const fetcher = vi.fn().mockResolvedValue(loginResponse('GENERAL_ADMIN', [projectId]))

    const session = await login('customer-operator', 'a-password-value', fetcher, () => requestId)

    expect(session.sessionToken).toBe('issued-opaque-session-token-value')
    expect(session.actor).toEqual({ actorId, role: 'GENERAL_ADMIN', assignedProjectIds: [projectId] })

    const [path, init] = fetcher.mock.calls[0] as [string, RequestInit]
    expect(path).toBe('/api/auth/login')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe(requestId)
    expect(JSON.parse(String(init.body))).toEqual({
      schemaVersion: '1.0',
      loginId: 'customer-operator',
      passwordValue: 'a-password-value',
    })
  })

  test('reports one message for every rejected credential so accounts cannot be enumerated', async () => {
    const rejection = new Response(JSON.stringify({
      schemaVersion: '1.0',
      traceId: requestId,
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'A valid administrator session is required.', retryable: false },
    }), { status: 401, headers: { 'Content-Type': 'application/json' } })

    const failure = await login('who', 'wrong-password', vi.fn().mockResolvedValue(rejection), () => requestId)
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ProductApiError)
    expect(failure).toMatchObject({ status: 401, message: '아이디 또는 비밀번호가 올바르지 않습니다.' })
  })

  test('refuses a session response carrying an unknown role', async () => {
    const forged = new Response(JSON.stringify({
      schemaVersion: '1.0',
      sessionToken: 'issued-opaque-session-token-value',
      actor: { actorId, role: 'REVIEWER', assignedProjectIds: [] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

    await expect(login('who', 'a-password-value', vi.fn().mockResolvedValue(forged), () => requestId))
      .rejects.toMatchObject({ code: 'SESSION_RESPONSE_INVALID' })
  })

  test('confirms a stored token against the server rather than trusting it', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      schemaVersion: '1.0',
      traceId: requestId,
      actor: { actorId, role: 'SUPER_ADMIN', assignedProjectIds: [] },
      expiresAt: '2026-08-13T17:00:00Z',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const session = await fetchCurrentSession('stored-session-token', fetcher, () => requestId)

    expect(session.actor.role).toBe('SUPER_ADMIN')
    const [path, init] = fetcher.mock.calls[0] as [string, RequestInit]
    expect(path).toBe('/api/auth/me')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer stored-session-token')
  })

  test('signing out never fails, so a transport error cannot strand a signed-in operator', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('network down'))

    await expect(logout('stored-session-token', fetcher, () => requestId)).resolves.toBeUndefined()
  })

  test('keeps the browser receiver when the default fetch implementation is used', async () => {
    const receiverSensitiveFetch = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      return Promise.resolve(loginResponse('SUPER_ADMIN'))
    })
    vi.stubGlobal('fetch', receiverSensitiveFetch)

    try {
      await expect(login('delivery-engineer', 'a-password-value')).resolves.toMatchObject({
        sessionToken: 'issued-opaque-session-token-value',
      })
      expect(receiverSensitiveFetch.mock.instances[0]).toBe(globalThis)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('ProductApi', () => {
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

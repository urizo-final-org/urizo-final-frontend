import { afterEach, expect, test, vi } from 'vitest'
import { ProductApiError } from '../../shared/api/error'
import { queryPublicChat } from './public-api'

afterEach(() => vi.unstubAllGlobals())

const ANSWER = {
  schemaVersion: '1.0', traceId: 't', conversationId: 'c', outcome: 'ANSWERED',
  answer: '…', citations: [], generatedAt: '2026-09-05T00:00:00Z',
}

function stubFetch(status = 200, body: unknown = ANSWER) {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function sentInit(fetch: ReturnType<typeof stubFetch>) {
  return fetch.mock.calls[0][1] as RequestInit
}

function sentBody(fetch: ReturnType<typeof stubFetch>) {
  return JSON.parse(String(sentInit(fetch).body))
}

test('posts the query to the public endpoint', async () => {
  const fetch = stubFetch()
  await queryPublicChat({ query: '한옥스테이' })

  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0][0]).toBe('/api/public/chat/query')
  expect(sentInit(fetch).method).toBe('POST')
  expect(sentBody(fetch).query).toBe('한옥스테이')
})

// 접두가 여러 개인 탭(체험·레저 = LS + EX)이 있어 단일 문자열로는 표현되지 않는다.
test('serializes category as an array', () => {
  const fetch = stubFetch()
  return queryPublicChat({ query: '체험', category: ['LS', 'EX'] }).then(() => {
    expect(sentBody(fetch).category).toEqual(['LS', 'EX'])
  })
})

// null을 보내면 서버가 "필터 없음"이 아니라 "빈 값 필터"로 읽을 여지를 준다. 아예 뺀다.
test('omits category entirely when the 전체 tab is active', async () => {
  const fetch = stubFetch()
  await queryPublicChat({ query: '아무거나' })
  expect('category' in sentBody(fetch)).toBe(false)
})

test('omits category when the array is empty', async () => {
  const fetch = stubFetch()
  await queryPublicChat({ query: '아무거나', category: [] })
  expect('category' in sentBody(fetch)).toBe(false)
})

// 공개 경로 계약: Idempotency-Key 불요 · 본문 schemaVersion 불요 · topK 미수용.
test('sends none of the administrator-only request parts', async () => {
  const fetch = stubFetch()
  await queryPublicChat({ query: '한옥스테이', conversationId: 'c1' })

  const headers = sentInit(fetch).headers as Record<string, string>
  expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain('idempotency-key')
  expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain('authorization')
  expect(sentBody(fetch)).toEqual({ query: '한옥스테이', conversationId: 'c1' })
})

// 무인증 경로다. session.ts를 탔다면 401에서 refresh 요청이 한 번 더 나간다.
test('does not retry through the session refresh path', async () => {
  const fetch = stubFetch(401, { traceId: 'tr', error: { code: 'AUTHENTICATION_REQUIRED', message: '로그인이 필요합니다.' } })
  await expect(queryPublicChat({ query: 'x' })).rejects.toBeInstanceOf(ProductApiError)
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('carries code, traceId and retryAfterMs out of the error envelope', async () => {
  stubFetch(429, { traceId: 'tr-1', error: { code: 'RATE_LIMITED', message: '요청이 많습니다.', retryable: true, retryAfterMs: 60000 } })
  const failure = await queryPublicChat({ query: 'x' }).catch((error: unknown) => error)

  expect(failure).toBeInstanceOf(ProductApiError)
  const error = failure as ProductApiError
  expect([error.status, error.code, error.traceId, error.retryAfterMs]).toEqual([429, 'RATE_LIMITED', 'tr-1', 60000])
})

// /api/site/** 는 RFC 7807이라 traceId도 code도 없다. 같은 화면이 두 도메인을 함께 쓴다.
test('survives an error body with no traceId', async () => {
  stubFetch(404, { type: 'about:blank', title: 'Not Found', status: 404, detail: '없는 사이트입니다.' })
  const error = await queryPublicChat({ query: 'x' }).catch((failure: unknown) => failure) as ProductApiError

  expect(error.traceId).toBeUndefined()
  expect(error.message).toBe('없는 사이트입니다.')
  expect(error.code).toBe('HTTP_404')
})

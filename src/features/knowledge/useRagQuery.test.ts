import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ProductApiError } from '../../shared/api/error'
import { useRagQuery } from './useRagQuery'

afterEach(() => vi.unstubAllGlobals())

function answer(outcome: 'ANSWERED' | 'REFUSED') {
  return {
    schemaVersion: '1.0', traceId: 't-1', conversationId: 'c-1', outcome,
    answer: outcome === 'ANSWERED' ? '전주 한옥마을 인근…' : '근거를 찾지 못했습니다.',
    citations: [], generatedAt: '2026-09-05T00:00:00Z',
  }
}

function fail(code: string, retryAfterMs?: number) {
  return { traceId: 't-1', error: { code, message: code, retryable: retryAfterMs != null, retryAfterMs } }
}

function stub(...responses: Array<[number, unknown]>) {
  const fetch = vi.fn()
  for (const [status, body] of responses) {
    fetch.mockImplementationOnce(async () => new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json' },
    }))
  }
  vi.stubGlobal('fetch', fetch)
  return fetch
}

async function ask(...responses: Array<[number, unknown]>) {
  const fetch = stub(...responses)
  const { result } = renderHook(() => useRagQuery())
  await act(async () => { await result.current.ask({ query: '한옥스테이' }) })
  return { state: result.current.state, fetch }
}

test('ANSWERED becomes ready', async () => {
  const { state } = await ask([200, answer('ANSWERED')])
  expect(state.phase).toBe('ready')
  expect(state.data?.answer).toContain('전주 한옥마을')
})

// 거절은 오류가 아니라 정상 응답이다. error로 새면 화면이 실패 배너를 띄운다.
test('REFUSED becomes refused, not error', async () => {
  const { state } = await ask([200, answer('REFUSED')])
  expect(state.phase).toBe('refused')
  expect(state.error).toBeUndefined()
  expect(state.data?.outcome).toBe('REFUSED')
})

test('429 becomes rate_limited and keeps retryAfterMs', async () => {
  const { state } = await ask([429, fail('RATE_LIMITED', 60000)])
  expect(state.phase).toBe('rate_limited')
  expect(state.retryAfterMs).toBe(60000)
})

test('rate_limited falls back to the 60s window when the server omits retryAfterMs', async () => {
  const { state } = await ask([429, { traceId: 't', error: { code: 'RATE_LIMITED', message: '많음' } }])
  expect(state.retryAfterMs).toBe(60_000)
})

// 503은 잠깐 뒤 한 번 더 시도한다. retryAfterMs 0은 테스트가 기다리지 않으려는 값이다.
test('503 retries once and settles on the retry', async () => {
  const { state, fetch } = await ask([503, fail('SERVICE_NOT_READY', 0)], [200, answer('ANSWERED')])
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(state.phase).toBe('ready')
})

test('503 twice becomes not_ready and does not try a third time', async () => {
  const { state, fetch } = await ask([503, fail('SERVICE_NOT_READY', 0)], [503, fail('SERVICE_NOT_READY', 0)])
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(state.phase).toBe('not_ready')
})

test.each([
  [401, 'AUTHENTICATION_REQUIRED'],
  [404, 'PUBLIC_CHATBOT_NOT_CONFIGURED'],
  [400, 'VALIDATION_FAILED'],
])('%i %s becomes error', async (status, code) => {
  const { state, fetch } = await ask([status, fail(code)])
  expect(state.phase).toBe('error')
  expect((state.error as ProductApiError).code).toBe(code)
  expect(fetch).toHaveBeenCalledTimes(1)
})

// /api/site/** 는 RFC 7807이라 traceId가 없다. 축약 표시 자리를 비우면 되고 실패는 아니다.
test('handles a response with no traceId', async () => {
  // JSON.stringify가 undefined 키를 떨어뜨려 traceId 없는 본문이 된다.
  const { state } = await ask([200, { ...answer('ANSWERED'), traceId: undefined }])
  expect(state.phase).toBe('ready')
  expect(state.data?.traceId).toBeUndefined()
})

test('sends the category array through to the request body', async () => {
  const fetch = stub([200, answer('ANSWERED')])
  const { result } = renderHook(() => useRagQuery())
  await act(async () => { await result.current.ask({ query: '체험', category: ['LS', 'EX'] }) })

  expect(JSON.parse(String((fetch.mock.calls[0][1] as RequestInit).body)).category).toEqual(['LS', 'EX'])
})

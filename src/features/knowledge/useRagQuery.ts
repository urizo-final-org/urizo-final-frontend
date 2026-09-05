import { useCallback } from 'react'
import { ProductApiError } from '../../shared/api/error'
import { useAsync, type AsyncState } from '../../shared/hooks/useAsync'
import { queryPublicChat } from './public-api'
import type { PublicChatRequest, PublicChatResponse } from './types'

/**
 * A(검색)·B(챗봇) 공용 질의 훅. 둘이 같은 엔드포인트 하나를 쓰므로 훅도 하나다.
 *
 * <p>`REFUSED`는 오류가 아니라 정상 응답이다 — `refused` 상태로 내려보내 "근거를 찾지
 * 못했습니다" 화면을 그리게 하고, 오류 배너를 띄우지 않는다.
 *
 * <p>TODO: 상태 전이는 작성됐지만 **실호출로 검증되지 않았다.** S1(I5 배포) 전이라
 * `/api/public/**`가 401을 준다. 배포 후 §7 검수 항목(429·503·404·refused)을 실제로
 * 터뜨려 확인한다.
 */

/** 503은 잠깐 뒤 한 번 더 시도한다. 그 이상은 사람이 [다시 시도]를 누르는 편이 낫다. */
const AUTO_RETRY_ONCE_MS = 1000
const RATE_LIMIT_WINDOW_MS = 60_000

export function useRagQuery() {
  const { state, run, reset } = useAsync<PublicChatResponse>()

  const ask = useCallback((request: PublicChatRequest) => run(async (signal) => {
    try {
      return settle(await queryPublicChat(request, signal))
    }
    catch (failure) {
      if (signal.aborted) throw failure
      if (failure instanceof ProductApiError && failure.code === 'SERVICE_NOT_READY') {
        await wait(failure.retryAfterMs ?? AUTO_RETRY_ONCE_MS, signal)
        try {
          return settle(await queryPublicChat(request, signal))
        }
        catch (second) {
          if (signal.aborted) throw second
          return toFailedState(second)
        }
      }
      return toFailedState(failure)
    }
  }), [run])

  return { state, ask, reset }
}

function settle(response: PublicChatResponse): AsyncState<PublicChatResponse> {
  return { phase: response.outcome === 'REFUSED' ? 'refused' : 'ready', data: response }
}

/**
 * 오류 코드 → 화면 상태. 나머지(`AUTHENTICATION_REQUIRED`·`PUBLIC_CHATBOT_NOT_CONFIGURED`·
 * `VALIDATION_FAILED`·미분류)는 전부 `error`로 두고 `describeFailure()`가 문구를 만든다.
 * `traceId`는 `ProductApiError`가 그대로 들고 있고, 없는 경로(CMS RFC 7807)는 없는 대로 둔다.
 */
function toFailedState(failure: unknown): AsyncState<PublicChatResponse> {
  if (!(failure instanceof ProductApiError)) return { phase: 'error', error: failure }
  if (failure.code === 'RATE_LIMITED') {
    return { phase: 'rate_limited', error: failure, retryAfterMs: failure.retryAfterMs ?? RATE_LIMIT_WINDOW_MS }
  }
  if (failure.code === 'SERVICE_NOT_READY') {
    return { phase: 'not_ready', error: failure, retryAfterMs: failure.retryAfterMs ?? AUTO_RETRY_ONCE_MS }
  }
  return { phase: 'error', error: failure }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 요청 하나의 수명(취소 포함)만 맡는 작은 상태 그릇. 라이브러리를 넣지 않는 이유는 설계 §5에
 * 있다 — 캐싱·중복 제거가 이 화면에서 거의 무의미하고, `AbortController` 직접 사용이 더 명시적이다.
 *
 * <p>`refused`는 오류가 아니라 정상 응답이다. 그래서 실패 분기(catch)로 보내지 않고, 작업이
 * 스스로 최종 상태를 만들어 돌려준다. 호출자가 도메인 판정을 갖고 useAsync는 취소만 갖는다.
 */
export type AsyncPhase = 'idle' | 'loading' | 'ready' | 'refused' | 'error' | 'rate_limited' | 'not_ready'

export type AsyncState<T> = {
  phase: AsyncPhase
  data?: T
  error?: unknown
  /** 429·503이 알려준 재시도 간격. 화면 문구에 쓴다. */
  retryAfterMs?: number
}

export function useAsync<T>() {
  const [state, setState] = useState<AsyncState<T>>({ phase: 'idle' })
  const inFlight = useRef<AbortController | null>(null)

  // 언마운트 시 진행 중 요청을 끊는다. 끊긴 요청은 상태를 건드리지 않는다.
  useEffect(() => () => inFlight.current?.abort(), [])

  const run = useCallback(async (task: (signal: AbortSignal) => Promise<AsyncState<T>>) => {
    inFlight.current?.abort()
    const current = new AbortController()
    inFlight.current = current
    setState({ phase: 'loading' })
    try {
      const settled = await task(current.signal)
      if (!current.signal.aborted) setState(settled)
    }
    catch (failure) {
      // 뒤늦게 도착한 이전 요청의 실패로 화면을 덮지 않는다(탭 연타 방어).
      if (current.signal.aborted) return
      setState({ phase: 'error', error: failure })
    }
  }, [])

  const reset = useCallback(() => {
    inFlight.current?.abort()
    inFlight.current = null
    setState({ phase: 'idle' })
  }, [])

  return { state, run, reset }
}

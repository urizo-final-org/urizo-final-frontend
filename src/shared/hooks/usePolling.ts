import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 일정 간격 반복 실행. RAG 관리 화면(C)의 빌드 진행 폴링용이다.
 *
 * <p>탭이 보이지 않으면 멈추고, 돌아오면 즉시 한 번 돌린 뒤 재개한다. 연속 실패가
 * `maxFailures`에 닿으면 스스로 멈춘다 — 죽은 서버를 5초마다 두드리지 않기 위해서다.
 * 재개는 화면이 [재개] 버튼으로 `resume()`을 부른다.
 */
export function usePolling(
  tick: () => Promise<unknown> | unknown,
  { intervalMs, enabled, maxFailures = 3 }: { intervalMs: number; enabled: boolean; maxFailures?: number },
) {
  const [stopped, setStopped] = useState(false)
  const failures = useRef(0)
  // tick은 매 렌더 새 함수라 의존성에 넣으면 타이머가 계속 재설정된다.
  const latest = useRef(tick)
  latest.current = tick

  useEffect(() => {
    if (!enabled || stopped) return
    let timer: ReturnType<typeof setInterval> | undefined

    const beat = async () => {
      try {
        await latest.current()
        failures.current = 0
      }
      catch {
        failures.current += 1
        if (failures.current >= maxFailures) setStopped(true)
      }
    }
    const start = () => { if (timer === undefined) timer = setInterval(beat, intervalMs) }
    const stop = () => { clearInterval(timer); timer = undefined }
    const onVisibility = () => {
      stop()
      if (document.hidden) return
      void beat()
      start()
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, stopped, intervalMs, maxFailures])

  const resume = useCallback(() => {
    failures.current = 0
    setStopped(false)
  }, [])

  return { stopped, resume }
}

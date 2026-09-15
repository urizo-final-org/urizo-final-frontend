import { useEffect, useLayoutEffect, useRef } from 'react'

/** Session/API replacement supplies fresh credentials without becoming a read trigger. */
export function useObservabilityRead(
  read: (signal: AbortSignal) => void | (() => void),
  queryKey: unknown,
  minimumIntervalMs = 0,
) {
  const latestRead = useRef(read)
  const lastStarted = useRef<number | null>(null)
  useLayoutEffect(() => { latestRead.current = read })
  useEffect(() => {
    if (queryKey === null) return
    let controller: AbortController | undefined
    let cleanup: void | (() => void)
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      clearTimeout(timer)
      controller?.abort()
      cleanup?.()
      cleanup = undefined
    }
    const start = () => {
      stop()
      if (document.hidden) return
      const wait = Math.max(0, (lastStarted.current ?? -Infinity) + minimumIntervalMs - Date.now())
      const run = () => {
        if (document.hidden) return
        lastStarted.current = Date.now()
        controller = new AbortController()
        cleanup = latestRead.current(controller.signal)
      }
      if (wait > 0) timer = setTimeout(run, wait)
      else run()
    }
    start()
    document.addEventListener('visibilitychange', start)
    return () => { stop(); document.removeEventListener('visibilitychange', start) }
  }, [queryKey, minimumIntervalMs])
}

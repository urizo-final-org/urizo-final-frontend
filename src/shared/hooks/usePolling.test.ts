import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { usePolling } from './usePolling'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  setHidden(false)
})

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

test('runs the tick on every interval while enabled', async () => {
  const tick = vi.fn()
  renderHook(() => usePolling(tick, { intervalMs: 5000, enabled: true }))

  await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
  expect(tick).toHaveBeenCalledTimes(3)
})

test('does not run while disabled', async () => {
  const tick = vi.fn()
  renderHook(() => usePolling(tick, { intervalMs: 5000, enabled: false }))

  await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
  expect(tick).not.toHaveBeenCalled()
})

// 탭이 숨으면 멈추고, 돌아오면 즉시 한 번 돌린 뒤 재개한다.
test('stops while the tab is hidden and catches up on return', async () => {
  const tick = vi.fn()
  renderHook(() => usePolling(tick, { intervalMs: 5000, enabled: true }))

  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(tick).toHaveBeenCalledTimes(1)

  act(() => setHidden(true))
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
  expect(tick).toHaveBeenCalledTimes(1)

  await act(async () => { setHidden(false) })
  expect(tick).toHaveBeenCalledTimes(2)

  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(tick).toHaveBeenCalledTimes(3)
})

// 죽은 서버를 5초마다 계속 두드리지 않는다.
test('stops itself after three consecutive failures', async () => {
  const tick = vi.fn(() => Promise.reject(new Error('죽음')))
  const { result } = renderHook(() => usePolling(tick, { intervalMs: 1000, enabled: true }))

  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  expect(result.current.stopped).toBe(true)

  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(tick).toHaveBeenCalledTimes(3)
})

test('a success in between clears the failure streak', async () => {
  const tick = vi.fn()
    .mockRejectedValueOnce(new Error('1'))
    .mockRejectedValueOnce(new Error('2'))
    .mockResolvedValueOnce(undefined)
    .mockRejectedValue(new Error('again'))
  const { result } = renderHook(() => usePolling(tick, { intervalMs: 1000, enabled: true }))

  await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
  expect(result.current.stopped).toBe(false)
})

test('resume restarts a stopped poller', async () => {
  const tick = vi.fn(() => Promise.reject(new Error('죽음')))
  const { result } = renderHook(() => usePolling(tick, { intervalMs: 1000, enabled: true }))

  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  expect(result.current.stopped).toBe(true)

  act(() => result.current.resume())
  expect(result.current.stopped).toBe(false)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(tick).toHaveBeenCalledTimes(4)
})

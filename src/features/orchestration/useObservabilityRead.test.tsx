import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useObservabilityRead } from './useObservabilityRead'

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})

test('coalesces rapid occurrence changes, keeps latest credentials, and cancels work when hidden', () => {
  vi.useFakeTimers()
  const calls: { key: number; token: string; signal: AbortSignal }[] = []
  const view = renderHook(({ key, token }) => useObservabilityRead(signal => {
    calls.push({ key, token, signal })
  }, key, 30_000), { initialProps: { key: 1, token: 'first' } })
  expect(calls).toHaveLength(1)
  for (let key = 2; key <= 20; key++) {
    act(() => vi.advanceTimersByTime(1_000))
    view.rerender({ key, token: 'first' })
  }
  expect(calls).toHaveLength(1)
  expect(calls[0].signal.aborted).toBe(true)
  view.rerender({ key: 20, token: 'refreshed' })
  act(() => vi.advanceTimersByTime(11_000))
  expect(calls).toHaveLength(2)
  expect(calls[1]).toMatchObject({ key: 20, token: 'refreshed' })
  act(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(calls[1].signal.aborted).toBe(true)
  view.rerender({ key: 21, token: 'refreshed' })
  act(() => vi.advanceTimersByTime(60_000))
  expect(calls).toHaveLength(2)
  act(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(calls).toHaveLength(3)
  expect(calls[2].key).toBe(21)
  view.rerender({ key: 22, token: 'refreshed' })
  view.unmount()
  act(() => vi.advanceTimersByTime(60_000))
  expect(calls).toHaveLength(3)
})

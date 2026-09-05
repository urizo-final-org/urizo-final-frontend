import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { useAsync, type AsyncState } from './useAsync'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((ok, no) => { resolve = ok; reject = no })
  return { promise, resolve, reject }
}

const ready = (data: string): AsyncState<string> => ({ phase: 'ready', data })

test('goes idle → loading → ready', async () => {
  const { result } = renderHook(() => useAsync<string>())
  expect(result.current.state.phase).toBe('idle')

  const gate = deferred<AsyncState<string>>()
  act(() => { void result.current.run(() => gate.promise) })
  expect(result.current.state.phase).toBe('loading')

  await act(async () => { gate.resolve(ready('답변')); await gate.promise })
  expect(result.current.state).toEqual({ phase: 'ready', data: '답변' })
})

test('goes idle → loading → error when the task throws', async () => {
  const { result } = renderHook(() => useAsync<string>())
  const boom = new Error('터짐')

  await act(async () => { await result.current.run(() => Promise.reject(boom)) })
  expect(result.current.state).toEqual({ phase: 'error', error: boom })
})

test('aborts the previous request when a new one starts', async () => {
  const { result } = renderHook(() => useAsync<string>())
  const signals: AbortSignal[] = []
  const first = deferred<AsyncState<string>>()

  act(() => { void result.current.run((signal) => { signals.push(signal); return first.promise }) })
  await act(async () => { await result.current.run((signal) => { signals.push(signal); return Promise.resolve(ready('두번째')) }) })

  expect(signals[0].aborted).toBe(true)
  expect(signals[1].aborted).toBe(false)
  expect(result.current.state.data).toBe('두번째')
})

// 탭 8개를 연타하면 늦게 도착한 첫 응답이 마지막 결과를 덮을 수 있다.
test('ignores a late answer from an aborted request', async () => {
  const { result } = renderHook(() => useAsync<string>())
  const stale = deferred<AsyncState<string>>()

  act(() => { void result.current.run(() => stale.promise) })
  await act(async () => { await result.current.run(() => Promise.resolve(ready('최신'))) })
  await act(async () => { stale.resolve(ready('뒤늦은 옛 응답')); await stale.promise })

  await waitFor(() => expect(result.current.state.data).toBe('최신'))
})

test('reset puts the hook back to idle', async () => {
  const { result } = renderHook(() => useAsync<string>())
  await act(async () => { await result.current.run(() => Promise.resolve(ready('답변'))) })

  act(() => result.current.reset())
  expect(result.current.state).toEqual({ phase: 'idle' })
})

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { TokenUsageChart } from './IntegratedObservabilityDashboard'
import { tokenBucketRange } from './TokenUsageDetail'
import type { AgentSettingsApiClient, ObservabilityMetricsResponse, TokenUsageResponse } from './api'

const data: TokenUsageResponse = { status: 'AVAILABLE', errorCode: null, environment: 'local', granularity: 'hour',
  from: '2026-09-12T09:34:00Z', to: '2026-09-12T11:10:00Z', points: [
    { bucketStart: '2026-09-12T09:00:00Z', inputTokens: 0, outputTokens: 7, totalTokens: 10 },
    { bucketStart: '2026-09-12T10:00:00Z', inputTokens: null, outputTokens: null, totalTokens: null },
    { bucketStart: '2026-09-12T11:00:00Z', inputTokens: 3, outputTokens: 2, totalTokens: 8 },
  ] }
const result = (from: string, to: string): ObservabilityMetricsResponse => ({ status: 'AVAILABLE', errorCode: null, from, to, environment: 'local', rows: [
  { model: 'gemini-test', observationCount: 2, inputTokens: 0, outputTokens: 7, totalTokens: 10, totalCost: 0.001, p50LatencyMs: 42, p95LatencyMs: 90 },
  { model: null, observationCount: 1, inputTokens: null, outputTokens: null, totalTokens: null, totalCost: null, p50LatencyMs: null, p95LatencyMs: null },
] })
const bucket = (index: number) => screen.getByRole('button', { name: `${data.points[index].bucketStart} 구간 상세` })
const hover = (index: number) => {
  const point = document.querySelector(`[data-token-point="${index}"]`)
  if (point) fireEvent.mouseEnter(point)
  else fireEvent.focus(bucket(index)) // A missing value has no pointer target; keyboard detail remains accessible.
}

afterEach(() => vi.useRealTimers())

test('clips first/last hourly and daily buckets to the original UTC range', () => {
  expect(tokenBucketRange(data, data.points[0])).toEqual({ from: '2026-09-12T09:34:00.000Z', to: '2026-09-12T10:00:00.000Z' })
  expect(tokenBucketRange(data, data.points[2])).toEqual({ from: '2026-09-12T11:00:00.000Z', to: '2026-09-12T11:10:00.000Z' })
  const daily = { ...data, granularity: 'day' as const, to: '2026-09-15T11:10:00Z' }
  expect(tokenBucketRange(daily, { ...data.points[0], bucketStart: '2026-09-12T00:00:00Z' })?.to).toBe('2026-09-13T00:00:00.000Z')
  expect(tokenBucketRange(data, { ...data.points[0], bucketStart: data.to })).toBeNull()
})

test('hover shows raw totals immediately, debounces exact Job/bucket metrics and reuses bounded results', async () => {
  vi.useFakeTimers()
  const read = vi.fn((from: string, to: string) => Promise.resolve(result(from, to)))
  render(<TokenUsageChart data={data} jobId="job-a" getMetrics={read} />)
  hover(0)
  const detail = screen.getByRole('region', { name: '시간 구간 상세' })
  expect(detail).toHaveTextContent('10') // Not the recomputed input+output value 7.
  await act(() => vi.advanceTimersByTimeAsync(299))
  expect(read).not.toHaveBeenCalled()
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(read).toHaveBeenCalledWith('2026-09-12T09:34:00.000Z', '2026-09-12T10:00:00.000Z', 'job-a', expect.any(AbortSignal))
  expect(detail).toHaveTextContent('gemini-test')
  expect(detail).toHaveTextContent('모델 미제공')
  expect(detail).toHaveTextContent('미제공')
  expect(detail).toHaveTextContent('90')
  expect(detail).toHaveTextContent('2026-09-12 09:34:00')
  expect(detail).toHaveTextContent('2026-09-12 10:00:00')
  expect(detail.querySelector('time')?.dateTime).toBe('2026-09-12T09:34:00.000Z')
  expect(detail.querySelector('[class*="overflow-y"], [class*="max-h-"]')).toBeNull()
  expect(detail.querySelectorAll('article')).toHaveLength(2)
  hover(2)
  await act(() => vi.advanceTimersByTimeAsync(300))
  hover(0)
  await act(() => vi.advanceTimersByTimeAsync(300))
  expect(read).toHaveBeenCalledTimes(2)
})

test('model display limits reuse the same result without changing totals or issuing another query', async () => {
  vi.useFakeTimers()
  const read = vi.fn((from: string, to: string) => Promise.resolve({
    ...result(from, to), rows: Array.from({ length: 12 }, (_, index) => ({ ...result(from, to).rows[0], model: `model-${index}` })),
  }))
  const view = render(<TokenUsageChart data={data} getMetrics={read} modelLimit={3} />)
  hover(0)
  await act(() => vi.advanceTimersByTimeAsync(300))
  const detail = screen.getByRole('region', { name: '시간 구간 상세' })
  expect(detail.querySelectorAll('article')).toHaveLength(3)
  expect(detail).toHaveTextContent('조회된 12개 중 3개 표시')
  const totals = detail.querySelector('dl')!.textContent
  view.rerender(<TokenUsageChart data={data} getMetrics={read} modelLimit={10} />)
  expect(detail.querySelectorAll('article')).toHaveLength(10)
  view.rerender(<TokenUsageChart data={data} getMetrics={read} modelLimit={50} />)
  expect(detail.querySelectorAll('article')).toHaveLength(12)
  expect(detail.querySelector('dl')!.textContent).toBe(totals)
  await act(() => vi.advanceTimersByTimeAsync(300))
  expect(read).toHaveBeenCalledTimes(1)
})

test('rapid hover cancels pending work and null gaps do not become zero usage', async () => {
  vi.useFakeTimers()
  const read = vi.fn((from: string, to: string) => Promise.resolve({ ...result(from, to), rows: [] }))
  render(<TokenUsageChart data={data} getMetrics={read} />)
  hover(0)
  await act(() => vi.advanceTimersByTimeAsync(100))
  hover(1)
  expect(within(screen.getByRole('region', { name: '시간 구간 상세' })).getAllByText('미제공')).toHaveLength(3)
  await act(() => vi.advanceTimersByTimeAsync(300))
  expect(read).toHaveBeenCalledTimes(1)
  expect(read).toHaveBeenCalledWith('2026-09-12T10:00:00.000Z', '2026-09-12T11:00:00.000Z', undefined, expect.any(AbortSignal))
  expect(screen.getByText('이 구간의 모델 관측이 없습니다.')).toBeInTheDocument()
})

test('ignores late bucket responses, closes with Escape and supports keyboard selection without pinning', async () => {
  vi.useFakeTimers()
  let finish!: (value: ObservabilityMetricsResponse) => void
  const read = vi.fn((_from: string, _to: string, _job?: string, _signal?: AbortSignal) => new Promise<ObservabilityMetricsResponse>((resolve) => { finish = resolve }))
  const view = render(<TokenUsageChart data={data} getMetrics={read} />)
  hover(0)
  await act(() => vi.advanceTimersByTimeAsync(300))
  const signal = read.mock.calls[0][3]!
  fireEvent.focus(bucket(2))
  expect(signal.aborted).toBe(true)
  await act(async () => finish(result(data.from, '2026-09-12T10:00:00.000Z')))
  expect(screen.queryByText('gemini-test')).not.toBeInTheDocument()
  expect(bucket(2)).toHaveAttribute('aria-expanded', 'true')
  hover(0) // Pointer selection is no longer pinned by keyboard focus.
  expect(bucket(0)).toHaveAttribute('aria-expanded', 'true')
  fireEvent.keyDown(bucket(2), { key: 'Escape' })
  expect(screen.queryByRole('region', { name: '시간 구간 상세' })).not.toBeInTheDocument()
  fireEvent.click(bucket(0))
  fireEvent.click(screen.getByRole('button', { name: '시간 구간 상세 닫기' }))
  expect(screen.queryByRole('region', { name: '시간 구간 상세' })).not.toBeInTheDocument()
  view.unmount()
})

test.each(['DISABLED', 'UNAVAILABLE', 'mismatch', 'rejected'] as const)('handles %s without hiding the graph', async (state) => {
  vi.useFakeTimers()
  const read = vi.fn((from: string, to: string) => state === 'rejected' ? Promise.reject(new Error('failed'))
    : Promise.resolve({ ...result(from, to), ...(state === 'mismatch' ? { environment: 'production' } : { status: state }) }))
  render(<TokenUsageChart data={data} getMetrics={read} />)
  hover(0)
  await act(() => vi.advanceTimersByTimeAsync(300))
  expect(screen.getByRole('img')).toBeInTheDocument()
  const detail = screen.getByRole('region', { name: '시간 구간 상세' })
  expect(detail).toHaveTextContent(state === 'DISABLED' ? '관측 연결 안 됨' : state === 'UNAVAILABLE' ? '일시 사용 불가' : state === 'mismatch' ? 'UTC 구간 또는 환경이 일치하지 않습니다' : 'failed')
  expect(detail).not.toHaveTextContent('gemini-test')
})

test('changing Job, period or refreshing chart data discards old details', async () => {
  vi.useFakeTimers()
  const read = vi.fn<AgentSettingsApiClient['getObservabilityMetrics']>((from, to) => Promise.resolve(result(from, to)))
  const view = render(<TokenUsageChart key="first" data={data} jobId="job-a" getMetrics={read} />)
  hover(0)
  await act(() => vi.advanceTimersByTimeAsync(300))
  view.rerender(<TokenUsageChart key="refresh" data={data} jobId="job-b" getMetrics={read} />)
  expect(screen.queryByRole('region', { name: '시간 구간 상세' })).not.toBeInTheDocument()
  hover(0)
  await act(() => vi.advanceTimersByTimeAsync(300))
  expect(read.mock.lastCall?.[2]).toBe('job-b')
})

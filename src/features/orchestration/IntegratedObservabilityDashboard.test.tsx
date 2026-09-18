import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { test, expect, vi } from 'vitest'
import IntegratedObservabilityDashboard, { TokenUsageChart } from './IntegratedObservabilityDashboard'
import type { ObservabilityResponse, TokenUsageResponse } from './api'

const query = { from: '2026-09-01T00:00:00.000Z', to: '2026-09-01T03:00:00.000Z', jobId: '11111111-1111-4111-8111-111111111111' }
const base = { status: 'AVAILABLE' as const, errorCode: null, from: query.from, to: query.to, environment: 'local' }
const tokenData: TokenUsageResponse = { ...base, granularity: 'hour', points: [
  { bucketStart: '2026-09-01T00:00:00Z', inputTokens: 0, outputTokens: 5, totalTokens: 9 },
  { bucketStart: '2026-09-01T01:00:00Z', inputTokens: null, outputTokens: null, totalTokens: null },
  { bucketStart: '2026-09-01T02:00:00Z', inputTokens: 12, outputTokens: 8, totalTokens: 24 },
] }
const node: ObservabilityResponse['observations'][number] = {
  id: 'node-1', traceId: 'otel', parentObservationId: null, type: 'SPAN', name: 'axms.node', level: null,
  environment: 'local', startTime: query.from, endTime: query.to, model: null, inputTokens: null, outputTokens: null, latencyMs: 240,
  metadata: { jobId: query.jobId, traceId: 'business', profileVersionId: 'v1', nodeId: 'analyze', nodeType: 'agent', nodeStatus: 'COMPLETED', attempt: 2, provider: null, model: null, inputTokens: null, outputTokens: null, latencyMs: 240, errorCode: null, toolStatus: null, checkStatus: null },
}
function api() {
  return {
    getObservations: vi.fn().mockImplementation((from, to) => Promise.resolve({ ...base, from, to, observations: [node], nextCursor: 'older', limit: 50 })),
    getObservabilityMetrics: vi.fn().mockImplementation((from, to) => Promise.resolve({ ...base, from, to, rows: [{ model: 'model-test', observationCount: 4, inputTokens: 12, outputTokens: null, totalTokens: null, totalCost: 0.1, p50LatencyMs: 20, p95LatencyMs: 30 }] })),
    getTokenUsage: vi.fn().mockImplementation((from, to) => Promise.resolve({ ...tokenData, from, to })),
    getScores: vi.fn(() => { throw new Error('Scores are out of scope') }),
  }
}

test('combines three independent reads with identical filters and drilldown without any score call', async () => {
  const client = api()
  const onDetail = vi.fn()
  render(<IntegratedObservabilityDashboard api={client} query={query} onDetail={onDetail} />)
  await screen.findByText('계측 응답 3/3')
  expect(client.getObservations).toHaveBeenCalledWith(query.from, query.to, { jobId: query.jobId, kind: 'NODE', limit: 50 }, expect.any(AbortSignal))
  for (const read of [client.getObservabilityMetrics, client.getTokenUsage]) expect(read).toHaveBeenCalledWith(query.from, query.to, query.jobId, expect.any(AbortSignal))
  const nodes = screen.getByRole('region', { name: 'Node 계측 요약' })
  expect(nodes).toHaveTextContent('analyze')
  expect(nodes).toHaveTextContent('COMPLETED / 2')
  expect(nodes).toHaveTextContent('240 ms')
  expect(nodes).toHaveTextContent('전체 건수나 성공률 집계가 아닙니다')
  expect(screen.getByRole('region', { name: 'Provider 계측 요약' })).toHaveTextContent('model-test')
  expect(screen.getByRole('img', { name: /토큰 사용량 그래프/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Node 상세 보기' }))
  fireEvent.click(screen.getByRole('button', { name: 'Provider 상세 보기' }))
  expect(onDetail.mock.calls).toEqual([['node'], ['provider']])
  expect(client.getScores).not.toHaveBeenCalled()
})

test('session refresh does not repeat aggregates and an explicit refresh uses the latest API', async () => {
  const first = api()
  const refreshed = api()
  const view = render(<IntegratedObservabilityDashboard api={first} query={query} onDetail={vi.fn()} />)
  await screen.findByText('계측 응답 3/3')
  view.rerender(<IntegratedObservabilityDashboard api={refreshed} query={query} onDetail={vi.fn()} />)
  await act(async () => {})
  expect(first.getObservabilityMetrics).toHaveBeenCalledTimes(1)
  expect(refreshed.getObservabilityMetrics).not.toHaveBeenCalled()
  expect(refreshed.getTokenUsage).not.toHaveBeenCalled()
  view.rerender(<IntegratedObservabilityDashboard api={refreshed} query={{ ...query }} onDetail={vi.fn()} />)
  await screen.findByText('계측 응답 3/3')
  expect(refreshed.getObservabilityMetrics).toHaveBeenCalledTimes(1)
  expect(refreshed.getTokenUsage).toHaveBeenCalledTimes(1)
})

test('hidden dashboard defers reads and ignores a response aborted on hiding', async () => {
  const client = api()
  Object.defineProperty(document, 'hidden', { configurable: true, value: true })
  const view = render(<IntegratedObservabilityDashboard api={client} query={query} onDetail={vi.fn()} />)
  try {
    expect(client.getObservabilityMetrics).not.toHaveBeenCalled()
    let resolve!: (value: unknown) => void
    client.getObservabilityMetrics.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(client.getObservabilityMetrics).toHaveBeenCalledTimes(1)
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(client.getObservabilityMetrics.mock.calls[0][3].aborted).toBe(true)
    await act(async () => { resolve({ ...base, rows: [{ model: 'STALE' }] }) })
    expect(screen.queryByText('STALE')).not.toBeInTheDocument()
  } finally {
    view.unmount()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  }
})

test('period presets preserve the applied end and Job while display controls do not query again', async () => {
  const client = api()
  const onRangeChange = vi.fn()
  const view = render(<IntegratedObservabilityDashboard api={client} query={query} onDetail={vi.fn()} onRangeChange={onRangeChange} />)
  await screen.findByText('계측 응답 3/3')
  expect(screen.getByLabelText('조회 기간')).toHaveValue('')
  for (const hours of [24, 48, 168, 720]) {
    fireEvent.change(screen.getByLabelText('조회 기간'), { target: { value: String(hours) } })
    expect(onRangeChange).toHaveBeenLastCalledWith({ ...query, from: new Date(Date.parse(query.to) - hours * 3600000).toISOString() })
  }
  fireEvent.change(screen.getByLabelText('상세 표시 모델 수'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('패널 폭'), { target: { value: '390px' } })
  expect(screen.getByRole('region', { name: '통합 계측 대시보드 결과' })).toHaveStyle({ width: '390px' })
  expect(screen.getByRole('region', { name: 'Node 계측 요약' })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Provider 계측 요약' })).toBeInTheDocument()
  for (const read of [client.getTokenUsage, client.getObservabilityMetrics, client.getObservations]) expect(read).toHaveBeenCalledTimes(1)
  const next = onRangeChange.mock.calls.at(-1)![0]
  view.rerender(<IntegratedObservabilityDashboard api={client} query={next} onDetail={vi.fn()} onRangeChange={onRangeChange} />)
  await screen.findByText('계측 응답 3/3')
  expect(screen.getByLabelText('조회 기간')).toHaveValue('720')
  expect(screen.getByText(/집계 간격: 일별/)).toBeInTheDocument()
  expect(client.getTokenUsage).toHaveBeenLastCalledWith(next.from, next.to, query.jobId, expect.any(AbortSignal))
})

test('chart preserves zeros, raw totals, null gaps and provides an exact accessible data table', () => {
  const { container } = render(<TokenUsageChart data={tokenData} />)
  const table = screen.getByRole('table', { hidden: true })
  const rows = within(table).getAllByRole('row', { hidden: true })
  expect(within(rows[1]).getAllByRole('cell', { hidden: true }).map((cell) => cell.textContent)).toEqual(['2026-09-01T00:00:00Z', '0', '5', '9'])
  expect(within(rows[2]).getAllByText('제공되지 않음')).toHaveLength(3)
  expect(within(rows[3]).getAllByRole('cell', { hidden: true }).map((cell) => cell.textContent)).toEqual(['2026-09-01T02:00:00Z', '12', '8', '24'])
  const path = container.querySelector('[data-series="inputTokens"]')?.getAttribute('d')
  expect(path?.match(/M /g)).toHaveLength(2)
  expect(path).not.toContain('L ')
  expect(container.querySelectorAll('circle')).toHaveLength(6)
})

const hit = (index: number) => document.querySelector(`[data-token-point="${index}"]`)!

test('tooltip floats over the plot, transfers to the popup and auto closes without click pinning', async () => {
  vi.useFakeTimers()
  try {
  render(<TokenUsageChart data={tokenData} getMetrics={api().getObservabilityMetrics} />)
  const first = screen.getByRole('button', { name: `${tokenData.points[0].bucketStart} 구간 상세` })
  const last = screen.getByRole('button', { name: `${tokenData.points[2].bucketStart} 구간 상세` })
  fireEvent.mouseEnter(hit(0))
  const detail = document.getElementById(first.getAttribute('aria-controls')!)!
  expect(detail).toHaveClass('absolute', 'z-50')
  expect(detail).toHaveAttribute('role', 'dialog')
  expect(first).toHaveAttribute('aria-haspopup', 'dialog')
  fireEvent.mouseLeave(hit(0))
  fireEvent.mouseEnter(detail)
  await act(() => vi.advanceTimersByTimeAsync(200))
  expect(first).toHaveAttribute('aria-expanded', 'true')
  fireEvent.mouseEnter(hit(2))
  expect(last).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(last)
  fireEvent.mouseLeave(hit(2))
  fireEvent.mouseEnter(hit(0))
  expect(first).toHaveAttribute('aria-expanded', 'true')
  fireEvent.mouseLeave(hit(0))
  await act(() => vi.advanceTimersByTimeAsync(180))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  } finally { vi.useRealTimers() }
})

test('close suppresses stationary re-entry beneath the popup until the pointer actually moves', () => {
  render(<TokenUsageChart data={tokenData} getMetrics={api().getObservabilityMetrics} />)
  const first = screen.getByRole('button', { name: `${tokenData.points[0].bucketStart} 구간 상세` })
  fireEvent.mouseEnter(hit(0))
  const popup = screen.getByRole('dialog')
  fireEvent.mouseMove(popup, { clientX: 250, clientY: 180 })
  fireEvent.click(screen.getByRole('button', { name: '시간 구간 상세 닫기' }))
  fireEvent.mouseEnter(hit(0))
  fireEvent.mouseMove(hit(0), { clientX: 250, clientY: 180 })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.mouseMove(hit(0), { clientX: 260, clientY: 180 })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

test('blank plot, grid and axis do not open details; only line strokes and valid points accept pointers', () => {
  render(<TokenUsageChart data={tokenData} getMetrics={api().getObservabilityMetrics} />)
  fireEvent.mouseEnter(screen.getByText('구간 시작 (UTC) · 1시간 간격'))
  fireEvent.mouseEnter(screen.getByRole('img'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  const first = screen.getByRole('button', { name: `${tokenData.points[0].bucketStart} 구간 상세` })
  expect(first).toHaveClass('pointer-events-none')
  fireEvent.mouseEnter(first)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  const line = document.querySelector('[data-token-line="inputTokens"]')!
  expect(line).toHaveAttribute('pointer-events', 'stroke')
  expect(line).toHaveAttribute('stroke-width', '10')
  expect(line.getAttribute('d')).not.toContain('L ') // Null gap has no bridging hit target.
  expect(document.querySelector('[data-token-point="1"]')).toBeNull()
  fireEvent.mouseEnter(hit(0))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

test('connected line strokes select the nearest bucket using rendered SVG coordinates', () => {
  const rect = vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 1600, 572))
  try {
    const points = tokenData.points.map((point, index) => ({ ...point, inputTokens: 10 + index }))
    render(<TokenUsageChart data={{ ...tokenData, points }} getMetrics={api().getObservabilityMetrics} />)
    const line = document.querySelector('[data-token-line="inputTokens"]')!
    expect(line).toHaveAttribute('d', document.querySelector('[data-series="inputTokens"]')!.getAttribute('d'))
    fireEvent.mouseEnter(line, { clientX: 100 + (66 + 342 * 0.75) * 2, clientY: 200 })
    expect(screen.getByRole('button', { name: `${points[1].bucketStart} 구간 상세` })).toHaveAttribute('aria-expanded', 'true')
  } finally { rect.mockRestore() }
})

test('leaving the popup closes it and unmount clears the leave timer', async () => {
  vi.useFakeTimers()
  try {
    const view = render(<TokenUsageChart data={tokenData} getMetrics={api().getObservabilityMetrics} />)
    fireEvent.focus(screen.getByRole('button', { name: `${tokenData.points[0].bucketStart} 구간 상세` }))
    fireEvent.mouseLeave(screen.getByRole('dialog'))
    await act(() => vi.advanceTimersByTimeAsync(180))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  } finally { vi.useRealTimers() }
})

test('tooltip clamps to viewport and chart width, and a tall overlay scrolls with the page', () => {
  let width = 920
  let height = 520
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute('role') === 'dialog') return new DOMRect(0, 0, 888, height)
    if (this.hasAttribute('data-token-bucket')) return new DOMRect(850, 340, 42, 160)
    return new DOMRect(40, 260, width, 300)
  })
  try {
    render(<TokenUsageChart data={tokenData} getMetrics={api().getObservabilityMetrics} />)
    fireEvent.focus(screen.getByRole('button', { name: `${tokenData.points[2].bucketStart} 구간 상세` }))
    const tooltip = screen.getByRole('dialog', { name: '시간 구간 툴팁' })
    expect(tooltip).toHaveStyle({ left: '238px', width: '560px', top: '-24px' })
    width = 340; height = 1500
    fireEvent.resize(window)
    expect(tooltip).toHaveStyle({ left: '16px', width: '308px', top: '-248px' })
    expect(tooltip.style.maxHeight).toBe('')
    expect(tooltip.style.overflowY).toBe('')
    fireEvent.scroll(document)
    expect(tooltip).toHaveStyle({ top: '-248px' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  } finally { rect.mockRestore() }
})

test('hourly axis exposes every returned hour across midnight without changing the data', () => {
  const points = Array.from({ length: 25 }, (_, index) => ({ ...tokenData.points[0],
    bucketStart: new Date(Date.UTC(2026, 8, 12, 11 + index)).toISOString() }))
  const { container } = render(<TokenUsageChart data={{ ...tokenData, points }} />)
  const ticks = container.querySelectorAll('[data-time-tick]')
  expect(ticks).toHaveLength(25)
  expect(ticks[0]).toHaveTextContent('09-1211:00')
  expect(ticks[13]).toHaveTextContent('09-1300:00')
  expect(ticks[24]).toHaveTextContent('09-1311:00')
  expect(screen.getByText('구간 시작 (UTC) · 1시간 간격')).toBeInTheDocument()
  expect(container.querySelector('svg[role="img"]')?.parentElement).toHaveStyle({ minWidth: '1166px' })
})

test('daily data stays daily and explains how to request hourly detail', () => {
  render(<TokenUsageChart data={{ ...tokenData, granularity: 'day' }} />)
  expect(screen.getByText('구간 시작 (UTC) · 1일 간격')).toBeInTheDocument()
  expect(screen.getByText(/시간별로 확인하려면 조회 기간을 48시간 이하로/)).toBeInTheDocument()
})

test('empty and all-null time series do not invent a zero line', async () => {
  const client = api()
  client.getTokenUsage.mockResolvedValue({ ...tokenData, points: [] })
  const view = render(<IntegratedObservabilityDashboard api={client} query={query} onDetail={vi.fn()} />)
  const tokens = screen.getByRole('region', { name: '토큰 사용량 추이' })
  await waitFor(() => expect(tokens).toHaveTextContent('선택한 조건의 관측 데이터가 없습니다.'))
  expect(within(tokens).queryByRole('img')).not.toBeInTheDocument()
  view.unmount()
  render(<TokenUsageChart data={{ ...tokenData, points: [tokenData.points[1]] }} />)
  expect(screen.getByText('토큰 값이 제공되지 않아 그래프를 표시할 수 없습니다.')).toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('one rejected source does not hide healthy sections and refresh can recover', async () => {
  const client = api()
  client.getTokenUsage.mockRejectedValueOnce(new Error('Token request failed'))
  const view = render(<IntegratedObservabilityDashboard api={client} query={query} onDetail={vi.fn()} />)
  await screen.findByRole('alert')
  expect(screen.getByRole('region', { name: 'Node 계측 요약' })).toHaveTextContent('analyze')
  expect(screen.getByRole('region', { name: 'Provider 계측 요약' })).toHaveTextContent('model-test')
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  view.rerender(<IntegratedObservabilityDashboard api={client} query={{ ...query }} onDetail={vi.fn()} />)
  await screen.findByText('계측 응답 3/3')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('img')).toBeInTheDocument()
})

test('disabled, upstream unavailable and mismatched query states remain distinct', async () => {
  const client = api()
  client.getObservations.mockResolvedValue({ ...base, status: 'DISABLED', observations: [] })
  client.getObservabilityMetrics.mockResolvedValue({ ...base, status: 'UNAVAILABLE', rows: [] })
  client.getTokenUsage.mockResolvedValue({ ...tokenData, environment: 'production' })
  render(<IntegratedObservabilityDashboard api={client} query={query} onDetail={vi.fn()} />)
  await screen.findByRole('alert')
  expect(screen.getByRole('region', { name: 'Node 계측 요약' })).toHaveTextContent('관측 연결 안 됨')
  expect(screen.getByRole('region', { name: 'Provider 계측 요약' })).toHaveTextContent('관측 일시 사용 불가')
  expect(screen.getByRole('alert')).toHaveTextContent('UTC 기간 또는 환경이 일치하지 않습니다')
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('rejects a different time window but accepts equivalent UTC precision', async () => {
  const client = api()
  client.getObservabilityMetrics.mockResolvedValue({ ...base, from: '2026-08-01T00:00:00Z', rows: [] })
  client.getTokenUsage.mockResolvedValue({ ...tokenData, from: '2026-09-01T00:00:00Z', to: '2026-09-01T03:00:00Z' })
  render(<IntegratedObservabilityDashboard api={client} query={query} onDetail={vi.fn()} />)
  await screen.findByRole('alert')
  expect(screen.getByRole('alert')).toHaveTextContent('UTC 기간 또는 환경이 일치하지 않습니다')
  expect(screen.getByRole('img')).toBeInTheDocument()
})

test('changing Job filters aborts old requests, clears old graphs and ignores late responses', async () => {
  const client = api()
  let resolveOld!: (data: TokenUsageResponse) => void
  client.getTokenUsage.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
  const view = render(<IntegratedObservabilityDashboard api={client} query={query} onDetail={vi.fn()} />)
  await screen.findByText('계측 응답 2/3')
  const oldSignal = client.getTokenUsage.mock.calls[0][3]
  const next = { ...query, jobId: '' }
  client.getTokenUsage.mockResolvedValue({ ...tokenData, points: [] })
  view.rerender(<IntegratedObservabilityDashboard api={client} query={next} onDetail={vi.fn()} />)
  await screen.findByText('계측 응답 3/3')
  expect(oldSignal.aborted).toBe(true)
  expect(client.getTokenUsage.mock.lastCall?.[2]).toBeUndefined()
  await act(async () => resolveOld(tokenData))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  const latestSignal = client.getTokenUsage.mock.lastCall?.[3]
  view.unmount()
  expect(latestSignal.aborted).toBe(true)
})

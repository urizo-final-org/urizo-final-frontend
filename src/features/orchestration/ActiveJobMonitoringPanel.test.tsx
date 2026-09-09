import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import ActiveJobMonitoringPanel from './ActiveJobMonitoringPanel'
import type { AgentSettingsApiClient, MonitoringJobSnapshotResponse, MonitoringJobSummary, ProfileVersion } from './api'

const job: MonitoringJobSummary = {
  jobId: '11111111-1111-4111-8111-111111111111', traceId: '22222222-2222-4222-8222-222222222222',
  profileVersionId: '33333333-3333-4333-8333-333333333333', profileKey: 'LLM_OPS', profileVersion: 2,
  domainJobStatus: 'RUNNING', domainTerminal: false, stateVersion: 5, pipelineAttempt: 1, executionAttempt: 1,
  monitorStatus: 'RUNNING', monitorRevision: 2,
  currentNode: { nodeId: 'code', nodeSequence: 2, nodeType: 'agent', handlerKey: 'coding.code', status: 'RUNNING' },
  profileSnapshotPath: '/api/admin/ai/profile-versions?profileKey=LLM_OPS',
  profileLayoutPath: '/api/admin/ai/profile-versions/33333333-3333-4333-8333-333333333333/editor-layout',
  lastUpdatedAt: '2026-09-07T00:00:02Z',
}

const profile: ProfileVersion = {
  profileVersionId: job.profileVersionId, profileKey: 'LLM_OPS', profileVersion: 2, status: 'ACTIVE', createdAt: '2026-09-07T00:00:00Z',
  snapshot: {
    contractVersion: '1.0', profileVersionId: job.profileVersionId, profileKey: 'LLM_OPS', profileVersion: 2,
    nodes: [
      { id: 'analyze', type: 'agent', handlerKey: 'coding.analyze', resultPorts: ['feasible'], config: {} },
      { id: 'code', type: 'agent', handlerKey: 'coding.code', resultPorts: ['completed'], config: {} },
    ],
    edges: [{ from: 'analyze', resultPort: 'feasible', to: 'code' }],
    config: { maxNodes: 10, maxAttempts: 3, loopLimits: [] }, modelBindings: {}, toolBindings: {},
    toolPolicy: { allowedTools: [] }, guardrailProfileKey: 'central.default',
  },
}

function snapshot(overrides: Partial<MonitoringJobSnapshotResponse['job']> = {}): MonitoringJobSnapshotResponse {
  const nextJob = { ...job, ...overrides }
  return {
    schemaVersion: '1.0', observedAt: nextJob.lastUpdatedAt, job: nextJob, truncated: true,
    latestNodeStates: [
      { nodeId: 'analyze', nodeType: 'agent', handlerKey: 'coding.analyze', status: 'COMPLETED', pipelineAttempt: 1, executionAttempt: 1, nodeSequence: 1, lastUpdatedAt: '2026-09-07T00:00:01Z' },
      { nodeId: 'code', nodeType: 'agent', handlerKey: 'coding.code', status: nextJob.domainTerminal ? 'COMPLETED' : 'RUNNING', pipelineAttempt: 1, executionAttempt: 1, nodeSequence: 2, lastUpdatedAt: nextJob.lastUpdatedAt },
    ],
    occurrences: [{
      jobId: nextJob.jobId, profileVersionId: nextJob.profileVersionId, pipelineAttempt: 1, executionAttempt: 1,
      nodeId: 'code', nodeSequence: 2, traceId: nextJob.traceId, observationTraceId: 'a'.repeat(32),
      nodeType: 'agent', handlerKey: 'coding.code', status: nextJob.domainTerminal ? 'COMPLETED' : 'RUNNING',
      startedAt: '2026-09-07T00:00:01Z', waitingAt: null, completedAt: nextJob.domainTerminal ? nextJob.lastUpdatedAt : null,
      failedAt: null, errorCode: null,
      observationsPath: `/api/admin/ai/monitoring/jobs/${nextJob.jobId}/occurrences/1/1/2/observations`,
      lastUpdatedAt: nextJob.lastUpdatedAt,
    }],
  }
}

function monitoringApi(overrides: Partial<AgentSettingsApiClient> = {}) {
  return {
    listMonitoringJobs: vi.fn().mockResolvedValue({ schemaVersion: '1.0', observedAt: job.lastUpdatedAt, jobs: [job] }),
    getMonitoringJobSnapshot: vi.fn().mockResolvedValue(snapshot()),
    getMonitoringOccurrenceObservations: vi.fn().mockResolvedValue({
      status: 'AVAILABLE', errorCode: null, jobId: job.jobId, profileVersionId: job.profileVersionId,
      pipelineAttempt: 1, executionAttempt: 1, nodeId: 'code', nodeSequence: 2,
      from: '2026-09-07T00:00:01Z', to: '2026-09-07T00:00:02Z', environment: 'local', truncated: false,
      observations: [{
        id: 'observation-1', traceId: 'a'.repeat(32), parentObservationId: null, type: 'GENERATION', name: 'axms.model', level: null,
        environment: 'local', startTime: '2026-09-07T00:00:01Z', endTime: '2026-09-07T00:00:02Z', model: 'gpt-5.6-sol', inputTokens: 10, outputTokens: 4, latencyMs: 120,
        metadata: { jobId: job.jobId, traceId: job.traceId, profileVersionId: job.profileVersionId, nodeId: 'code', nodeType: 'agent', nodeStatus: null, attempt: 1, pipelineAttempt: 1, executionAttempt: 1, nodeSequence: 2, provider: 'OPENAI', model: 'gpt-5.6-sol', inputTokens: 10, outputTokens: 4, latencyMs: 120, errorCode: null, toolStatus: null, checkStatus: null },
      }],
    }),
    list: vi.fn().mockResolvedValue([profile]),
    getEditorLayout: vi.fn().mockResolvedValue({ profileVersionId: job.profileVersionId, createdAt: '2026-09-07T00:00:00Z', nodes: [{ id: 'analyze', x: 48, y: 64 }, { id: 'code', x: 300, y: 64 }] }),
    ...overrides,
  } as unknown as AgentSettingsApiClient
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => { resolve = accept })
  return { promise, resolve }
}

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})

test('renders the fixed Profile layout with actual N/P and keeps Q unconfigured', async () => {
  render(<ActiveJobMonitoringPanel api={monitoringApi()} />)
  expect(await screen.findByLabelText('읽기 전용 Node Canvas')).toBeInTheDocument()
  expect(screen.getByLabelText('code Node')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByLabelText('code Node')).toHaveTextContent('N · 진행 중')
  expect(screen.getByLabelText('code Node')).toHaveTextContent('Q · 미설정')
  expect(screen.getByRole('region', { name: 'N 상태 상세' })).toHaveTextContent('진행 중')
  expect(screen.getByRole('region', { name: 'N 상태 상세' })).toHaveTextContent(/진행 시간\d+초/)
  await waitFor(() => expect(screen.getByRole('region', { name: 'P Provider 상세' })).toHaveTextContent('OPENAI'))
  await waitFor(() => expect(screen.getByLabelText('code Node')).toHaveTextContent('P · 연결됨'))
  expect(screen.getByLabelText('code Node')).toHaveAttribute('data-node-current', 'true')
  expect(screen.getByLabelText('code Node').querySelector('.monitoring-node-activity')).not.toBeNull()
  expect(screen.getByLabelText('analyze Node').querySelector('.monitoring-node-activity')).toBeNull()
  expect(screen.getByRole('region', { name: 'P Provider 상세' })).toHaveTextContent('gpt-5.6-sol')
  expect(screen.getByRole('region', { name: 'Q 평가 상세' })).toHaveTextContent('평가 미설정')
  expect(screen.getByRole('region', { name: 'Node occurrence 이력' })).toHaveTextContent('일부 과거 이력은 잘렸으며 최신 Node 상태는 유지됩니다.')
})

test('zooms around the pointer and consumes wheel events at both limits without scrolling the page', async () => {
  const { unmount } = render(<ActiveJobMonitoringPanel api={monitoringApi()} />)
  const canvas = await screen.findByLabelText('읽기 전용 Node Canvas')
  canvas.getBoundingClientRect = () => ({ left: 20, top: 30, width: 600, height: 400, right: 620, bottom: 430, x: 20, y: 30, toJSON: () => ({}) })
  canvas.scrollLeft = 100
  canvas.scrollTop = 80
  const outerWheel = vi.fn()
  const outer = canvas.parentElement!
  outer.addEventListener('wheel', outerWheel)
  const wheel = (deltaY: number, deltaX = 0) => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, deltaX, clientX: 220, clientY: 130 })
    fireEvent(canvas, event)
    return event
  }
  expect(wheel(-100).defaultPrevented).toBe(true)
  expect(canvas).toHaveAttribute('data-canvas-zoom', '1.1')
  expect(canvas.scrollLeft).toBeCloseTo(130)
  expect(canvas.scrollTop).toBeCloseTo(98)
  expect(screen.getByLabelText('모니터링 Canvas 확대 비율')).toHaveTextContent('110%')
  for (let i = 0; i < 8; i++) expect(wheel(-100).defaultPrevented).toBe(true)
  expect(canvas).toHaveAttribute('data-canvas-zoom', '1.5')
  for (let i = 0; i < 12; i++) expect(wheel(100).defaultPrevented).toBe(true)
  expect(canvas).toHaveAttribute('data-canvas-zoom', '0.5')
  expect(wheel(0, 100).defaultPrevented).toBe(true)
  expect(outerWheel).not.toHaveBeenCalled()
  outer.removeEventListener('wheel', outerWheel)
  unmount()
  expect(wheel(-100).defaultPrevented).toBe(false)
})

test('pans only the background, releases capture on cancel, and keeps Node selection read-only', async () => {
  render(<ActiveJobMonitoringPanel api={monitoringApi()} />)
  const canvas = await screen.findByLabelText('읽기 전용 Node Canvas')
  canvas.scrollLeft = 100
  canvas.scrollTop = 80
  canvas.setPointerCapture = vi.fn()
  canvas.hasPointerCapture = vi.fn().mockReturnValue(true)
  canvas.releasePointerCapture = vi.fn()
  const pointer = (element: Element, type: string, values: Record<string, number>) =>
    fireEvent(element, Object.assign(new Event(type, { bubbles: true, cancelable: true }), { button: 0, pointerId: 7, ...values }))
  pointer(canvas, 'pointerdown', { clientX: 300, clientY: 200 })
  expect(canvas.setPointerCapture).toHaveBeenCalledWith(7)
  expect(canvas).toHaveClass('cursor-grabbing')
  pointer(canvas, 'pointermove', { pointerId: 8, clientX: 100, clientY: 100 })
  expect(canvas.scrollLeft).toBe(100)
  pointer(canvas, 'pointermove', { clientX: 250, clientY: 160 })
  expect(canvas.scrollLeft).toBe(150)
  expect(canvas.scrollTop).toBe(120)
  pointer(canvas, 'pointercancel', {})
  expect(canvas.releasePointerCapture).toHaveBeenCalledWith(7)
  expect(canvas).toHaveClass('cursor-grab')
  pointer(canvas, 'pointermove', { clientX: 200, clientY: 100 })
  expect(canvas.scrollLeft).toBe(150)
  const node = screen.getByLabelText('analyze Node')
  const savedPosition = node.getAttribute('style')
  pointer(node, 'pointerdown', { clientX: 150, clientY: 150 })
  pointer(node, 'pointermove', { clientX: 100, clientY: 100 })
  fireEvent.click(node)
  expect(canvas.setPointerCapture).toHaveBeenCalledTimes(1)
  expect(node).toHaveAttribute('aria-pressed', 'true')
  expect(node.getAttribute('style')).toBe(savedPosition)
  expect(canvas.scrollLeft).toBe(150)
})

test('marks a live approval-wait Node as current and gives N, P, and Q distinct signal tones', async () => {
  const state = snapshot({ domainJobStatus: 'WAITING_APPROVAL' })
  state.latestNodeStates[1].status = 'WAITING_APPROVAL'
  render(<ActiveJobMonitoringPanel api={monitoringApi({
    getMonitoringJobSnapshot: vi.fn().mockResolvedValue(state),
    getMonitoringOccurrenceObservations: vi.fn().mockReturnValue(new Promise(() => {})),
  })} />)
  const node = await screen.findByLabelText('code Node')
  expect(node).toHaveAttribute('data-node-running', 'false')
  expect(node).toHaveAttribute('data-node-current', 'true')
  expect(node.querySelector('.monitoring-node-activity')).not.toBeNull()
  expect(within(node).getByText('N · 승인 대기')).toHaveAttribute('data-node-status', 'WAITING_APPROVAL')
  await waitFor(() => expect(within(node).getByText('P · 관측 대기')).toHaveAttribute('data-provider-tone', 'pending'))
  expect(within(node).getByText('Q · 미설정')).toHaveAttribute('data-quality-status', 'unconfigured')
})

test.each(['FAILED', 'COMPLETED'] as const)('does not animate a terminal %s Node', async (status) => {
  const state = snapshot({ domainTerminal: true, domainJobStatus: status })
  state.latestNodeStates[1].status = status
  render(<ActiveJobMonitoringPanel api={monitoringApi({ getMonitoringJobSnapshot: vi.fn().mockResolvedValue(state) })} />)
  const node = await screen.findByLabelText('code Node')
  expect(node).toHaveAttribute('data-node-current', 'false')
  expect(node.querySelector('.monitoring-node-activity')).toBeNull()
})

test('preserves zoom across accepted polling and suppresses stale RUNNING decoration on terminal Jobs', async () => {
  vi.useFakeTimers()
  const terminal = snapshot({ monitorRevision: 3, stateVersion: 6, domainTerminal: true, domainJobStatus: 'FAILED' })
  terminal.latestNodeStates[1].status = 'RUNNING'
  const getMonitoringJobSnapshot = vi.fn().mockResolvedValueOnce(snapshot()).mockResolvedValue(terminal)
  render(<ActiveJobMonitoringPanel api={monitoringApi({ getMonitoringJobSnapshot })} />)
  await act(async () => {})
  const canvas = screen.getByLabelText('읽기 전용 Node Canvas')
  fireEvent.wheel(canvas, { deltaY: -100 })
  fireEvent.click(screen.getByLabelText('analyze Node'))
  await act(async () => { vi.advanceTimersByTime(1_000) })
  expect(canvas).toHaveAttribute('data-canvas-zoom', '1.1')
  expect(screen.getByLabelText('analyze Node')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByLabelText('code Node').querySelector('.monitoring-node-activity')).toBeNull()
})

test('does not overlap polls, discards a hidden stale response, resumes immediately, and latches terminal', async () => {
  vi.useFakeTimers()
  const first = deferred<MonitoringJobSnapshotResponse>()
  const second = deferred<MonitoringJobSnapshotResponse>()
  const getMonitoringJobSnapshot = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  render(<ActiveJobMonitoringPanel api={monitoringApi({ getMonitoringJobSnapshot })} />)
  await act(async () => {})
  expect(getMonitoringJobSnapshot).toHaveBeenCalledTimes(1)
  await act(async () => { vi.advanceTimersByTime(5_000) })
  expect(getMonitoringJobSnapshot).toHaveBeenCalledTimes(1)

  Object.defineProperty(document, 'hidden', { configurable: true, value: true })
  document.dispatchEvent(new Event('visibilitychange'))
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  document.dispatchEvent(new Event('visibilitychange'))
  expect(getMonitoringJobSnapshot).toHaveBeenCalledTimes(2)

  await act(async () => { first.resolve(snapshot({ monitorRevision: 99, stateVersion: 99, domainJobStatus: 'STALE' })) })
  await act(async () => { second.resolve(snapshot({ monitorRevision: 3, stateVersion: 6, domainJobStatus: 'COMPLETED', domainTerminal: true, lastUpdatedAt: '2026-09-07T00:00:03Z' })) })
  expect(screen.queryByText('STALE')).not.toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: '실행 모니터링 상세' })).getAllByText('COMPLETED')).toHaveLength(2)

  Object.defineProperty(document, 'hidden', { configurable: true, value: true })
  document.dispatchEvent(new Event('visibilitychange'))
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  document.dispatchEvent(new Event('visibilitychange'))
  await act(async () => { vi.advanceTimersByTime(5_000) })
  expect(getMonitoringJobSnapshot).toHaveBeenCalledTimes(2)
})

test('discards the previous Job response after selection changes', async () => {
  const secondJob = { ...job, jobId: '44444444-4444-4444-8444-444444444444', traceId: '55555555-5555-4555-8555-555555555555' }
  const first = deferred<MonitoringJobSnapshotResponse>()
  const getMonitoringJobSnapshot = vi.fn().mockImplementation((jobId: string) => jobId === job.jobId ? first.promise : Promise.resolve(snapshot({ ...secondJob, domainJobStatus: 'WAITING_APPROVAL' })))
  const api = monitoringApi({
    listMonitoringJobs: vi.fn().mockResolvedValue({ schemaVersion: '1.0', observedAt: job.lastUpdatedAt, jobs: [job, secondJob] }),
    getMonitoringJobSnapshot,
  })
  render(<ActiveJobMonitoringPanel api={api} />)
  await waitFor(() => expect(screen.getByLabelText('실행 모니터링 Job')).toHaveValue(''))
  expect(await screen.findByRole('option', { name: '모니터링할 Job을 선택하세요' })).toHaveProperty('selected', true)
  expect(getMonitoringJobSnapshot).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('실행 모니터링 Job'), { target: { value: job.jobId } })
  await waitFor(() => expect(getMonitoringJobSnapshot).toHaveBeenCalledWith(job.jobId, expect.any(AbortSignal)))
  fireEvent.change(screen.getByLabelText('실행 모니터링 Job'), { target: { value: secondJob.jobId } })
  await waitFor(() => expect(within(screen.getByRole('region', { name: '실행 모니터링 상세' })).getAllByText('WAITING_APPROVAL')).toHaveLength(2))
  await act(async () => { first.resolve(snapshot({ monitorRevision: 99, stateVersion: 99, domainJobStatus: 'STALE' })) })
  expect(screen.queryByText('STALE')).not.toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: '실행 모니터링 상세' })).getAllByText('WAITING_APPROVAL')).toHaveLength(2)
})

test('rejects a stale terminal response without stopping later polling', async () => {
  vi.useFakeTimers()
  const getMonitoringJobSnapshot = vi.fn()
    .mockResolvedValueOnce(snapshot({ monitorRevision: 2, stateVersion: 5, domainJobStatus: 'RUNNING' }))
    .mockResolvedValueOnce(snapshot({ monitorRevision: 3, stateVersion: 4, domainJobStatus: 'STALE', domainTerminal: true }))
    .mockResolvedValueOnce(snapshot({ monitorRevision: 4, stateVersion: 6, domainJobStatus: 'WAITING_APPROVAL' }))
  render(<ActiveJobMonitoringPanel api={monitoringApi({ getMonitoringJobSnapshot })} />)
  await act(async () => {})
  await act(async () => { vi.advanceTimersByTime(1_000) })
  await act(async () => {})
  await act(async () => { vi.advanceTimersByTime(1_000) })
  await act(async () => {})
  expect(getMonitoringJobSnapshot).toHaveBeenCalledTimes(3)
  expect(screen.queryByText('STALE')).not.toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: '실행 모니터링 상세' })).getAllByText('WAITING_APPROVAL')).toHaveLength(2)
})

test('refreshes only the selected occurrence P detail after an accepted monitorRevision change', async () => {
  vi.useFakeTimers()
  const getMonitoringJobSnapshot = vi.fn()
    .mockResolvedValueOnce(snapshot({ monitorRevision: 2, stateVersion: 5 }))
    .mockResolvedValueOnce(snapshot({ monitorRevision: 3, stateVersion: 5 }))
  const getMonitoringOccurrenceObservations = vi.fn().mockResolvedValue({
    status: 'AVAILABLE', errorCode: null, jobId: job.jobId, profileVersionId: job.profileVersionId,
    pipelineAttempt: 1, executionAttempt: 1, nodeId: 'code', nodeSequence: 2,
    from: '2026-09-07T00:00:01Z', to: '2026-09-07T00:00:02Z', environment: 'local', observations: [], truncated: false,
  })
  render(<ActiveJobMonitoringPanel api={monitoringApi({ getMonitoringJobSnapshot, getMonitoringOccurrenceObservations })} />)
  await act(async () => {})
  expect(getMonitoringOccurrenceObservations).toHaveBeenCalledTimes(1)
  await act(async () => { vi.advanceTimersByTime(1_000) })
  await act(async () => {})
  expect(getMonitoringOccurrenceObservations).toHaveBeenCalledTimes(2)
})

test('uses latestNodeStates identity for P when bounded occurrence history is truncated', async () => {
  const getMonitoringOccurrenceObservations = vi.fn().mockResolvedValue({
    status: 'UNCONNECTED', errorCode: 'OBSERVATION_NOT_CONNECTED', jobId: job.jobId,
    profileVersionId: job.profileVersionId, pipelineAttempt: 1, executionAttempt: 1,
    nodeId: 'code', nodeSequence: 2, from: '2026-09-07T00:00:01Z', to: '2026-09-07T00:00:02Z',
    environment: 'local', observations: [], truncated: false,
  })
  const withoutOccurrence = { ...snapshot(), occurrences: [], truncated: true }
  render(<ActiveJobMonitoringPanel api={monitoringApi({
    getMonitoringJobSnapshot: vi.fn().mockResolvedValue(withoutOccurrence),
    getMonitoringOccurrenceObservations,
  })} />)
  await waitFor(() => expect(getMonitoringOccurrenceObservations).toHaveBeenCalledWith(
    `/api/admin/ai/monitoring/jobs/${job.jobId}/occurrences/1/1/2/observations`, expect.any(AbortSignal),
  ))
  expect(screen.getByRole('region', { name: 'P Provider 상세' })).toHaveTextContent('관측 연결 안 됨')
  expect(screen.queryByText('연결된 Node occurrence가 없습니다.')).not.toBeInTheDocument()
})

test('discovers a new Job without a manual refresh and reuses its fixed layout on list polling', async () => {
  vi.useFakeTimers()
  const listMonitoringJobs = vi.fn()
    .mockResolvedValueOnce({ jobs: [] })
    .mockImplementation(() => Promise.resolve({ jobs: [{ ...job }] }))
  const api = monitoringApi({ listMonitoringJobs })
  render(<ActiveJobMonitoringPanel api={api} />)
  await act(async () => {})
  expect(screen.getByLabelText('실행 모니터링 Job')).toHaveValue('')
  expect(api.getMonitoringJobSnapshot).not.toHaveBeenCalled()
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
  expect(screen.getByLabelText('실행 모니터링 Job')).toHaveValue(job.jobId)
  expect(screen.getByLabelText('읽기 전용 Node Canvas')).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('analyze Node'))
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
  expect(listMonitoringJobs).toHaveBeenCalledTimes(3)
  expect(api.list).toHaveBeenCalledTimes(1)
  expect(api.getEditorLayout).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('analyze Node')).toHaveAttribute('aria-pressed', 'true')
})

test('keeps a selected failed Job and its Canvas after it leaves the bounded recent list', async () => {
  vi.useFakeTimers()
  const failed = snapshot({ domainTerminal: true, domainJobStatus: 'FAILED', monitorStatus: 'FAILED' })
  failed.latestNodeStates[1].status = 'FAILED'
  failed.occurrences[0] = { ...failed.occurrences[0], status: 'FAILED', completedAt: null,
    failedAt: job.lastUpdatedAt, errorCode: 'MODEL_RESPONSE_INVALID' }
  const listMonitoringJobs = vi.fn().mockResolvedValue({ jobs: [failed.job] })
  const api = monitoringApi({ listMonitoringJobs, getMonitoringJobSnapshot: vi.fn().mockResolvedValue(failed) })
  render(<ActiveJobMonitoringPanel api={api} />)
  await act(async () => {})
  expect(screen.getByRole('option', { name: /\[종료\] LLM_OPS · FAILED/ })).toBeInTheDocument()
  expect(api.getMonitoringJobSnapshot).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('실행 모니터링 Job'), { target: { value: job.jobId } })
  await act(async () => {})
  expect(screen.getByLabelText('code Node')).toHaveTextContent('N · 실패')
  expect(screen.getByLabelText('code Node').querySelector('.monitoring-node-activity')).toBeNull()
  expect(screen.getByRole('region', { name: 'Node occurrence 이력' })).toHaveTextContent('MODEL_RESPONSE_INVALID')
  listMonitoringJobs.mockResolvedValue({ jobs: [] })
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(screen.getByLabelText('실행 모니터링 Job')).toHaveValue(job.jobId)
  expect(screen.getByLabelText('읽기 전용 Node Canvas')).toBeInTheDocument()
  expect(api.getMonitoringJobSnapshot).toHaveBeenCalledTimes(1)
  expect(api.getEditorLayout).toHaveBeenCalledTimes(1)
})

test('does not overlap list requests, ignores hidden responses, resumes, and cleans up on unmount', async () => {
  vi.useFakeTimers()
  const first = deferred<{ jobs: MonitoringJobSummary[] }>()
  const second = deferred<{ jobs: MonitoringJobSummary[] }>()
  const third = deferred<{ jobs: MonitoringJobSummary[] }>()
  const listMonitoringJobs = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise)
  const api = monitoringApi({ listMonitoringJobs })
  const view = render(<ActiveJobMonitoringPanel api={api} />)
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
  expect(listMonitoringJobs).toHaveBeenCalledTimes(1)
  Object.defineProperty(document, 'hidden', { configurable: true, value: true })
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
  expect(listMonitoringJobs.mock.calls[0][0].aborted).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
  expect(listMonitoringJobs).toHaveBeenCalledTimes(1)
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
  expect(listMonitoringJobs).toHaveBeenCalledTimes(2)
  await act(async () => { first.resolve({ jobs: [job] }); second.resolve({ jobs: [] }) })
  expect(api.getMonitoringJobSnapshot).not.toHaveBeenCalled()
  expect(screen.queryByRole('option', { name: /LLM_OPS/ })).not.toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
  view.unmount()
  expect(listMonitoringJobs.mock.calls[2][0].aborted).toBe(true)
  await act(async () => { third.resolve({ jobs: [job] }); await vi.advanceTimersByTimeAsync(10_000) })
  expect(listMonitoringJobs).toHaveBeenCalledTimes(3)
  expect(api.getMonitoringJobSnapshot).not.toHaveBeenCalled()
})

test('manual list refresh preserves selection and layout and recovers from an error', async () => {
  const secondJob = { ...job, jobId: '44444444-4444-4444-8444-444444444444' }
  const listMonitoringJobs = vi.fn().mockResolvedValueOnce({ jobs: [job] })
    .mockRejectedValueOnce(new Error('List unavailable'))
    .mockResolvedValue({ jobs: [secondJob, { ...job }] })
  const api = monitoringApi({ listMonitoringJobs })
  render(<ActiveJobMonitoringPanel api={api} />)
  await screen.findByLabelText('읽기 전용 Node Canvas')
  fireEvent.click(screen.getByLabelText('analyze Node'))
  fireEvent.click(screen.getByRole('button', { name: '목록 새로고침' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('List unavailable')
  expect(screen.getByLabelText('실행 모니터링 Job')).toHaveValue(job.jobId)
  fireEvent.click(screen.getByRole('button', { name: '목록 새로고침' }))
  await screen.findByRole('option', { name: new RegExp(secondJob.jobId) })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByLabelText('실행 모니터링 Job')).toHaveValue(job.jobId)
  expect(screen.getByLabelText('analyze Node')).toHaveAttribute('aria-pressed', 'true')
  expect(api.list).toHaveBeenCalledTimes(1)
  expect(api.getEditorLayout).toHaveBeenCalledTimes(1)
})

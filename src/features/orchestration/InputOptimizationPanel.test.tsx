import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import InputOptimizationPanel from './InputOptimizationPanel'
import { comparisonIssues, delta, rtkSummary, completeTotal, uncachedInput, nodeName, tokenMeasurements } from './inputOptimization'
import type { AgentSettingsApiClient, InputOptimizationDetail, InputOptimizationJob } from './api'

const job = (id: string): InputOptimizationJob => ({ jobId: id, profileVersionId: `profile-${id}`, profileVersion: 1,
  profileKey: 'LLM_OPS', status: 'COMPLETED', stage: 'end', request: '동일한 테스트 요청', repositoryId: 'repo', baseSha: 'sha1:abc',
  createdAt: '2026-09-17T00:00:00Z', finishedAt: '2026-09-17T00:01:00Z',
  settings: { nodes: [{ id: 'code', handlerKey: 'coding.code', config: {} }], modelBindings: {}, toolBindings: {} },
  calls: 1, inputTokens: 100, outputTokens: 10, cachedInputTokens: null, inputKnown: 1, outputKnown: 1, cacheKnown: 0, cacheHits: 0, reviewResult: 'passed' })
const detail = (id: string): InputOptimizationDetail => ({ observedAt: '2026-09-17T01:00:00Z', job: job(id), truncated: false,
  calls: [{ callId: `call-${id}`, callOrder: 1, nodeId: 'code', turnId: 'turn', pipelineAttempt: 1, executionAttempt: 1, providerAttempt: 1,
    provider: 'GOOGLE_GENAI', model: 'fixture-model', status: 'SUCCEEDED', errorCode: null, startedAt: '2026-09-17T00:00:00Z', finishedAt: '2026-09-17T00:00:01Z',
    inputTokens: 100, outputTokens: 10, cachedInputTokens: null, observationTraceId: null, inputProcessing: null }] })
function setup() {
  const api = { listInputOptimizationJobs: vi.fn().mockResolvedValue({ observedAt: '2026-09-17T01:00:00Z', jobs: [job('a'), job('b'), job('c')], truncated: false }),
    getInputOptimizationJob: vi.fn(async (id: string) => detail(id)) } as unknown as AgentSettingsApiClient
  function Harness() {
    const [selected, setSelected] = useState<string[]>([])
    const [mode, setMode] = useState<'history' | 'compare'>('history')
    return <InputOptimizationPanel api={api} from="2026-09-17T00:00:00Z" to="2026-09-18T00:00:00Z" jobId="" mode={mode} selected={selected} onSelect={setSelected} onCompare={() => setMode('compare')} />
  }
  render(<Harness />)
  return api
}

test('selects only two historical Jobs and compares without creating or executing anything', async () => {
  const api = setup()
  const a = await screen.findByRole('checkbox', { name: '비교 선택 a' })
  fireEvent.click(a)
  fireEvent.click(screen.getByRole('checkbox', { name: '비교 선택 b' }))
  expect(screen.getByRole('checkbox', { name: '비교 선택 c' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '선택한 두 Job 비교' }))
  expect(await screen.findByText('절감 판정 보류 · 확인된 수치 차이만 표시')).toBeInTheDocument()
  expect(screen.getAllByText('비교 불가 · 수집값 없음').length).toBeGreaterThan(0)
  expect(api.getInputOptimizationJob).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'A·B 바꾸기' }))
  await waitFor(() => expect(api.getInputOptimizationJob).toHaveBeenCalledTimes(4))
})

test('shows missing measurements, final processing details and future controls as explicitly inactive', async () => {
  setup()
  const links = await screen.findAllByRole('button', { name: '동일한 테스트 요청' })
  expect(screen.getAllByText('캐시 여부 미수집')).toHaveLength(3)
  expect(screen.getAllByText('✓ 리뷰 통과')).toHaveLength(3)
  expect(screen.getAllByText('완료')).toHaveLength(3)
  expect(nodeName({ ...job('a'), stage: 'preview_approval' }, 'preview_approval')).toBe('변경 후보 승인')
  fireEvent.click(links[0])
  const region = await screen.findByRole('region', { name: 'Job 상세 a' })
  expect(within(region).getByText('미수집·확인 불가')).toBeInTheDocument()
  fireEvent.click(within(region).getByText('RTK·Tool 결과 캐시 요약과 입력 토큰 추이'))
  expect(within(region).getByRole('img', { name: '호출 순서별 입력 토큰 그래프' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /자동 실험·최적화 에이전트/, hidden: true })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('이력 기능'), { target: { value: 'NATURAL_CMS' } })
  expect(screen.getByText(/자연어 CMS 최적화 이력은 아직 연결되지 않았습니다/)).toBeInTheDocument()
})

test('expands calls directly beneath their request and never leaves a previous Job detail visible', async () => {
  const api = setup()
  await screen.findByRole('button', { name: '호출 상세 a' })
  expect(api.getInputOptimizationJob).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '호출 상세 a' }))
  const region = await screen.findByRole('region', { name: 'Job 상세 a' })
  expect(region.closest('tr')?.previousElementSibling).toContainElement(screen.getByRole('checkbox', { name: '비교 선택 a' }))
  expect(within(region).getByText('GOOGLE_GENAI')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '호출 상세 b' }))
  await screen.findByRole('region', { name: 'Job 상세 b' })
  expect(screen.queryByRole('region', { name: 'Job 상세 a' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '호출 상세 a' })).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(screen.getByRole('button', { name: '호출 상세 b' }))
  expect(screen.queryByRole('region', { name: 'Job 상세 b' })).not.toBeInTheDocument()
})

test('a failed expanded request shows its own error without reusing successful call data', async () => {
  const api = setup()
  await screen.findByRole('button', { name: '호출 상세 a' })
  fireEvent.click(screen.getByRole('button', { name: '호출 상세 a' }))
  await screen.findByRole('region', { name: 'Job 상세 a' })
  vi.mocked(api.getInputOptimizationJob!).mockRejectedValueOnce(new Error('상세 조회 실패'))
  fireEvent.click(screen.getByRole('button', { name: '호출 상세 b' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('상세 조회 실패')
  expect(screen.queryByText('fixture-model')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '상세 다시 조회' }))
  await screen.findByRole('region', { name: 'Job 상세 b' })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('never invents a percentage from missing values or a zero denominator', () => {
  expect(delta(100, 80, true)).toBe('↓ 20.0%')
  expect(delta(0, 10, true)).toBe('비교 보류')
  expect(delta(null, 10, true)).toBe('비교 보류')
  expect(delta(100, 10, false)).toBe('비교 보류')
  expect(comparisonIssues(job('a'), { ...job('b'), baseSha: null })).toContain('초기 Source 상태 다름 또는 미확인')
  expect(completeTotal(job('a'))).toBe(110)
  expect(completeTotal({ ...job('a'), outputKnown: 0 })).toBeNull()
  expect(uncachedInput(job('a'))).toBeNull()
  expect(uncachedInput({ ...job('a'), cachedInputTokens: 40, cacheKnown: 1 })).toBe(60)
  expect(uncachedInput({ ...job('a'), cachedInputTokens: 40, cacheKnown: 1, calls: 2 })).toBeNull()
})

test('deduplicates compression decisions across provider retries and excludes budget-elided copies', () => {
  const d = detail('a')
  const decision = { toolCallId: 'tool-1', tool: 'search_code', operation: 'RTK' as const, reason: 'selected', beforeBytes: 6000, afterBytes: 4000, firstProcessing: true }
  d.calls[0].inputProcessing = { processingId: 'p1', rtkEnabled: true, retentionEnabled: false, decisions: [decision] }
  d.calls.push({ ...d.calls[0], callId: 'retry', providerAttempt: 2 })
  d.calls.push({ ...d.calls[0], callId: 'next', inputProcessing: { processingId: 'p2', rtkEnabled: true, retentionEnabled: false,
    decisions: [{ ...decision, firstProcessing: false }, { ...decision, operation: 'REQUEST_BUDGET', reason: 'elided', afterBytes: 50 }] } })
  expect(rtkSummary(d)).toMatchObject({ attempts: 1, selected: 1, inclusions: 2, before: 6000, after: 4000 })
})

test('compares partial per-call averages separately from observed Job sums with unequal call counts', async () => {
  const a = detail('a'), b = detail('b')
  a.job = { ...a.job, calls: 18, inputKnown: 17, outputKnown: 17, inputTokens: 103811, outputTokens: 2023 }
  b.job = { ...b.job, calls: 20, inputKnown: 20, outputKnown: 20, inputTokens: 125157, outputTokens: 2028 }
  a.calls = Array.from({ length: 18 }, (_, i) => ({ ...a.calls[0], callId: `a-${i}`,
    inputTokens: i === 17 ? null : i === 0 ? 103811 : 0, outputTokens: i === 17 ? null : i === 0 ? 2023 : 0 }))
  const api = { listInputOptimizationJobs: vi.fn().mockResolvedValue({ jobs: [a.job, b.job], truncated: false }),
    getInputOptimizationJob: vi.fn(async (id: string) => id === 'a' ? a : b) } as unknown as AgentSettingsApiClient
  render(<InputOptimizationPanel api={api} from="2026-09-17T00:00:00Z" to="2026-09-18T00:00:00Z" jobId="" mode="compare" selected={['a', 'b']} onSelect={() => {}} onCompare={() => {}} />)
  const averages = await screen.findByRole('region', { name: '호출당 평균 비교' })
  const totals = screen.getByRole('region', { name: '작업 전체 사용량 비교' })
  const avgInput = within(averages).getByRole('row', { name: /^입력 토큰/ })
  expect(avgInput).toHaveTextContent('6,106.5 토큰/회')
  expect(avgInput).toHaveTextContent('6,257.9 토큰/회')
  expect(avgInput).toHaveTextContent('17/18회 수집 · 부분 계측')
  expect(avgInput).toHaveTextContent('↑ 2.5%')
  expect(within(averages).getByRole('row', { name: /^출력 토큰/ })).toHaveTextContent('↓ 14.8%')
  expect(within(averages).getByRole('row', { name: /^전체 토큰/ })).toHaveTextContent('↑ 2.1%')
  const totalInput = within(totals).getByRole('row', { name: /^입력 토큰/ })
  expect(totalInput).toHaveTextContent('103,811')
  expect(totalInput).toHaveTextContent('125,157')
  expect(totalInput).toHaveTextContent('부분 합계')
  expect(totalInput).toHaveTextContent('↑ 20.6%')
  expect(within(totals).getByRole('row', { name: /^전체 토큰/ })).toHaveTextContent('105,834')
  expect(within(totals).getByRole('row', { name: /^Provider 호출/ })).toHaveTextContent('↑ 11.1%')
  expect(within(averages).queryByText('Provider 호출')).not.toBeInTheDocument()
  expect(within(averages).getByRole('row', { name: /^입력 중 캐시/ })).toHaveTextContent('비교 불가 · 수집값 없음')
})

test('uses metric-specific denominators and paired calls, preserving explicit zero and missing values', () => {
  const d = detail('a'), template = d.calls[0]
  d.job = { ...d.job, calls: 4, inputTokens: 300, outputTokens: 90, cachedInputTokens: 40,
    inputKnown: 3, outputKnown: 2, cacheKnown: 2 }
  d.calls = [
    { ...template, callId: '1', inputTokens: 100, outputTokens: 10, cachedInputTokens: 40 },
    { ...template, callId: '2', inputTokens: 200, outputTokens: null, cachedInputTokens: null },
    { ...template, callId: '3', inputTokens: null, outputTokens: 80, cachedInputTokens: null },
    { ...template, callId: '4', inputTokens: 0, outputTokens: null, cachedInputTokens: 0 },
  ]
  expect(tokenMeasurements(d)).toMatchObject({
    input: { sum: 300, mean: 100, known: 3 }, output: { sum: 90, mean: 45, known: 2 },
    total: { sum: 110, mean: 110, known: 1 }, cached: { sum: 40, mean: 20, known: 2 },
    uncached: { sum: 60, mean: 30, known: 2 },
  })
  d.calls = [{ ...template, inputTokens: null }]
  expect(tokenMeasurements(d).total).toMatchObject({ sum: null, mean: null, known: 0 })
})

test('keeps Job-wide aggregates while marking derived pairs from truncated detail as limited', () => {
  const d = detail('a')
  d.truncated = true
  d.job = { ...d.job, calls: 600, inputTokens: 59000, inputKnown: 590, outputTokens: 6000, outputKnown: 600 }
  const m = tokenMeasurements(d)
  expect(m.input).toMatchObject({ sum: 59000, mean: 100, known: 590, limited: false })
  expect(m.total).toMatchObject({ sum: 110, mean: 110, known: 1, calls: 600, limited: true })
})

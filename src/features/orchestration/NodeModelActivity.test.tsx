import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import NodeModelActivity, { modelCallLabel, nodeModelCalls } from './NodeModelActivity'
import type { MonitoringJobSnapshotResponse, MonitoringLatestNodeState, MonitoringModelCall, ModelProvider } from './api'

const node: MonitoringLatestNodeState = { nodeId: 'analyze', nodeType: 'agent', handlerKey: 'coding.analyze', status: 'RUNNING', pipelineAttempt: 1, executionAttempt: 2, nodeSequence: 3, lastUpdatedAt: null }
function call(overrides: Partial<MonitoringModelCall> = {}): MonitoringModelCall {
  return { callId: 'call-1', callOrder: 1, pipelineAttempt: 1, executionAttempt: 2, nodeId: 'analyze', nodeSequence: 3, turnId: 'turn-1', provider: 'ANTHROPIC', model: 'claude-test', providerAttempt: 1, status: 'FAILED', errorCode: 'MODEL_NOT_CONFIGURED', startedAt: '2026-09-14T00:00:00Z', finishedAt: '2026-09-14T00:00:01Z', ...overrides }
}
function snapshot(calls: MonitoringModelCall[] = []): MonitoringJobSnapshotResponse {
  return { schemaVersion: '1.0', observedAt: '', job: { jobId: 'job-1', traceId: 'trace-1', profileVersionId: 'profile-1', profileKey: 'LLM_OPS', profileVersion: 1, domainJobStatus: 'RUNNING', domainTerminal: false, stateVersion: 1, pipelineAttempt: 1, executionAttempt: 2, monitorStatus: 'RUNNING', monitorRevision: 1, currentNode: null, profileSnapshotPath: '', profileLayoutPath: '', lastUpdatedAt: '' }, latestNodeStates: [node], occurrences: [], truncated: false, modelCalls: { status: 'AVAILABLE', calls, truncated: false } }
}

const providers: ModelProvider[] = ['ANTHROPIC', 'OPENAI', 'GOOGLE_GENAI']
test.each(providers.flatMap((from) => providers.filter((to) => to !== from).map((to) => [from, to])))('shows actual %s to %s fallback independently of configuration', (from, to) => {
  const data = snapshot([call({ provider: from, model: `${from}-model` }), call({ callId: 'call-2', callOrder: 2, provider: to, model: `${to}-model`, status: 'SUCCEEDED', errorCode: null })])
  render(<NodeModelActivity snapshot={data} node={node} binding={{ primary: 'configured-only', fallback: [] }} />)
  expect(modelCallLabel(data, node)).toBe(`${to}-model · 호출 성공`)
  expect(screen.getByLabelText('모델별 호출 요약')).toHaveTextContent('대체 모델로 전환 · 인증·크레딧·모델 설정 오류')
  expect(screen.getByLabelText('모델별 호출 요약')).not.toHaveTextContent('configured-only')
  expect(screen.getByText('우선 모델: configured-only')).toBeInTheDocument()
})

test('isolates repeated node occurrences and sorts actual attempts', () => {
  const first = call()
  const second = call({ callId: 'call-2', callOrder: 2 })
  const data = snapshot([second, call({ executionAttempt: 1 }), call({ pipelineAttempt: 2 }), call({ nodeSequence: 4 }), call({ nodeId: 'code' }), first])
  expect(nodeModelCalls(data, node)).toEqual([first, second])
})

test('distinguishes same-model retries from separate turns', () => {
  const data = snapshot([call(), call({ callId: 'call-2', callOrder: 2, providerAttempt: 2 }), call({ callId: 'call-3', callOrder: 3, turnId: 'another-turn', provider: 'OPENAI', model: 'gpt-test', status: 'SUCCEEDED', errorCode: null })])
  render(<NodeModelActivity snapshot={data} node={node} />)
  expect(screen.getAllByText('동일 모델 재시도')).toHaveLength(1)
  expect(screen.queryByText(/대체 모델로 전환/)).not.toBeInTheDocument()
})

test('does not invent actual usage for old or unavailable records', () => {
  const data = snapshot()
  const { rerender } = render(<NodeModelActivity snapshot={data} node={node} />)
  expect(screen.getByText(/설정값으로 추정하지 않습니다/)).toBeInTheDocument()
  delete data.modelCalls
  rerender(<NodeModelActivity snapshot={data} node={node} />)
  expect(screen.getByText('실제 모델 호출 기록을 조회할 수 없습니다.')).toBeInTheDocument()
  expect(modelCallLabel(data, node)).toBe('실제 모델 기록 미제공')
  rerender(<NodeModelActivity snapshot={data} node={{ ...node, status: 'NOT_STARTED' }} />)
  expect(screen.getByText('아직 모델을 호출하지 않았습니다.')).toBeInTheDocument()
  rerender(<NodeModelActivity snapshot={data} node={{ ...node, nodeType: 'approval' }} />)
  expect(screen.getByText('모델을 직접 호출하는 노드가 아닙니다.')).toBeInTheDocument()
})

test('unfinished call after terminal is unknown and truncated history is disclosed', () => {
  const data = snapshot([call({ status: 'RUNNING', errorCode: null, finishedAt: null })])
  data.job.domainTerminal = true
  data.modelCalls!.truncated = true
  render(<NodeModelActivity snapshot={data} node={node} />)
  expect(modelCallLabel(data, node)).toBe('claude-test · 결과 미확인')
  expect(screen.getByText(/이전 호출·전환 이력이 누락될 수 있습니다/)).toBeInTheDocument()
  expect(screen.queryByText(/호출 중/)).not.toBeInTheDocument()
})

test('counts consecutive calls across turns in one card and updates on polling', () => {
  const calls = Array.from({ length: 8 }, (_, index) => call({ callId: `call-${index}`, callOrder: index + 1, turnId: `turn-${index}`, status: 'SUCCEEDED', errorCode: null }))
  const { rerender } = render(<NodeModelActivity snapshot={snapshot(calls)} node={node} />)
  const list = screen.getByLabelText('모델별 호출 요약')
  expect(Array.from(list.children)).toHaveLength(1)
  expect(within(list).getByRole('img', { name: '호출 8회' })).toBeInTheDocument()
  expect(list).toHaveTextContent('호출 성공 8회')
  rerender(<NodeModelActivity snapshot={snapshot([...calls, call({ callId: 'new', callOrder: 9, turnId: 'new', status: 'RUNNING', errorCode: null, finishedAt: null })])} node={node} />)
  expect(Array.from(list.children)).toHaveLength(1)
  expect(within(list).getByRole('img', { name: '호출 9회' })).toBeInTheDocument()
  expect(list).toHaveTextContent('호출 중 1회')
})

test('retains failure reasons and retry counts when the same model recovers', () => {
  render(<NodeModelActivity snapshot={snapshot([
    call(),
    call({ callId: 'retry', callOrder: 2, providerAttempt: 2, errorCode: 'MODEL_TIMEOUT' }),
    call({ callId: 'success', callOrder: 3, providerAttempt: 3, status: 'SUCCEEDED', errorCode: null }),
  ])} node={node} />)
  const list = screen.getByLabelText('모델별 호출 요약')
  expect(Array.from(list.children)).toHaveLength(1)
  expect(within(list).getByRole('img', { name: '호출 3회' })).toBeInTheDocument()
  expect(list).toHaveTextContent('호출 실패 2회')
  expect(list).toHaveTextContent('호출 성공 1회')
  expect(list).toHaveTextContent('동일 모델 재시도 · 2회')
  expect(list).toHaveTextContent('MODEL_NOT_CONFIGURED 1회')
  expect(list).toHaveTextContent('MODEL_TIMEOUT 1회')
})

test('groups returning models while keeping different providers and models separate', () => {
  render(<NodeModelActivity snapshot={snapshot([
    call(),
    call({ callId: 'provider-change', callOrder: 2, provider: 'OPENAI' }),
    call({ callId: 'model-change', callOrder: 3, provider: 'OPENAI', model: 'other-model' }),
    call({ callId: 'return', callOrder: 4, status: 'SUCCEEDED', errorCode: null }),
  ])} node={node} />)
  const cards = Array.from(screen.getByLabelText('모델별 호출 요약').querySelectorAll<HTMLLIElement>(':scope > li'))
  expect(cards).toHaveLength(3)
  expect(cards[0]).toHaveTextContent('ANTHROPIC')
  expect(cards[1]).toHaveTextContent('OPENAI')
  expect(cards[2]).toHaveTextContent('other-model')
  expect(within(cards[0]).getByRole('img', { name: '호출 2회' })).toBeInTheDocument()
  for (const card of cards.slice(1)) expect(card).toHaveTextContent('대체 모델로 전환')
})


test('repeated fallback cycles become two cards with collapsed timestamps', () => {
  const calls = Array.from({ length: 4 }, (_, index) => [
    call({ callId: `failed-${index}`, callOrder: index * 2 + 1, turnId: `turn-${index}` }),
    call({ callId: `ok-${index}`, callOrder: index * 2 + 2, turnId: `turn-${index}`, provider: 'OPENAI', model: 'gpt-test', status: 'SUCCEEDED', errorCode: null }),
  ]).flat()
  const { container } = render(<NodeModelActivity snapshot={snapshot(calls)} node={node} />)
  const list = screen.getByLabelText('모델별 호출 요약')
  expect(Array.from(list.children)).toHaveLength(2)
  expect(within(list).getAllByRole('img', { name: '호출 4회' })).toHaveLength(2)
  expect(list).toHaveTextContent('호출 실패 4회')
  expect(list).toHaveTextContent('호출 성공 4회')
  expect(list).toHaveTextContent('대체 모델로 전환 · 인증·크레딧·모델 설정 오류 4회')
  for (const history of container.querySelectorAll('details')) expect(history).not.toHaveAttribute('open')
  expect(screen.getByLabelText('ANTHROPIC claude-test 호출 시간 이력').children).toHaveLength(4)
  expect(screen.getByLabelText('OPENAI gpt-test 호출 시간 이력').children).toHaveLength(4)
})

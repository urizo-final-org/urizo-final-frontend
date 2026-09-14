import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import NodeExecutionHistory from './NodeExecutionHistory'
import type { MonitoringNodeOccurrence } from './api'

const occurrence: MonitoringNodeOccurrence = { jobId: 'job', profileVersionId: 'v1', pipelineAttempt: 1, executionAttempt: 1,
  nodeId: 'code', nodeSequence: 4, traceId: 'business-trace', observationTraceId: null, nodeType: 'agent', handlerKey: 'coding.code',
  status: 'FAILED', startedAt: '2026-09-13T00:00:00Z', waitingAt: '2026-09-13T00:00:01Z', completedAt: null,
  failedAt: '2026-09-13T00:00:02Z', errorCode: 'MODEL_RESPONSE_INVALID', observationsPath: '', lastUpdatedAt: '2026-09-13T00:00:02Z' }

test('shows stored transitions in time order, error code, attempt and trace without inventing logs', () => {
  const before = JSON.stringify(occurrence)
  render(<NodeExecutionHistory occurrences={[occurrence]} truncated domainTerminal />)
  const region = screen.getByRole('region', { name: 'Node occurrence 이력' })
  expect(region).toHaveTextContent('MODEL_RESPONSE_INVALID')
  expect(region).toHaveTextContent('Pipeline 1 · Attempt 1 · Sequence 4')
  expect(region).toHaveTextContent('일부 과거 이력은 잘렸으며 최신 Node 상태는 유지됩니다.')
  expect(region).toHaveTextContent('현재 실행 중이라는 뜻은 아닙니다')
  const events = screen.getByRole('list', { name: 'Sequence 4 전이 시각' })
  expect(within(events).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
    '실행 시작2026-09-13T00:00:00Z', '승인 대기 진입2026-09-13T00:00:01Z', '실행 실패2026-09-13T00:00:02Z',
  ])
  expect(screen.queryByText('실행 완료')).not.toBeInTheDocument()
  expect(region).toHaveTextContent('business-trace')
  expect(JSON.stringify(occurrence)).toBe(before)
})

test('keeps missing timestamps and empty history explicit; raw-looking codes remain escaped text', () => {
  const { container, rerender } = render(<NodeExecutionHistory occurrences={[]} truncated={false} domainTerminal={false} />)
  expect(screen.getByText('기록 없음')).toBeInTheDocument()
  rerender(<NodeExecutionHistory occurrences={[{ ...occurrence, startedAt: null, waitingAt: null, failedAt: null, errorCode: '<script>alert(1)</script>' }]} truncated={false} domainTerminal={false} />)
  expect(screen.getByText('전이 시각 미제공')).toBeInTheDocument()
  expect(container.querySelector('script')).toBeNull()
  expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
})

test('separates attempts and resets history when selecting another node', () => {
  const { rerender } = render(<NodeExecutionHistory occurrences={[occurrence, { ...occurrence, executionAttempt: 2, nodeSequence: 5, status: 'COMPLETED', errorCode: null, failedAt: null, completedAt: occurrence.failedAt }]} truncated={false} domainTerminal={false} />)
  const headings = screen.getByRole('region', { name: 'Node occurrence 이력' }).querySelectorAll('li > div:first-child > b')
  expect([...headings].map((node) => node.textContent)).toEqual(['완료', '실패'])
  rerender(<NodeExecutionHistory occurrences={[]} truncated={false} domainTerminal={false} />)
  expect(screen.queryByText('MODEL_RESPONSE_INVALID')).not.toBeInTheDocument()
})

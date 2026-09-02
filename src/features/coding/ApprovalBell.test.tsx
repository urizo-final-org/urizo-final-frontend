import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import ApprovalBell from './ApprovalBell'
import { ProductApiError } from '../../shared/api/error'
import type { CodingConsoleApiClient, JobSummary } from './api'

function job(status: JobSummary['status'], id: string): JobSummary {
  return {
    jobId: id,
    repository: 'backend',
    requestText: '회원 목록에 가입일도 보이게 해줘',
    status,
    createdAt: '2026-09-02T02:00:00Z',
  }
}

function bellApi(items: JobSummary[], overrides: Partial<CodingConsoleApiClient> = {}): CodingConsoleApiClient {
  return {
    createJob: vi.fn(),
    listJobs: vi.fn().mockResolvedValue({ schemaVersion: '1.0', items }),
    getJob: vi.fn(),
    decideApproval: vi.fn(),
    guardrailSelections: vi.fn(),
    saveGuardrailSelections: vi.fn(),
    startGuardrailScan: vi.fn(),
    guardrailScan: vi.fn(),
    guardrailRules: vi.fn(),
    saveGuardrailRules: vi.fn(),
    ...overrides,
  }
}

test('the bell counts only the requests actually waiting on a person', async () => {
  render(<ApprovalBell api={bellApi([
    job('WAITING_APPROVAL', 'a'),
    job('RUNNING', 'b'),
    job('WAITING_APPROVAL', 'c'),
    job('COMPLETED', 'd'),
  ])} onOpen={() => {}} />)

  expect(await screen.findByText('2')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /승인 대기 2건/ })).toBeInTheDocument()
})

test('nothing waiting shows no badge at all', async () => {
  render(<ApprovalBell api={bellApi([job('COMPLETED', 'a')])} onOpen={() => {}} />)

  await waitFor(() => expect(screen.getByRole('button', { name: 'LLM DevOps 열기' })).toBeInTheDocument())
  expect(screen.queryByText('0')).not.toBeInTheDocument()
})

test('a failed poll shows no number rather than a zero that reads as "all clear"', async () => {
  render(<ApprovalBell api={bellApi([], {
    listJobs: vi.fn().mockRejectedValue(new ProductApiError({
      status: 503, code: 'CODING_HANDLER_STORE_UNAVAILABLE', message: '저장소를 사용할 수 없습니다.',
    })),
  })} onOpen={() => {}} />)

  await waitFor(() => expect(screen.getByRole('button')).toBeInTheDocument())
  expect(screen.queryByText('0')).not.toBeInTheDocument()
})

test('the bell opens the screen it is ringing about', async () => {
  const onOpen = vi.fn()
  render(<ApprovalBell api={bellApi([job('WAITING_APPROVAL', 'a')])} onOpen={onOpen} />)

  fireEvent.click(await screen.findByRole('button', { name: /승인 대기 1건/ }))
  expect(onOpen).toHaveBeenCalledTimes(1)
})

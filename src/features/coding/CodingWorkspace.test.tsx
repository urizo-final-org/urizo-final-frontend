import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import CodingWorkspace from './CodingWorkspace'
import { ProductApiError } from '../../shared/api/error'
import type { CodingConsoleApiClient, JobSummary } from './api'

const created = {
  schemaVersion: '1.0',
  job: { jobId: '11111111-2222-3333-4444-555555555555', status: 'PENDING' as const, stateVersion: 1 },
  request: {
    jobId: '11111111-2222-3333-4444-555555555555',
    requestText: '회원 목록에 가입일도 보이게 해줘',
    createdAt: '2026-09-02T02:00:00Z',
  },
}

const openJob: JobSummary = {
  jobId: '99999999-8888-7777-6666-555555555555',
  repository: 'backend',
  requestText: '공지사항에 첨부파일을 붙일 수 있게 해줘',
  status: 'WAITING_APPROVAL',
  currentStage: 'coding.analyze',
  createdAt: '2026-09-02T01:00:00Z',
}

function consoleApi(overrides: Partial<CodingConsoleApiClient> = {}): CodingConsoleApiClient {
  return {
    createJob: vi.fn().mockResolvedValue(created),
    listJobs: vi.fn().mockResolvedValue({ schemaVersion: '1.0', items: [] }),
    getJob: vi.fn(),
    decideApproval: vi.fn(),
    ...overrides,
  }
}

test('with nothing in flight the card is the request form, and it only offers the backend', async () => {
  render(<CodingWorkspace api={consoleApi()} />)

  const send = await screen.findByRole('button', { name: '요청 보내기' })
  expect(send).toBeDisabled()

  expect(screen.getByRole('radio', { name: /백엔드/ })).toBeEnabled()
  expect(screen.getByRole('radio', { name: /프론트엔드/ })).toBeDisabled()
})

test('sending a Korean sentence creates a backend Job and the same card becomes that request', async () => {
  const api = consoleApi()
  render(<CodingWorkspace api={api} />)

  await screen.findByRole('button', { name: '요청 보내기' })
  fireEvent.change(screen.getByLabelText('무엇을 바꿀까요'), {
    target: { value: '회원 목록에 가입일도 보이게 해줘' },
  })
  fireEvent.click(screen.getByRole('button', { name: '요청 보내기' }))

  await waitFor(() => expect(api.createJob).toHaveBeenCalledWith('backend', '회원 목록에 가입일도 보이게 해줘'))
  expect(await screen.findByText('회원 목록에 가입일도 보이게 해줘')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '요청 보내기' })).not.toBeInTheDocument()
})

test('an unfinished Job takes the card over so a second request cannot be started', async () => {
  const api = consoleApi({
    listJobs: vi.fn().mockResolvedValue({ schemaVersion: '1.0', items: [openJob] }),
  })
  render(<CodingWorkspace api={api} />)

  expect(await screen.findByText('공지사항에 첨부파일을 붙일 수 있게 해줘')).toBeInTheDocument()
  expect(screen.getByText('승인 대기')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '요청 보내기' })).not.toBeInTheDocument()
})

test('a finished Job does not block a new request', async () => {
  const api = consoleApi({
    listJobs: vi.fn().mockResolvedValue({
      schemaVersion: '1.0',
      items: [{ ...openJob, status: 'COMPLETED' as const }],
    }),
  })
  render(<CodingWorkspace api={api} />)

  expect(await screen.findByRole('button', { name: '요청 보내기' })).toBeInTheDocument()
})

test('a refused request shows the server reason instead of pretending it was accepted', async () => {
  const api = consoleApi({
    createJob: vi.fn().mockRejectedValue(new ProductApiError({
      status: 503,
      code: 'CODING_RUNNER_NOT_RESPONDING',
      message: '실행기가 응답하지 않습니다.',
    })),
  })
  render(<CodingWorkspace api={api} />)

  await screen.findByRole('button', { name: '요청 보내기' })
  fireEvent.change(screen.getByLabelText('무엇을 바꿀까요'), { target: { value: '뭐라도 해줘' } })
  fireEvent.click(screen.getByRole('button', { name: '요청 보내기' }))

  expect(await screen.findByText(/실행기가 응답하지 않습니다/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '요청 보내기' })).toBeInTheDocument()
})

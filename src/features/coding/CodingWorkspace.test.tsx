import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import CodingWorkspace from './CodingWorkspace'
import { ProductApiError } from '../../shared/api/error'
import type { CodingConsoleApiClient, JobDetail, JobSummary } from './api'

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
  expect(screen.getByLabelText('무엇을 바꿀까요')).toHaveValue('')
})

/**
 * An abandoned Job from a previous day sat in WAITING_APPROVAL and, while the form was hidden
 * behind "nothing is in flight", no new request could be typed at all. The server never refused
 * a second Job, so this screen must not either.
 */
test('an unfinished Job is shown without locking the operator out of a new request', async () => {
  const api = consoleApi({
    listJobs: vi.fn().mockResolvedValue({ schemaVersion: '1.0', items: [openJob] }),
  })
  render(<CodingWorkspace api={api} />)

  expect(await screen.findByText('공지사항에 첨부파일을 붙일 수 있게 해줘')).toBeInTheDocument()
  expect(screen.getByText('승인 대기')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '요청 보내기' })).toBeInTheDocument()
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

const pendingScope = {
  approvalId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  nodeId: 'scope_approval',
  stage: 'SCOPE' as const,
  stageRound: 1,
  requiredRole: 'GENERAL_ADMIN',
  expectedStateVersion: 3,
  pipelineAttempt: 1,
}

const scopeDetail: JobDetail = {
  schemaVersion: '1.0',
  jobId: openJob.jobId,
  repository: 'backend',
  requestText: openJob.requestText,
  status: 'WAITING_APPROVAL',
  currentStage: 'scope_approval',
  pipelineAttempt: 1,
  maxPipelineAttempts: 3,
  plan: {
    summary: '공지사항 글에 첨부파일 목록을 붙이고 업로드 통로를 엽니다.',
    acceptanceCriteria: ['공지 글에 첨부파일을 올릴 수 있다', '기존 글이 깨지지 않는다'],
  },
  pendingApproval: pendingScope,
  decisions: [],
  createdAt: openJob.createdAt,
}

function waitingApi(overrides: Partial<CodingConsoleApiClient> = {}): CodingConsoleApiClient {
  return consoleApi({
    listJobs: vi.fn().mockResolvedValue({ schemaVersion: '1.0', items: [openJob] }),
    getJob: vi.fn().mockResolvedValue(scopeDetail),
    decideApproval: vi.fn().mockResolvedValue({}),
    ...overrides,
  })
}

test('a plan waiting on approval shows the summary and every acceptance criterion', async () => {
  render(<CodingWorkspace api={waitingApi()} />)

  expect(await screen.findByText(/첨부파일 목록을 붙이고/)).toBeInTheDocument()
  expect(screen.getByText('공지 글에 첨부파일을 올릴 수 있다')).toBeInTheDocument()
  expect(screen.getByText('기존 글이 깨지지 않는다')).toBeInTheDocument()
})

test('approving echoes the pendingApproval the server handed down, unchanged', async () => {
  const api = waitingApi()
  render(<CodingWorkspace api={api} />)

  fireEvent.click(await screen.findByRole('button', { name: '네, 진행하세요' }))

  await waitFor(() => expect(api.decideApproval).toHaveBeenCalledWith(
    openJob.jobId, pendingScope, 'APPROVED', undefined,
  ))
})

test('rejecting a plan warns that the request is cancelled and refuses an empty reason', async () => {
  const api = waitingApi()
  render(<CodingWorkspace api={api} />)

  fireEvent.click(await screen.findByRole('button', { name: '아니요' }))

  expect(screen.getByText(/이 요청은 취소됩니다/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '반려하고 요청을 취소합니다' })).toBeDisabled()
  expect(api.decideApproval).not.toHaveBeenCalled()
})

test('a rejection carries the typed reason to the server', async () => {
  const api = waitingApi()
  render(<CodingWorkspace api={api} />)

  fireEvent.click(await screen.findByRole('button', { name: '아니요' }))
  fireEvent.change(screen.getByLabelText('반려 사유'), {
    target: { value: '첨부파일은 이번 범위가 아닙니다.' },
  })
  fireEvent.click(screen.getByRole('button', { name: '반려하고 요청을 취소합니다' }))

  await waitFor(() => expect(api.decideApproval).toHaveBeenCalledWith(
    openJob.jobId, pendingScope, 'REJECTED', '첨부파일은 이번 범위가 아닙니다.',
  ))
})

test('an approval from a later stage does not borrow the plan screen', async () => {
  const api = waitingApi({
    getJob: vi.fn().mockResolvedValue({
      ...scopeDetail,
      pendingApproval: { ...pendingScope, stage: 'CANDIDATE' as const, nodeId: 'preview_approval' },
    }),
  })
  render(<CodingWorkspace api={api} />)

  expect(await screen.findByText(openJob.requestText)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '네, 진행하세요' })).not.toBeInTheDocument()
})

const pendingCandidate = {
  ...pendingScope,
  approvalId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  nodeId: 'preview_approval',
  stage: 'CANDIDATE' as const,
  expectedStateVersion: 9,
  candidateSha: `sha1:${'a'.repeat(40)}`,
  validationHash: `sha256:${'b'.repeat(64)}`,
}

const candidateDetail: JobDetail = {
  ...scopeDetail,
  status: 'WAITING_APPROVAL',
  currentStage: 'preview_approval',
  report: {
    summary: '첨부파일 업로드를 붙이고 목록에 표시했습니다.',
    criteriaResults: [
      { criterion: '공지 글에 첨부파일을 올릴 수 있다', met: true },
      { criterion: '기존 글이 깨지지 않는다', met: false },
      { criterion: '용량 제한을 넘기면 막는다' },
    ],
  },
  preview: { ready: true, url: 'http://127.0.0.1:18081/' },
  pendingApproval: pendingCandidate,
}

function candidateApi(detail: JobDetail = candidateDetail): CodingConsoleApiClient {
  return consoleApi({
    listJobs: vi.fn().mockResolvedValue({ schemaVersion: '1.0', items: [openJob] }),
    getJob: vi.fn().mockResolvedValue(detail),
    decideApproval: vi.fn().mockResolvedValue({}),
  })
}

test('the result screen shows every criterion verdict, and an undecided one is not a pass', async () => {
  render(<CodingWorkspace api={candidateApi()} />)

  expect(await screen.findByText(/첨부파일 업로드를 붙이고/)).toBeInTheDocument()
  expect(screen.getByText('충족')).toBeInTheDocument()
  expect(screen.getByText('미충족')).toBeInTheDocument()
  expect(screen.getByText('판정 없음')).toBeInTheDocument()
})

test('the preview is offered as a link the administrator can actually open', async () => {
  render(<CodingWorkspace api={candidateApi()} />)

  const link = await screen.findByRole('link', { name: '미리보기 열기' })
  expect(link).toHaveAttribute('href', 'http://127.0.0.1:18081/')
  expect(link).toHaveAttribute('target', '_blank')
})

test('an unready preview warns instead of offering a dead link', async () => {
  render(<CodingWorkspace api={candidateApi({ ...candidateDetail, preview: { ready: false } })} />)

  expect(await screen.findByText(/미리보기가 아직 준비되지 않았습니다/)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '미리보기 열기' })).not.toBeInTheDocument()
})

test('rejecting with attempts left promises another try, and says which one', async () => {
  render(<CodingWorkspace api={candidateApi()} />)

  fireEvent.click(await screen.findByRole('button', { name: '아니요' }))
  expect(screen.getByText(/2번째 시도가 됩니다/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '반려하고 다시 만들게 합니다' })).toBeDisabled()
})

test('rejecting the last attempt says the request is cancelled, not retried', async () => {
  render(<CodingWorkspace api={candidateApi({ ...candidateDetail, pipelineAttempt: 3 })} />)

  fireEvent.click(await screen.findByRole('button', { name: '아니요' }))
  expect(screen.getByText(/다시 만들지 않고 이 요청은 취소됩니다/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '반려하고 요청을 취소합니다' })).toBeInTheDocument()
})

test('a candidate decision carries the sha and validation hash the server minted', async () => {
  const api = candidateApi()
  render(<CodingWorkspace api={api} />)

  fireEvent.click(await screen.findByRole('button', { name: '네, 이대로 좋습니다' }))

  await waitFor(() => expect(api.decideApproval).toHaveBeenCalledWith(
    openJob.jobId, pendingCandidate, 'APPROVED', undefined,
  ))
})

const pendingGithub = {
  ...pendingCandidate,
  approvalId: 'cccccccc-3333-4333-8333-cccccccccccc',
  nodeId: 'github_approval',
  stage: 'GITHUB' as const,
  requiredRole: 'SUPER_ADMIN',
  expectedStateVersion: 14,
}

const githubDetail: JobDetail = {
  ...candidateDetail,
  currentStage: 'github_approval',
  pendingApproval: pendingGithub,
  technical: {
    baseSha: `sha1:${'1'.repeat(40)}`,
    candidateSha: `sha1:${'2'.repeat(40)}`,
    diffDigest: `sha256:${'3'.repeat(64)}`,
    changedPaths: ['src/main/java/.../CmsPostService.java', 'src/main/resources/schema.sql'],
    checkProfile: 'maven-verify',
    baseShaFreshness: { stale: false },
  },
}

function finalApi(detail: JobDetail): CodingConsoleApiClient {
  return consoleApi({
    listJobs: vi.fn().mockResolvedValue({ schemaVersion: '1.0', items: [openJob] }),
    getJob: vi.fn().mockResolvedValue(detail),
    decideApproval: vi.fn().mockResolvedValue({}),
  })
}

test('the code approval names the gate it is on and shows the changed files', async () => {
  render(<CodingWorkspace api={finalApi(githubDetail)} />)

  expect(await screen.findByText('코드 승인')).toBeInTheDocument()
  expect(screen.getByText('최고관리자 전용')).toBeInTheDocument()
  expect(screen.getByText('바뀐 파일 2개')).toBeInTheDocument()
  expect(screen.getByText('src/main/resources/schema.sql')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '네, 이 코드를 반영합니다' })).toBeInTheDocument()
})

test('a moved dev branch is warned about before the merge is approved', async () => {
  render(<CodingWorkspace api={finalApi({
    ...githubDetail,
    technical: {
      ...githubDetail.technical!,
      baseShaFreshness: { stale: true, currentDevSha: `sha1:${'9'.repeat(40)}` },
    },
  })} />)

  expect(await screen.findByText(/dev 가 움직였습니다/)).toBeInTheDocument()
})

test('an administrator the server sent no evidence to is told so, not shown an empty table', async () => {
  render(<CodingWorkspace api={finalApi({ ...githubDetail, technical: undefined })} />)

  expect(await screen.findByText(/코드 근거는 최고관리자에게만 전달됩니다/)).toBeInTheDocument()
  expect(screen.queryByText(/바뀐 파일/)).not.toBeInTheDocument()
})

test('the deploy gate is its own approval, so merging is not deploying', async () => {
  render(<CodingWorkspace api={finalApi({
    ...githubDetail,
    currentStage: 'deploy_approval',
    pendingApproval: { ...pendingGithub, stage: 'DEPLOY' as const, nodeId: 'deploy_approval' },
  })} />)

  expect(await screen.findByText('배포 승인')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '네, 배포합니다' })).toBeInTheDocument()
})

test('rejecting a merge cancels the request and says the PR must be closed by hand', async () => {
  const api = finalApi(githubDetail)
  render(<CodingWorkspace api={api} />)

  fireEvent.click(await screen.findByRole('button', { name: '아니요' }))
  expect(screen.getByText(/이미 올라간 PR 이 있다면 사람이 직접 닫아야 합니다/)).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('반려 사유'), { target: { value: '스키마 변경은 별도 검토가 필요합니다.' } })
  fireEvent.click(screen.getByRole('button', { name: '반려하고 요청을 취소합니다' }))

  await waitFor(() => expect(api.decideApproval).toHaveBeenCalledWith(
    openJob.jobId, pendingGithub, 'REJECTED', '스키마 변경은 별도 검토가 필요합니다.',
  ))
})

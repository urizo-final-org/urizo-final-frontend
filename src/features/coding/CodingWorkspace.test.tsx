import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    runnerStatus: vi.fn().mockResolvedValue(
      { schemaVersion: '1.0', alive: true, lastSeenAt: '2026-09-02T02:00:00Z' }),
    notifications: vi.fn().mockResolvedValue({ schemaVersion: '1.0', items: [] }),
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

/**
 * The screen asks for a sentence in Korean. It used to ask the writer to first classify that
 * sentence as "backend" or "frontend" - developer words, in a choice that had exactly one
 * selectable answer. The server is told the only supported value without asking.
 */
test('the form asks for a sentence and nothing else', async () => {
  render(<CodingWorkspace role="SUPER_ADMIN" api={consoleApi()} />)

  const send = await screen.findByRole('button', { name: '요청 보내기' })
  expect(send).toBeDisabled()

  expect(screen.queryAllByRole('radio')).toHaveLength(0)
  expect(screen.queryByText('백엔드')).not.toBeInTheDocument()
  expect(screen.queryByText('프론트엔드')).not.toBeInTheDocument()
})

/*
 * A failed job leaves the open statuses, so it used to vanish from this screen entirely —
 * "my request disappeared" instead of "my request was stopped, and here is why". The guardrail
 * refusal names the next step, because only a super administrator can widen the fence.
 */
test('a fence-stopped request explains itself and says who can open the fence', async () => {
  render(<CodingWorkspace role="GENERAL_ADMIN" api={consoleApi({
    listJobs: vi.fn().mockResolvedValue({
      schemaVersion: '1.0',
      items: [{
        jobId: '99999999-8888-7777-6666-000000000001',
        repository: 'backend',
        requestText: '상태 점검 응답에 서버 버전도 넣어줘',
        status: 'FAILED' as const,
        createdAt: '2026-09-02T09:00:00Z',
        finishedAt: '2026-09-02T09:05:00Z',
        failureCode: 'CODING_GUARDRAIL_PATH_NOT_SELECTED',
      }],
    }),
  })} />)

  expect(await screen.findByText('직전 요청이 중단됐습니다')).toBeInTheDocument()
  expect(screen.getByText(/허용되지 않은 폴더의 파일을 변경해서 중단됐습니다/)).toBeInTheDocument()
  expect(screen.getByText(/최고관리자에게 울타리 설정/)).toBeInTheDocument()
})

test('an old failure stays quiet once a newer request has moved on', async () => {
  render(<CodingWorkspace role="GENERAL_ADMIN" api={consoleApi({
    listJobs: vi.fn().mockResolvedValue({
      schemaVersion: '1.0',
      items: [
        {
          jobId: '99999999-8888-7777-6666-000000000002',
          repository: 'backend',
          requestText: '공지사항에 첨부파일을 붙일 수 있게 해줘',
          status: 'COMPLETED' as const,
          createdAt: '2026-09-02T10:00:00Z',
          finishedAt: '2026-09-02T10:30:00Z',
        },
        {
          jobId: '99999999-8888-7777-6666-000000000001',
          repository: 'backend',
          requestText: '상태 점검 응답에 서버 버전도 넣어줘',
          status: 'FAILED' as const,
          createdAt: '2026-09-02T09:00:00Z',
          failureCode: 'CODING_GUARDRAIL_PATH_NOT_SELECTED',
        },
      ],
    }),
  })} />)

  await screen.findByRole('button', { name: '요청 보내기' })
  expect(screen.queryByText('직전 요청이 중단됐습니다')).not.toBeInTheDocument()
})

test('sending a Korean sentence creates a backend Job and the same card becomes that request', async () => {
  const api = consoleApi()
  render(<CodingWorkspace role="SUPER_ADMIN" api={api} />)

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
  render(<CodingWorkspace role="SUPER_ADMIN" api={api} />)

  // The sentence appears twice by design: once as the open request card, once in the history.
  expect(await screen.findAllByText('공지사항에 첨부파일을 붙일 수 있게 해줘')).not.toHaveLength(0)
  expect(screen.getAllByText('승인 대기')).not.toHaveLength(0)
  expect(screen.getByRole('button', { name: '요청 보내기' })).toBeInTheDocument()

  // The card must say what the reader is being asked to do, not only what the server thinks.
  expect(screen.getByText('아래에서 내용을 확인하고 승인해 주세요.')).toBeInTheDocument()
  // The Job id is not something an administrator can act on.
  expect(screen.queryByText(/99999999/)).not.toBeInTheDocument()
})

test('a finished Job does not block a new request', async () => {
  const api = consoleApi({
    listJobs: vi.fn().mockResolvedValue({
      schemaVersion: '1.0',
      items: [{ ...openJob, status: 'COMPLETED' as const }],
    }),
  })
  render(<CodingWorkspace role="SUPER_ADMIN" api={api} />)

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
  render(<CodingWorkspace role="SUPER_ADMIN" api={api} />)

  await screen.findByRole('button', { name: '요청 보내기' })
  fireEvent.change(screen.getByLabelText('무엇을 바꿀까요'), { target: { value: '뭐라도 해줘' } })
  fireEvent.click(screen.getByRole('button', { name: '요청 보내기' }))

  expect(await screen.findByText(/실행기가 응답하지 않습니다/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '요청 보내기' })).toBeInTheDocument()
})

const pendingScope = {
  approvalId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  traceId: 'dddddddd-4444-4444-8444-dddddddddddd',
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
  render(<CodingWorkspace role="SUPER_ADMIN" api={waitingApi()} />)

  expect(await screen.findByText(/첨부파일 목록을 붙이고/)).toBeInTheDocument()
  expect(screen.getByText('공지 글에 첨부파일을 올릴 수 있다')).toBeInTheDocument()
  expect(screen.getByText('기존 글이 깨지지 않는다')).toBeInTheDocument()
})

test('approving echoes the pendingApproval the server handed down, unchanged', async () => {
  const api = waitingApi()
  render(<CodingWorkspace role="SUPER_ADMIN" api={api} />)

  fireEvent.click(await screen.findByRole('button', { name: '네, 진행하세요' }))

  await waitFor(() => expect(api.decideApproval).toHaveBeenCalledWith(
    openJob.jobId, pendingScope, 'APPROVED', undefined,
  ))
})

test('rejecting a plan warns that the request is cancelled and refuses an empty reason', async () => {
  const api = waitingApi()
  render(<CodingWorkspace role="SUPER_ADMIN" api={api} />)

  fireEvent.click(await screen.findByRole('button', { name: '아니요' }))

  expect(screen.getByText(/이 요청은 취소됩니다/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '반려하고 요청을 취소합니다' })).toBeDisabled()
  expect(api.decideApproval).not.toHaveBeenCalled()
})

test('a rejection carries the typed reason to the server', async () => {
  const api = waitingApi()
  render(<CodingWorkspace role="SUPER_ADMIN" api={api} />)

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
  render(<CodingWorkspace role="SUPER_ADMIN" api={api} />)

  expect(await screen.findAllByText(openJob.requestText)).not.toHaveLength(0)
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
  render(<CodingWorkspace role="SUPER_ADMIN" api={candidateApi()} />)

  expect(await screen.findByText(/첨부파일 업로드를 붙이고/)).toBeInTheDocument()
  expect(screen.getByText('충족')).toBeInTheDocument()
  expect(screen.getByText('미충족')).toBeInTheDocument()
  expect(screen.getByText('판정 없음')).toBeInTheDocument()
})

test('the preview is offered as a link the administrator can actually open', async () => {
  render(<CodingWorkspace role="SUPER_ADMIN" api={candidateApi()} />)

  const link = await screen.findByRole('link', { name: '미리보기 열기' })
  expect(link).toHaveAttribute('href', 'http://127.0.0.1:18081/')
  expect(link).toHaveAttribute('target', '_blank')
})

test('an unready preview warns instead of offering a dead link', async () => {
  render(<CodingWorkspace role="SUPER_ADMIN" api={candidateApi({ ...candidateDetail, preview: { ready: false } })} />)

  expect(await screen.findByText(/미리보기가 아직 준비되지 않았습니다/)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '미리보기 열기' })).not.toBeInTheDocument()
})

test('rejecting with attempts left promises another try, and says which one', async () => {
  render(<CodingWorkspace role="SUPER_ADMIN" api={candidateApi()} />)

  fireEvent.click(await screen.findByRole('button', { name: '아니요' }))
  expect(screen.getByText(/2번째 시도가 됩니다/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '반려하고 다시 만들게 합니다' })).toBeDisabled()
})

test('rejecting the last attempt says the request is cancelled, not retried', async () => {
  render(<CodingWorkspace role="SUPER_ADMIN" api={candidateApi({ ...candidateDetail, pipelineAttempt: 3 })} />)

  fireEvent.click(await screen.findByRole('button', { name: '아니요' }))
  expect(screen.getByText(/다시 만들지 않고 이 요청은 취소됩니다/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '반려하고 요청을 취소합니다' })).toBeInTheDocument()
})

test('a candidate decision carries the sha and validation hash the server minted', async () => {
  const api = candidateApi()
  render(<CodingWorkspace role="SUPER_ADMIN" api={api} />)

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
    diff: `diff --git a/README.md b/README.md
+데모 확인`,
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
  render(<CodingWorkspace role="SUPER_ADMIN" api={finalApi(githubDetail)} />)

  expect(await screen.findByText('코드 승인')).toBeInTheDocument()
  expect(screen.getByText('최고관리자 전용')).toBeInTheDocument()
  expect(screen.getByText('바뀐 파일 2개')).toBeInTheDocument()
  expect(screen.getByText('src/main/resources/schema.sql')).toBeInTheDocument()
  // The approval is judged on the patch itself, not on its fingerprint.
  expect(screen.getByText(/\+데모 확인/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '네, 이 코드를 반영합니다' })).toBeInTheDocument()
})

test('a missing diff warns the approver instead of leaving a silent gap', async () => {
  render(<CodingWorkspace role="SUPER_ADMIN" api={finalApi({
    ...githubDetail,
    technical: { ...githubDetail.technical!, diff: undefined },
  })} />)

  expect(await screen.findByText(/변경 내용\(diff\)을 불러오지 못했습니다/)).toBeInTheDocument()
})

test('a moved dev branch is warned about before the merge is approved', async () => {
  render(<CodingWorkspace role="SUPER_ADMIN" api={finalApi({
    ...githubDetail,
    technical: {
      ...githubDetail.technical!,
      baseShaFreshness: { stale: true, currentDevSha: `sha1:${'9'.repeat(40)}` },
    },
  })} />)

  expect(await screen.findByText(/dev 가 움직였습니다/)).toBeInTheDocument()
})

test('an administrator the server sent no evidence to is told so, not shown an empty table', async () => {
  render(<CodingWorkspace role="SUPER_ADMIN" api={finalApi({ ...githubDetail, technical: undefined })} />)

  expect(await screen.findByText(/코드 근거는 최고관리자에게만 전달됩니다/)).toBeInTheDocument()
  expect(screen.queryByText(/바뀐 파일/)).not.toBeInTheDocument()
})

test('the deploy gate is its own approval, so merging is not deploying', async () => {
  render(<CodingWorkspace role="SUPER_ADMIN" api={finalApi({
    ...githubDetail,
    currentStage: 'deploy_approval',
    pendingApproval: { ...pendingGithub, stage: 'DEPLOY' as const, nodeId: 'deploy_approval' },
  })} />)

  expect(await screen.findByText('배포 승인')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '네, 배포합니다' })).toBeInTheDocument()
})

/*
 * The deploy gate is the last click of the demo and the server answers APPROVAL_ROLE_FORBIDDEN
 * to a general administrator. The screen used to offer the button anyway, so the refusal was
 * discovered as a red error at the end of the run.
 */
test('a stage this role cannot decide locks both buttons and says which account is needed', async () => {
  const api = finalApi({
    ...githubDetail,
    currentStage: 'deploy_approval',
    pendingApproval: { ...pendingGithub, stage: 'DEPLOY' as const, nodeId: 'deploy_approval' },
  })
  render(<CodingWorkspace role="GENERAL_ADMIN" api={api} />)

  expect(await screen.findByText('배포 승인')).toBeInTheDocument()
  expect(screen.getByText(/최고관리자만 결정할 수 있습니다/)).toBeInTheDocument()
  expect(screen.getByText(/지금 로그인한 계정은 일반관리자입니다/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '네, 배포합니다' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '아니요' })).toBeDisabled()

  fireEvent.click(screen.getByRole('button', { name: '네, 배포합니다' }))
  expect(api.decideApproval).not.toHaveBeenCalled()
})

test('a general administrator still decides the stages that admit that role', async () => {
  render(<CodingWorkspace role="GENERAL_ADMIN" api={finalApi({
    ...githubDetail,
    pendingApproval: { ...pendingGithub, requiredRole: 'GENERAL_ADMIN' },
  })} />)

  expect(await screen.findByRole('button', { name: '네, 이 코드를 반영합니다' })).toBeEnabled()
})

test('rejecting a merge cancels the request and says the PR must be closed by hand', async () => {
  const api = finalApi(githubDetail)
  render(<CodingWorkspace role="SUPER_ADMIN" api={api} />)

  fireEvent.click(await screen.findByRole('button', { name: '아니요' }))
  expect(screen.getByText(/이미 올라간 PR 이 있다면 사람이 직접 닫아야 합니다/)).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('반려 사유'), { target: { value: '스키마 변경은 별도 검토가 필요합니다.' } })
  fireEvent.click(screen.getByRole('button', { name: '반려하고 요청을 취소합니다' }))

  await waitFor(() => expect(api.decideApproval).toHaveBeenCalledWith(
    openJob.jobId, pendingGithub, 'REJECTED', '스키마 변경은 별도 검토가 필요합니다.',
  ))
})

/*
 * E6, the execution history. The runner is a host process a person has to start; when it is
 * off, requests silently wait forever. "실패는 조용하지 않게" — the screen must say it loudly.
 */
test('a silent runner puts a large warning at the top of the screen', async () => {
  render(<CodingWorkspace role="GENERAL_ADMIN" api={consoleApi({
    runnerStatus: vi.fn().mockResolvedValue({ schemaVersion: '1.0', alive: false }),
  })} />)

  expect(await screen.findByText('실행기가 응답하지 않습니다.')).toBeInTheDocument()
  expect(screen.getByText(/서버가 켜진 뒤 신호가 없습니다/)).toBeInTheDocument()
  expect(screen.getByText(/시스템 운영 담당자에게 실행기 실행을 요청해 주세요/)).toBeInTheDocument()
})

test('a healthy runner shows no warning', async () => {
  render(<CodingWorkspace role="GENERAL_ADMIN" api={consoleApi()} />)

  await screen.findByRole('button', { name: '요청 보내기' })
  expect(screen.queryByText('실행기가 응답하지 않습니다.')).not.toBeInTheDocument()
})

test('the execution history lists each request with its status and elapsed time', async () => {
  const items: JobSummary[] = [
    {
      jobId: 'aaaaaaaa-1111-4111-8111-111111111111',
      repository: 'backend',
      requestText: '회원 목록에 가입일도 보이게 해줘',
      status: 'COMPLETED',
      createdAt: '2026-09-02T01:00:00Z',
      finishedAt: '2026-09-02T01:42:00Z',
    },
    {
      jobId: 'bbbbbbbb-2222-4222-8222-222222222222',
      repository: 'backend',
      requestText: '상태 점검 응답에 서버 버전도 넣어줘',
      status: 'FAILED',
      createdAt: '2026-09-02T00:00:00Z',
      finishedAt: '2026-09-02T00:03:00Z',
      failureCode: 'CODING_GUARDRAIL_PATH_NOT_SELECTED',
    },
  ]
  render(<CodingWorkspace role="GENERAL_ADMIN" api={consoleApi({
    listJobs: vi.fn().mockResolvedValue({ schemaVersion: '1.0', items }),
  })} />)

  expect(await screen.findByText('실행 이력')).toBeInTheDocument()
  expect(screen.getByText('회원 목록에 가입일도 보이게 해줘')).toBeInTheDocument()
  expect(screen.getByText('42분 걸림')).toBeInTheDocument()
  expect(screen.getByText('3분 걸림')).toBeInTheDocument()
})

test('an empty history says so instead of showing a bare panel', async () => {
  render(<CodingWorkspace role="GENERAL_ADMIN" api={consoleApi()} />)

  expect(await screen.findByText('아직 보낸 요청이 없습니다.')).toBeInTheDocument()
})

/* F6: the screen must refetch on its own — the whole point is no refresh-button hammering. */
test('the screen refetches by itself on the polling cadence', async () => {
  vi.useFakeTimers()
  try {
    const api = consoleApi()
    render(<CodingWorkspace role="GENERAL_ADMIN" api={api} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    const initialCalls = (api.listJobs as ReturnType<typeof vi.fn>).mock.calls.length
    expect(initialCalls).toBeGreaterThanOrEqual(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(16_000) })
    expect((api.listJobs as ReturnType<typeof vi.fn>).mock.calls.length)
      .toBeGreaterThan(initialCalls)
    expect((api.runnerStatus as ReturnType<typeof vi.fn>).mock.calls.length)
      .toBeGreaterThanOrEqual(2)
  }
  finally {
    vi.useRealTimers()
  }
})

/*
 * The two administrators take turns, and neither can see the other's move without being
 * told. The line names the person, which is what an approval ledger is for.
 */
test('the screen lists what another administrator decided, naming them', async () => {
  render(<CodingWorkspace role="GENERAL_ADMIN" api={consoleApi({
    notifications: vi.fn().mockResolvedValue({
      schemaVersion: '1.0',
      items: [
        {
          kind: 'APPROVAL_DECIDED',
          jobId: 'aaaaaaaa-1111-4111-8111-111111111111',
          requestText: '회원 목록에 가입일도 보이게 해줘',
          stage: '코드',
          decision: 'APPROVED',
          actorName: '최고 관리자',
          actorRole: 'SUPER_ADMIN',
          occurredAt: new Date(Date.now() - 3 * 60_000).toISOString(),
        },
        {
          kind: 'APPROVAL_WAITING',
          jobId: 'bbbbbbbb-2222-4222-8222-222222222222',
          requestText: '공지사항에 첨부파일을 붙일 수 있게 해줘',
          stage: '계획',
          occurredAt: new Date(Date.now() - 60_000).toISOString(),
        },
      ],
    }),
  })} />)

  expect(await screen.findByText('최근 알림')).toBeInTheDocument()
  expect(screen.getByText('최고 관리자님이 코드 단계를 승인했습니다')).toBeInTheDocument()
  expect(screen.getByText('3분 전')).toBeInTheDocument()
  expect(screen.getByText('계획 단계에서 승인을 기다리고 있습니다')).toBeInTheDocument()
})

test('no news means no panel rather than an empty one', async () => {
  render(<CodingWorkspace role="GENERAL_ADMIN" api={consoleApi()} />)

  await screen.findByRole('button', { name: '요청 보내기' })
  expect(screen.queryByText('최근 알림')).not.toBeInTheDocument()
})

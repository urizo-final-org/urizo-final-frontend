import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import CodingWorkspace from './CodingWorkspace'
import { ProductApiError } from '../../shared/api/error'
import type { CodingConsoleApiClient, JobDetail, JobSummary } from './api'

const created = {
  schemaVersion: '1.0',
  created: {
    schemaVersion: '1.0',
    job: { jobId: '11111111-2222-3333-4444-555555555555', status: 'PENDING' as const, stateVersion: 1 },
    request: {
      jobId: '11111111-2222-3333-4444-555555555555',
      requestText: '회원 목록에 가입일도 보이게 해줘',
      createdAt: '2026-09-02T02:00:00Z',
    },
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

/*
 * E7, the handover record (guide 7-8). The model used up its rework rounds, so the request
 * ends as an ordinary success and would otherwise be filed under "완료" - the one ending where
 * somebody actually has to pick the work up.
 */
const handedOverJob = {
  jobId: 'c0ffee00-0000-4000-8000-000000000001',
  repository: 'backend',
  requestText: '게시판에 첨부파일을 붙일 수 있게 해줘',
  status: 'COMPLETED' as const,
  createdAt: '2026-09-03T01:00:00Z',
  finishedAt: '2026-09-03T01:40:00Z',
  refused: false,
  handedOver: true,
}

function handedOverApi(): CodingConsoleApiClient {
  return consoleApi({
    listJobs: vi.fn().mockResolvedValue({ schemaVersion: '1.0', items: [handedOverJob] }),
    getJob: vi.fn().mockResolvedValue({
      schemaVersion: '1.0',
      jobId: handedOverJob.jobId,
      repository: 'backend',
      requestText: handedOverJob.requestText,
      status: 'COMPLETED',
      pipelineAttempt: 1,
      maxPipelineAttempts: 3,
      decisions: [],
      refused: false,
      createdAt: handedOverJob.createdAt,
      finishedAt: handedOverJob.finishedAt,
      handover: {
        rounds: 3,
        attempts: [
          {
            round: 1, accepted: false, recordedAt: '2026-09-03T01:10:00Z',
            summary: '첨부는 저장되지만 목록에서 다시 열리지 않습니다.',
            criteriaResults: [{ criterion: '첨부한 파일을 다시 열 수 있다', met: false }],
          },
          {
            round: 2, accepted: false, recordedAt: '2026-09-03T01:25:00Z',
            summary: '목록에서는 열리지만 삭제하면 파일이 남습니다.',
            criteriaResults: [{ criterion: '첨부한 파일을 다시 열 수 있다', met: true }],
          },
          {
            round: 3, accepted: false, recordedAt: '2026-09-03T01:40:00Z',
            summary: '삭제는 되지만 기존 글의 첨부가 사라집니다.',
            criteriaResults: [],
          },
        ],
      },
    }),
  })
}

test('a request the AI gave up on is not filed away as finished', async () => {
  render(<CodingWorkspace role="GENERAL_ADMIN" api={handedOverApi()} />)

  expect(await screen.findByText('이 요청은 사람이 이어받아야 합니다')).toBeInTheDocument()
  expect(await screen.findByText(/개발 담당자에게 전달해 주세요/)).toBeInTheDocument()
})

test('the handover carries every round and what the review said was still wrong', async () => {
  render(<CodingWorkspace role="GENERAL_ADMIN" api={handedOverApi()} />)

  expect(await screen.findByText('AI 가 시도한 기록 3회')).toBeInTheDocument()
  expect(screen.getByText('1번째 시도')).toBeInTheDocument()
  expect(screen.getByText('3번째 시도')).toBeInTheDocument()
  expect(screen.getByText(/목록에서 다시 열리지 않습니다/)).toBeInTheDocument()
  expect(screen.getByText(/기존 글의 첨부가 사라집니다/)).toBeInTheDocument()
})

/* Read by whoever has to decide what happens next, who may not be able to read a diff. */
test('the handover names no file and shows no code', async () => {
  const { container } = render(<CodingWorkspace role="GENERAL_ADMIN" api={handedOverApi()} />)

  await screen.findByText('AI 가 시도한 기록 3회')
  expect(container.textContent).not.toMatch(/\.java|\.tsx|src\//)
})

/* The screen marks the news read as it loads, and that mark outlives one test. */
beforeEach(() => {
  window.localStorage.clear()
})

/**
 * The screen asks for a sentence in Korean and nothing else. It used to ask which side the
 * sentence was about - a question whose answer the writer often cannot know, because
 * "가입일도 보이게 해줘" needs both sides at once. The server's classifier reads the sentence
 * instead, so the form sends no repository at all.
 */
test('the form asks only for the sentence, never which side it is about', async () => {
  render(<CodingWorkspace role="SUPER_ADMIN" api={consoleApi()} />)

  const send = await screen.findByRole('button', { name: '요청 보내기' })
  expect(send).toBeDisabled()

  expect(screen.queryByLabelText(/기능과 데이터/)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/화면 모양/)).not.toBeInTheDocument()
  expect(screen.queryByText('백엔드')).not.toBeInTheDocument()
  expect(screen.queryByText('프론트엔드')).not.toBeInTheDocument()
})

/* The person is warned, in their own terms, that one sentence may come back as two check-ins. */
test('the form says a many-sided request is split and checked more than once', async () => {
  render(<CodingWorkspace role="SUPER_ADMIN" api={consoleApi()} />)

  expect(await screen.findByText(/알아서 나눠 차례로 진행/)).toBeInTheDocument()
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

test('sending a Korean sentence hands it to the server whole and the same card becomes that request', async () => {
  const api = consoleApi()
  render(<CodingWorkspace role="SUPER_ADMIN" api={api} />)

  await screen.findByRole('button', { name: '요청 보내기' })
  fireEvent.change(screen.getByLabelText('무엇을 바꿀까요'), {
    target: { value: '회원 목록에 가입일도 보이게 해줘' },
  })
  fireEvent.click(screen.getByRole('button', { name: '요청 보내기' }))

  // repository null on purpose: which side the sentence is about is the server's question now.
  await waitFor(() => expect(api.createJob).toHaveBeenCalledWith(null, '회원 목록에 가입일도 보이게 해줘'))
  expect(await screen.findByText('회원 목록에 가입일도 보이게 해줘')).toBeInTheDocument()
  expect(screen.getByLabelText('무엇을 바꿀까요')).toHaveValue('')
})

/*
 * C: one sentence that needs both sides. The server answers with the split and the data half
 * is already running when the answer arrives. The card says what will happen in the
 * requester's own words - no stage names, no repositories - and the promised second half is
 * remembered outside memory, so a closed tab does not orphan it.
 */
const splitOutcome = {
  schemaVersion: '1.0',
  created: {
    schemaVersion: '1.0',
    job: { jobId: 'a1a1a1a1-1111-4111-8111-111111111111', status: 'PENDING' as const, stateVersion: 1 },
    request: {
      jobId: 'a1a1a1a1-1111-4111-8111-111111111111',
      requestText: '회원 가입일을 저장하고 목록에서 보여줘',
      createdAt: '2026-09-03T02:00:00Z',
    },
  },
  split: {
    firstText: '회원 가입일을 저장하고 조회할 수 있게 해줘',
    secondText: '회원 목록 화면에 가입일이 보이게 해줘',
  },
}

const splitPending = {
  firstJobId: 'a1a1a1a1-1111-4111-8111-111111111111',
  firstText: '회원 가입일을 저장하고 조회할 수 있게 해줘',
  secondText: '회원 목록 화면에 가입일이 보이게 해줘',
}

test('a both-sides sentence shows its two halves in the requester\'s words', async () => {
  const api = consoleApi({ createJob: vi.fn().mockResolvedValue(splitOutcome) })
  render(<CodingWorkspace role="GENERAL_ADMIN" api={api} />)

  await screen.findByRole('button', { name: '요청 보내기' })
  fireEvent.change(screen.getByLabelText('무엇을 바꿀까요'), {
    target: { value: '회원 가입일을 저장하고 목록에서 보여줘' },
  })
  fireEvent.click(screen.getByRole('button', { name: '요청 보내기' }))

  expect(await screen.findByText('이 요청은 두 가지 일이 필요합니다')).toBeInTheDocument()
  expect(screen.getByText('지금 진행 중')).toBeInTheDocument()
  expect(screen.getByText('회원 가입일을 저장하고 조회할 수 있게 해줘')).toBeInTheDocument()
  expect(screen.getByText('끝나면 자동으로')).toBeInTheDocument()
  expect(screen.getByText('회원 목록 화면에 가입일이 보이게 해줘')).toBeInTheDocument()
  expect(window.localStorage.getItem('axms-coding-split-second')).toContain('회원 목록 화면에')
})

test('the second half is sent by itself when the first ends well', async () => {
  window.localStorage.setItem('axms-coding-split-second', JSON.stringify(splitPending))
  const api = consoleApi({
    listJobs: vi.fn().mockResolvedValue({
      schemaVersion: '1.0',
      items: [{
        jobId: splitPending.firstJobId,
        repository: 'backend',
        requestText: splitPending.firstText,
        status: 'COMPLETED' as const,
        createdAt: '2026-09-03T02:00:00Z',
        finishedAt: '2026-09-03T02:30:00Z',
      }],
    }),
  })
  render(<CodingWorkspace role="GENERAL_ADMIN" api={api} />)

  // The classifier already decided this half's side, so the server is told, not asked again.
  await waitFor(() => expect(api.createJob)
    .toHaveBeenCalledWith('frontend', splitPending.secondText))
  // Cleared before the call, not after: a double-send is the failure this record prevents.
  expect(window.localStorage.getItem('axms-coding-split-second')).toBeNull()
})

/*
 * The first half stopped - refused, failed, or handed over. The person is already looking at
 * why; quietly building the screen half on top of a stopped data half helps nobody.
 */
test('a first half that stopped drops the second half instead of building on it', async () => {
  window.localStorage.setItem('axms-coding-split-second', JSON.stringify(splitPending))
  const api = consoleApi({
    listJobs: vi.fn().mockResolvedValue({
      schemaVersion: '1.0',
      items: [{
        jobId: splitPending.firstJobId,
        repository: 'backend',
        requestText: splitPending.firstText,
        status: 'FAILED' as const,
        createdAt: '2026-09-03T02:00:00Z',
        finishedAt: '2026-09-03T02:05:00Z',
        failureCode: 'CODING_GUARDRAIL_PATH_NOT_SELECTED',
      }],
    }),
  })
  render(<CodingWorkspace role="GENERAL_ADMIN" api={api} />)

  expect(await screen.findByText('직전 요청이 중단됐습니다')).toBeInTheDocument()
  expect(api.createJob).not.toHaveBeenCalled()
  expect(window.localStorage.getItem('axms-coding-split-second')).toBeNull()
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

/*
 * "Still being raised" and "it failed" are not the same news. Told apart, because waiting for
 * a screen that is never going to appear is how a person ends up approving the last request's
 * preview instead of this one's.
 */
/*
 * The two readers get different halves of the same fact on purpose. A path and a compiler code
 * are unreadable to the person approving the result, and indispensable to the person who has
 * to fix it.
 */
test('a blocked preview says why instead of asking the operator to keep waiting', async () => {
  render(<CodingWorkspace role="SUPER_ADMIN" api={candidateApi({
    ...candidateDetail,
    preview: { ready: false, blocked: 'AI 가 만든 화면이 검사를 통과하지 못했습니다.' },
  })} />)

  expect(await screen.findByText(/검사를 통과하지 못했습니다/)).toBeInTheDocument()
  expect(screen.queryByText(/아직 준비되지 않았습니다/)).not.toBeInTheDocument()
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

/*
 * The two readers get different halves of the same fact on purpose. A path and a compiler code
 * are unreadable to the person approving the result, and indispensable to the person who has
 * to fix it, so the plain sentence goes to one screen and the runner's own words to this one.
 */
test('the runner reason reaches the reader who can act on it', async () => {
  render(<CodingWorkspace role="SUPER_ADMIN" api={finalApi({
    ...githubDetail,
    technical: {
      ...githubDetail.technical!,
      runnerFailure: 'TEST RUNNER_TEST_FAILED: src/features/cms/MemberList.tsx(12,5): error TS2322',
    },
  })} />)

  expect(await screen.findByText(/MemberList/)).toBeInTheDocument()
  expect(screen.getByText(/실행기가 이 후보에서 멈췄습니다/)).toBeInTheDocument()
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

  expect(await screen.findByText('새 소식')).toBeInTheDocument()
  expect(screen.getByText('최고 관리자님이 코드 단계를 승인했습니다')).toBeInTheDocument()
  expect(screen.getByText('3분 전')).toBeInTheDocument()
  expect(screen.getByText('계획 단계에서 승인을 기다리고 있습니다')).toBeInTheDocument()
})

test('no news means no panel rather than an empty one', async () => {
  render(<CodingWorkspace role="GENERAL_ADMIN" api={consoleApi()} />)

  await screen.findByRole('button', { name: '요청 보내기' })
  expect(screen.queryByText('새 소식')).not.toBeInTheDocument()
})

/*
 * A refusal ends the pipeline normally, so the server stores it as COMPLETED. Shown as "완료"
 * it tells the person who was turned down the opposite of what happened.
 */
test('a refused request says so instead of reading as completed', async () => {
  const refusedJob = {
    jobId: 'cccccccc-3333-4333-8333-333333333333',
    repository: 'backend',
    requestText: '상태 점검 응답에 서버 버전도 넣어줘',
    status: 'COMPLETED' as const,
    createdAt: '2026-09-03T01:00:00Z',
    finishedAt: '2026-09-03T01:00:03Z',
    refused: true,
  }
  render(<CodingWorkspace role="GENERAL_ADMIN" api={consoleApi({
    listJobs: vi.fn().mockResolvedValue({ schemaVersion: '1.0', items: [refusedJob] }),
    getJob: vi.fn().mockResolvedValue({
      schemaVersion: '1.0',
      jobId: refusedJob.jobId,
      repository: 'backend',
      requestText: refusedJob.requestText,
      status: 'COMPLETED',
      pipelineAttempt: 1,
      maxPipelineAttempts: 3,
      plan: {
        summary: '이 작업은 상태 점검 영역이라 진행할 수 없습니다. 최고 관리자에게 요청해 주세요.',
        acceptanceCriteria: [],
      },
      decisions: [],
      refused: true,
      createdAt: refusedJob.createdAt,
    }),
  })} />)

  expect(await screen.findByText('이 요청은 진행할 수 없습니다')).toBeInTheDocument()
  expect(screen.getByText(/상태 점검 영역이라 진행할 수 없습니다/)).toBeInTheDocument()
  // The history must not call it 완료 either.
  expect(screen.getByText('진행 안 함')).toBeInTheDocument()
  expect(screen.queryByText('완료')).not.toBeInTheDocument()
})

/*
 * Measured 2026-09-03: three requests were refused in a row and none of them appeared, because
 * an approval left waiting an hour earlier held the one visible slot. To the person typing, the
 * guardrail looked broken. The newest request now answers for itself either way.
 */
test('a refusal is shown even while an older request still waits for approval', async () => {
  const refused = {
    jobId: 'dddddddd-4444-4444-8444-444444444444',
    repository: 'backend',
    requestText: '상태 점검에 서버 버전 넣어줘',
    status: 'COMPLETED' as const,
    createdAt: '2026-09-03T01:24:00Z',
    finishedAt: '2026-09-03T01:24:03Z',
    refused: true,
  }
  const stillWaiting = {
    jobId: 'eeeeeeee-5555-4555-8555-555555555555',
    repository: 'backend',
    requestText: '회원 목록 조회 응답에 가입일 정보도 함께 내려주세요',
    status: 'WAITING_APPROVAL' as const,
    createdAt: '2026-09-03T00:57:00Z',
  }
  render(<CodingWorkspace role="GENERAL_ADMIN" api={consoleApi({
    listJobs: vi.fn().mockResolvedValue({ schemaVersion: '1.0', items: [refused, stillWaiting] }),
    getJob: vi.fn().mockImplementation((jobId: string) => Promise.resolve(
      jobId === refused.jobId
        ? {
          schemaVersion: '1.0', jobId, repository: 'backend', requestText: refused.requestText,
          status: 'COMPLETED', pipelineAttempt: 1, maxPipelineAttempts: 3,
          plan: { summary: '상태 점검 영역은 허용되지 않아 진행할 수 없습니다.', acceptanceCriteria: [] },
          decisions: [], refused: true, createdAt: refused.createdAt,
        }
        : {
          schemaVersion: '1.0', jobId, repository: 'backend', requestText: stillWaiting.requestText,
          status: 'WAITING_APPROVAL', pipelineAttempt: 1, maxPipelineAttempts: 3,
          decisions: [], createdAt: stillWaiting.createdAt,
        })),
  })} />)

  // The refusal, with the analyst's own reason.
  expect(await screen.findByText('이 요청은 진행할 수 없습니다')).toBeInTheDocument()
  expect(screen.getByText(/상태 점검 영역은 허용되지 않아/)).toBeInTheDocument()
  // And the older approval is still reachable, labelled as the older one.
  expect(screen.getByText(/아래는 이전에 보낸 요청이며/)).toBeInTheDocument()
  expect(screen.getAllByText(stillWaiting.requestText).length).toBeGreaterThan(0)
})

/* B: the panel is news, not history. What the reader already acknowledged is gone next time. */
test('news already read does not come back on the next visit', async () => {
  window.localStorage.setItem(
    'axms.coding.notifications.seenAt', new Date(Date.now() + 60_000).toISOString())

  render(<CodingWorkspace role="GENERAL_ADMIN" api={consoleApi({
    notifications: vi.fn().mockResolvedValue({
      schemaVersion: '1.0',
      items: [{
        kind: 'APPROVAL_DECIDED',
        jobId: 'ffffffff-6666-4666-8666-666666666666',
        requestText: '어제 승인한 요청',
        stage: '배포',
        decision: 'APPROVED',
        actorName: '최고 관리자',
        actorRole: 'SUPER_ADMIN',
        occurredAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      }],
    }),
  })} />)

  await screen.findByRole('button', { name: '요청 보내기' })
  expect(screen.queryByText('새 소식')).not.toBeInTheDocument()
})

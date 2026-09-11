import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import ApprovalBell from './ApprovalBell'
import { ProductApiError } from '../../shared/api/error'
import type { CodingConsoleApiClient, CodingNotification } from './api'
import { lastSeenAt, markSeen } from './notifications'

function waitingItem(id: string): CodingNotification {
  return {
    kind: 'APPROVAL_WAITING',
    jobId: id,
    requestText: '회원 목록에 가입일도 보이게 해줘',
    stage: '계획',
    occurredAt: new Date().toISOString(),
  }
}

function decidedItem(id: string): CodingNotification {
  return {
    kind: 'APPROVAL_DECIDED',
    jobId: id,
    requestText: '공지사항에 첨부파일을 붙일 수 있게 해줘',
    stage: '배포',
    decision: 'APPROVED',
    actorName: '최고 관리자',
    actorRole: 'SUPER_ADMIN',
    occurredAt: new Date().toISOString(),
  }
}

function bellApi(
  items: CodingNotification[],
  overrides: Partial<CodingConsoleApiClient> = {},
): CodingConsoleApiClient {
  return {
    createJob: vi.fn(),
    listJobs: vi.fn().mockResolvedValue({ schemaVersion: '1.0', items: [] }),
    getJob: vi.fn(),
    runnerStatus: vi.fn(),
    notifications: vi.fn().mockResolvedValue({ schemaVersion: '1.0', items }),
    decideApproval: vi.fn(),
    cancelJob: vi.fn(),
    guardrailSelections: vi.fn(),
    saveGuardrailSelections: vi.fn(),
    startGuardrailScan: vi.fn(),
    guardrailScan: vi.fn(),
    guardrailRules: vi.fn(),
    saveGuardrailRules: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

/*
 * The bell rings for both kinds of news: an approval waiting on this administrator, and a
 * decision the other one made. The second is the whole reason it exists - the two take turns
 * and neither sees the other's move otherwise.
 */
test('the bell counts waiting approvals and other people\'s decisions alike', async () => {
  render(<ApprovalBell api={bellApi([waitingItem('a'), decidedItem('b')])} onOpen={() => {}} />)

  expect(await screen.findByText('2')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /새 알림 2건/ })).toBeInTheDocument()
})

test('news already read is not counted again', async () => {
  markSeen(new Date(Date.now() + 60_000).toISOString())

  render(<ApprovalBell api={bellApi([waitingItem('a'), decidedItem('b')])} onOpen={() => {}} />)

  await waitFor(() => expect(
    screen.getByRole('button', { name: '알림 목록 열기' })).toBeInTheDocument())
  expect(screen.queryByText('2')).not.toBeInTheDocument()
})

test('nothing new shows no badge at all', async () => {
  render(<ApprovalBell api={bellApi([])} onOpen={() => {}} />)

  await waitFor(() => expect(
    screen.getByRole('button', { name: '알림 목록 열기' })).toBeInTheDocument())
  expect(screen.queryByText('0')).not.toBeInTheDocument()
})

test('a failed poll shows no number rather than a zero that reads as "all clear"', async () => {
  render(<ApprovalBell api={bellApi([], {
    notifications: vi.fn().mockRejectedValue(new ProductApiError({
      status: 503, code: 'CODING_HANDLER_STORE_UNAVAILABLE', message: '저장소를 사용할 수 없습니다.',
    })),
  })} onOpen={() => {}} />)

  await waitFor(() => expect(screen.getByRole('button')).toBeInTheDocument())
  expect(screen.queryByText('0')).not.toBeInTheDocument()
})

/*
 * Pressing the bell shows the news where the reader already is. It does not leave the screen
 * and it does not mark anything read: the screen it can open shows the same list, and a mark
 * set here would empty that panel before it rendered.
 */
test('the bell opens the news in place without marking it read', async () => {
  const onOpen = vi.fn()
  render(<ApprovalBell api={bellApi([waitingItem('a'), decidedItem('b')])} onOpen={onOpen} />)

  fireEvent.click(await screen.findByRole('button', { name: /새 알림 2건/ }))

  const dialog = screen.getByRole('dialog', { name: '새 알림' })
  expect(dialog).toHaveTextContent('계획 단계에서 승인을 기다리고 있습니다')
  expect(dialog).toHaveTextContent('최고 관리자님이 배포 단계를 승인했습니다')
  expect(dialog).toHaveTextContent('회원 목록에 가입일도 보이게 해줘')
  expect(onOpen).not.toHaveBeenCalled()
  expect(lastSeenAt()).toBeNull()
  expect(screen.getByText('2')).toBeInTheDocument()
})

test('choosing a line opens the screen and clears the badge, leaving the mark to the screen', async () => {
  const onOpen = vi.fn()
  render(<ApprovalBell api={bellApi([waitingItem('a')])} onOpen={onOpen} />)
  fireEvent.click(await screen.findByRole('button', { name: /새 알림 1건/ }))

  fireEvent.click(screen.getByRole('button', { name: /계획 단계에서 승인을 기다리고 있습니다/ }))

  expect(onOpen).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(screen.queryByText('1')).not.toBeInTheDocument())
  expect(lastSeenAt()).toBeNull()
})

test('the way out at the bottom opens the screen even when the list is empty', async () => {
  const onOpen = vi.fn()
  render(<ApprovalBell api={bellApi([])} onOpen={onOpen} />)
  await waitFor(() => expect(
    screen.getByRole('button', { name: '알림 목록 열기' })).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: '알림 목록 열기' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('새 알림이 없습니다.')
  fireEvent.click(screen.getByRole('button', { name: 'LLM CI/CD 열기' }))

  expect(onOpen).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

/**
 * 이 종은 코딩 알림만의 것이 아니다. RAG 쪽 일감도 같은 자리에 실린다 — 읽는 사람이 던지는
 * 질문("나 볼 거 있나")이 하나이기 때문이다. 코딩 알림이 아직 안 와도 이쪽은 셀 수 있다.
 */
test('extra notices count and render alongside the coding feed', async () => {
  render(<ApprovalBell api={bellApi([waitingItem('a')])} onOpen={() => {}} extra={[{
    id: 'r-1',
    text: '일반 관리자님이 자료 갱신을 요청했습니다',
    detail: '축제가 이미 끝났습니다',
    at: new Date().toISOString(),
    onPick: vi.fn(),
  }]} />)

  fireEvent.click(await screen.findByRole('button', { name: /새 알림 2건/ }))
  const dialog = screen.getByRole('dialog', { name: '새 알림' })
  expect(dialog).toHaveTextContent('일반 관리자님이 자료 갱신을 요청했습니다')
  expect(dialog).toHaveTextContent('축제가 이미 끝났습니다')
  expect(dialog).toHaveTextContent('계획 단계에서 승인을 기다리고 있습니다')
})

/*
 * 고른 줄은 화면에서 치운다 — 확인하러 들어가는 것이 곧 그 알림에 대한 응답이다.
 *
 * 그러면서도 코딩 목록은 건드리지 않는다. 읽음을 적는 쪽은 LLM DevOps 화면인데 이 줄은
 * 거기로 가지 않는다 — `read()`가 돌면 코딩 숫자까지 사라졌다가 다음 폴링에 되살아난다.
 */
test('choosing an extra notice clears that line and leaves the coding feed alone', async () => {
  const pick = vi.fn()
  const onOpen = vi.fn()
  render(<ApprovalBell api={bellApi([waitingItem('a')])} onOpen={onOpen} extra={[
    { id: 'r-1', text: '일반 관리자님이 자료 갱신을 요청했습니다', onPick: pick },
  ]} />)
  fireEvent.click(await screen.findByRole('button', { name: /새 알림 2건/ }))

  fireEvent.click(screen.getByRole('button', { name: /자료 갱신을 요청했습니다/ }))

  expect(pick).toHaveBeenCalledTimes(1)
  expect(onOpen).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  // 2 → 1. 고른 줄만 빠지고 코딩 알림 한 건은 남는다. read()가 돌았다면 숫자가 통째로 사라졌다.
  const bell = await screen.findByRole('button', { name: /새 알림 1건/ })
  expect(lastSeenAt()).toBeNull()

  // 다시 열어도 그 줄은 없다 — 치운 것이 화면에만 반영되고 마는 것이 아니다.
  fireEvent.click(bell)
  expect(screen.getByRole('dialog', { name: '새 알림' }))
    .not.toHaveTextContent('자료 갱신을 요청했습니다')
})

/** 코딩 쪽 폴링이 죽어도 RAG 일감은 울려야 한다. 축이 서로를 끄지 않는다. */
test('extra notices still ring when the coding poll fails', async () => {
  render(<ApprovalBell
    api={bellApi([], {
      notifications: vi.fn().mockRejectedValue(new ProductApiError({
        status: 503, code: 'CODING_HANDLER_STORE_UNAVAILABLE', message: '저장소를 사용할 수 없습니다.',
      })),
    })}
    onOpen={() => {}}
    extra={[{ id: 'r-1', text: '일반 관리자님이 자료 갱신을 요청했습니다', onPick: vi.fn() }]}
  />)

  expect(await screen.findByRole('button', { name: /새 알림 1건/ })).toBeInTheDocument()
})

test('a list that never arrived is not shown as empty', async () => {
  render(<ApprovalBell api={bellApi([], {
    notifications: vi.fn().mockRejectedValue(new ProductApiError({
      status: 503, code: 'CODING_HANDLER_STORE_UNAVAILABLE', message: '저장소를 사용할 수 없습니다.',
    })),
  })} onOpen={() => {}} />)
  await waitFor(() => expect(screen.getByRole('button')).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: '알림 목록 열기' }))

  expect(screen.getByRole('dialog')).toHaveTextContent('알림을 아직 확인하지 못했습니다.')
  expect(screen.getByRole('dialog')).not.toHaveTextContent('새 알림이 없습니다.')
})

test('Escape and a click elsewhere close the list', async () => {
  render(<div>
    <p>바깥</p>
    <ApprovalBell api={bellApi([waitingItem('a')])} onOpen={() => {}} />
  </div>)
  const bell = await screen.findByRole('button', { name: /새 알림 1건/ })

  fireEvent.click(bell)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

  fireEvent.click(bell)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.mouseDown(screen.getByText('바깥'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

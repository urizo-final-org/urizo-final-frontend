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

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CmsAiAssistant from './CmsAiAssistant'
import { recordState, sinceLabel } from './AssistantRecords'
import type { NaturalCmsApi, NaturalCmsJob, NaturalCmsRecord } from './api'

const FIVE_MINUTES = 5 * 60 * 1_000

function record(value: Partial<NaturalCmsRecord> = {}): NaturalCmsRecord {
  return {
    jobId: 'job-1',
    status: 'COMPLETED',
    requestText: '제목을 다듬어 줘',
    targetId: '1',
    updatedAt: new Date().toISOString(),
    ...value,
  }
}

function job(value: Partial<NaturalCmsJob> = {}): NaturalCmsJob {
  return {
    schemaVersion: '1.0', jobId: 'job-1', traceId: 't', profileVersionId: 'p',
    pipelineAttempt: 1, stateVersion: 1, status: 'WAITING_APPROVAL',
    requestText: '제목을 다듬어 줘', resource: { type: 'CONTENT', id: '1' },
    structuredCommand: { operation: 'UPDATE', fields: { title: '새 제목' } },
    previewId: 'preview-1', previewHash: `sha256:${'a'.repeat(64)}`, previewValid: true,
    approvalDecision: null, approvalFeedback: null, createdAt: '', updatedAt: '',
    ...value,
  }
}

function mount(api: Record<string, unknown>) {
  return render(<CmsAiAssistant
    route="contents"
    target={{ type: 'CONTENT', id: '1', label: '회사 소개', fields: { title: '소개', body: '본문' } }}
    candidates={[]} menus={[]} onTarget={vi.fn()}
    api={api as unknown as NaturalCmsApi}
    collapsed={false} onToggle={vi.fn()}
  />)
}

describe('멎음 판정', () => {
  const now = Date.parse('2026-09-14T09:00:00Z')

  it('5분을 넘겨 움직이지 않은 ACTIVE만 멎음이다', () => {
    const running = record({ status: 'ACTIVE', updatedAt: '2026-09-14T08:58:00Z' })
    const stalled = record({ status: 'ACTIVE', updatedAt: '2026-09-14T08:50:00Z' })
    expect(recordState(running, FIVE_MINUTES, now)).toBe('running')
    expect(recordState(stalled, FIVE_MINUTES, now)).toBe('stalled')
  })

  it('결정을 기다리는 요청은 시간과 무관하게 대기다', () => {
    const waiting = record({ status: 'WAITING_APPROVAL', updatedAt: '2026-09-14T06:00:00Z' })
    expect(recordState(waiting, FIVE_MINUTES, now)).toBe('waiting')
  })

  it('끝난 요청은 승인과 반려로 나뉜다', () => {
    expect(recordState(record({ status: 'COMPLETED' }), FIVE_MINUTES, now)).toBe('approved')
    expect(recordState(record({ status: 'REJECTED' }), FIVE_MINUTES, now)).toBe('rejected')
  })

  it('시각을 읽을 수 없으면 멎었다고 단정하지 않는다', () => {
    expect(recordState(record({ status: 'ACTIVE', updatedAt: '' }), FIVE_MINUTES, now)).toBe('running')
  })

  it('지난 시간을 분·시간·일로 줄여 말한다', () => {
    expect(sinceLabel('2026-09-14T08:59:30Z', now)).toBe('방금')
    expect(sinceLabel('2026-09-14T08:40:00Z', now)).toBe('20분 전')
    expect(sinceLabel('2026-09-14T06:00:00Z', now)).toBe('3시간 전')
    expect(sinceLabel('2026-09-12T09:00:00Z', now)).toBe('2일 전')
  })
})

describe('기록', () => {
  it('이 화면의 리소스만 최근 다섯 건까지 조회한다', async () => {
    const records = vi.fn().mockResolvedValue([record({ requestText: '지난 요청' })])
    mount({ records })
    await waitFor(() => { expect(screen.getByText('지난 요청')).toBeInTheDocument() })
    expect(records).toHaveBeenCalledWith('CONTENT', 5)
    expect(screen.getByText('내 요청만')).toBeInTheDocument()
  })

  it('조회가 막히면 오류 대신 기록 칸만 사라진다', async () => {
    const records = vi.fn().mockRejectedValue(new Error('HISTORY_UNAVAILABLE'))
    mount({ records })
    await waitFor(() => { expect(records).toHaveBeenCalled() })
    expect(screen.queryByRole('heading', { name: '기록' })).not.toBeInTheDocument()
    // 기록이 없어도 요청은 그대로 보낼 수 있어야 한다.
    expect(screen.getByRole('button', { name: '요청 분석하기' })).toBeInTheDocument()
  })

  it('대기 행은 이어서 처리로 승인 화면을 다시 연다', async () => {
    const api = {
      records: vi.fn().mockResolvedValue([record({ jobId: 'job-9', status: 'WAITING_APPROVAL' })]),
      job: vi.fn().mockResolvedValue(job({ jobId: 'job-9' })),
    }
    mount(api)
    const resume = await screen.findByRole('button', { name: '이어서 처리' })
    fireEvent.click(resume)
    expect(await screen.findByRole('button', { name: '승인하고 반영' })).toBeInTheDocument()
    expect(api.job).toHaveBeenCalledWith('job-9')
    // 무엇을 승인하는지 보이도록 그때 보낸 문장을 되살린다.
    expect(screen.getByRole('textbox', { name: '자연어 요청' })).toHaveValue('제목을 다듬어 줘')
  })

  it('멎음 행은 닫기로 사유와 함께 Job을 닫는다', async () => {
    const cancel = vi.fn().mockResolvedValue(job({ status: 'REJECTED' }))
    const records = vi.fn()
      .mockResolvedValueOnce([record({ jobId: 'job-7', status: 'ACTIVE', updatedAt: '2026-01-01T00:00:00Z' })])
      .mockResolvedValue([record({ jobId: 'job-7', status: 'REJECTED' })])
    mount({ records, cancel })
    fireEvent.click(await screen.findByRole('button', { name: '닫기' }))
    await waitFor(() => { expect(cancel).toHaveBeenCalled() })
    expect(cancel.mock.calls[0][0]).toBe('job-7')
    expect(cancel.mock.calls[0][1]).toMatch(/\S/)
    await waitFor(() => { expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument() })
  })

  it('도는 중인 요청에는 닫기를 붙이지 않는다', async () => {
    const records = vi.fn().mockResolvedValue([record({ status: 'ACTIVE', updatedAt: new Date().toISOString() })])
    mount({ records })
    await waitFor(() => { expect(screen.getByText('지난 요청') ?? true).toBeTruthy() }).catch(() => undefined)
    await screen.findByText('제목을 다듬어 줘')
    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '이어서 처리' })).not.toBeInTheDocument()
  })
})

describe('요청 문장', () => {
  it('결정을 기다리는 동안 문장이 남고 고칠 수 없다', async () => {
    const api = {
      records: vi.fn().mockResolvedValue([]),
      activeProfileVersionId: vi.fn().mockResolvedValue('p'),
      createJob: vi.fn().mockResolvedValue(job({ previewId: null, previewHash: null, status: 'ACTIVE' })),
      job: vi.fn().mockResolvedValue(job()),
    }
    mount(api)
    const input = screen.getByRole('textbox', { name: '자연어 요청' })
    fireEvent.change(input, { target: { value: '제목을 더 명확하게 다듬어 줘' } })
    fireEvent.click(screen.getByRole('button', { name: '요청 분석하기' }))

    await screen.findByRole('button', { name: '승인하고 반영' })
    expect(input).toHaveValue('제목을 더 명확하게 다듬어 줘')
    expect(input).toHaveAttribute('readonly')
    // 미리보기가 이 문장으로 만들어졌다. 고치면 승인하는 내용과 달라진다.
    fireEvent.change(input, { target: { value: '다른 요청' } })
    expect(input).toHaveValue('제목을 더 명확하게 다듬어 줘')
  })

  it('반려하면 문장이 남아 고쳐 보낼 수 있다', async () => {
    const api = {
      records: vi.fn().mockResolvedValue([]),
      activeProfileVersionId: vi.fn().mockResolvedValue('p'),
      createJob: vi.fn().mockResolvedValue(job({ previewId: null, previewHash: null, status: 'ACTIVE' })),
      job: vi.fn().mockResolvedValue(job()),
      decide: vi.fn().mockResolvedValue(job({ status: 'REJECTED', approvalDecision: 'REJECTED' })),
      refusal: vi.fn().mockResolvedValue({ code: null, reason: null, operations: [] }),
    }
    mount(api)
    const input = screen.getByRole('textbox', { name: '자연어 요청' })
    fireEvent.change(input, { target: { value: '제목을 더 명확하게 다듬어 줘' } })
    fireEvent.click(screen.getByRole('button', { name: '요청 분석하기' }))

    await screen.findByRole('button', { name: '승인하고 반영' })
    fireEvent.change(screen.getByRole('textbox', { name: /반려 사유/ }), { target: { value: '어조가 다릅니다' } })
    fireEvent.click(screen.getByRole('button', { name: '반려' }))

    await screen.findByText('반려됨')
    expect(input).toHaveValue('제목을 더 명확하게 다듬어 줘')
    expect(input).not.toHaveAttribute('readonly')
  })

  it('승인이 끝나면 문장을 비운다', async () => {
    const applied = job({ status: 'COMPLETED', approvalDecision: 'APPROVED' })
    const api = {
      records: vi.fn().mockResolvedValue([]),
      activeProfileVersionId: vi.fn().mockResolvedValue('p'),
      createJob: vi.fn().mockResolvedValue(job({ previewId: null, previewHash: null, status: 'ACTIVE' })),
      job: vi.fn().mockResolvedValueOnce(job()).mockResolvedValue(applied),
      decide: vi.fn().mockResolvedValue(job({ approvalDecision: 'APPROVED' })),
    }
    mount(api)
    const input = screen.getByRole('textbox', { name: '자연어 요청' })
    fireEvent.change(input, { target: { value: '제목을 더 명확하게 다듬어 줘' } })
    fireEvent.click(screen.getByRole('button', { name: '요청 분석하기' }))

    fireEvent.click(await screen.findByRole('button', { name: '승인하고 반영' }))
    await screen.findByText('반영 완료')
    expect(input).toHaveValue('')
  })
})

describe('입력창 위 안내', () => {
  it('경계는 머리글 한 줄이고 추천 문구는 없다', async () => {
    const { container } = mount({ records: vi.fn().mockResolvedValue([]) })
    const panel = within(container.querySelector('aside') as HTMLElement)
    expect(panel.getByText('현재 화면 전용 · 컨텐츠 관리')).toBeInTheDocument()
    expect(panel.queryByText(/변경하지 않아요/)).not.toBeInTheDocument()
    expect(panel.queryByText(/빠르게 다듬어 보세요/)).not.toBeInTheDocument()
    expect(panel.queryByText(/^추천 요청:/)).not.toBeInTheDocument()
    // 무엇을 시킬 수 있는지는 칩만 남아 말한다.
    expect(panel.getByText('제목·본문 편집')).toBeInTheDocument()
  })
})

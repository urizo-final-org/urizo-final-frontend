import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import CmsAiAssistant from './CmsAiAssistant'
import type { NaturalCmsApi, NaturalCmsJob } from './api'

it.each([['menus', 'MENU'], ['contents', 'CONTENT'], ['templates', 'TEMPLATE'], ['boards', 'BOARD']] as const)(
  '%s shows immediate activity, stops for approval, and stops after rejection', async (route, type) => {
    let releaseProfile!: (value: string) => void
    let releaseDecision!: (value: NaturalCmsJob) => void
    const pending: NaturalCmsJob = {
      schemaVersion: '1.0', jobId: 'job', traceId: 'trace', profileVersionId: 'profile',
      pipelineAttempt: 1, stateVersion: 2, status: 'WAITING_APPROVAL', requestText: '선택 대상 변경',
      resource: { type, id: '1' }, structuredCommand: null, previewId: 'preview', previewHash: 'hash',
      previewValid: true, approvalDecision: null, approvalFeedback: null, createdAt: '', updatedAt: '',
    }
    const api = {
      activeProfileVersionId: vi.fn(() => new Promise<string>(resolve => { releaseProfile = resolve })),
      createJob: vi.fn().mockResolvedValue(pending), job: vi.fn().mockResolvedValue(pending),
      decide: vi.fn(() => new Promise<NaturalCmsJob>(resolve => { releaseDecision = resolve })),
      records: vi.fn().mockResolvedValue([]),
    }
    const view = render(<CmsAiAssistant route={route} target={{ type, id: '1', label: '선택 대상', fields: {} }}
      candidates={[]} menus={[]} onTarget={vi.fn()} api={api as unknown as NaturalCmsApi}
      collapsed={false} onToggle={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('자연어 요청'), { target: { value: '선택 대상 변경' } })
    fireEvent.click(screen.getByRole('button', { name: '요청 분석하기' }))
    expect(screen.getByText('요청을 분석하고 있습니다…')).toBeInTheDocument()
    expect(view.container.querySelector('[data-busy="true"]')).not.toBeNull()
    expect(api.createJob).not.toHaveBeenCalled()
    await act(async () => releaseProfile('profile'))
    expect(await screen.findByText('승인 대기')).toBeInTheDocument()
    expect(view.container.querySelector('[data-busy="true"]')).toBeNull()
    expect(api.createJob).toHaveBeenCalledExactlyOnceWith({ profileVersionId: 'profile', requestText: '선택 대상 변경', resource: { type, id: '1' } })
    fireEvent.change(screen.getByLabelText('반려 사유'), { target: { value: '다시 작성' } })
    const reject = screen.getByRole('button', { name: '반려' })
    fireEvent.click(reject)
    expect(screen.getByText('요청을 처리하고 있습니다…')).toBeInTheDocument()
    expect(reject).toBeDisabled()
    fireEvent.click(reject)
    expect(api.decide).toHaveBeenCalledTimes(1)
    await act(async () => releaseDecision({ ...pending, status: 'REJECTED', approvalDecision: 'REJECTED' }))
    expect(await screen.findByText('반려됨')).toBeInTheDocument()
    expect(view.container.querySelector('[data-busy="true"]')).toBeNull()
  },
)

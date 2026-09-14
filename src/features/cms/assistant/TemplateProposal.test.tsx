import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CmsAiAssistant from './CmsAiAssistant'
import { templateProposal, TemplateProposalPreview } from './TemplateProposal'
import type { NaturalCmsApi, NaturalCmsJob } from './api'

const images = Array.from({ length: 5 }, (_, index) => ({ url: `/api/site/images/${index + 1}`, title: `사진 ${index + 1}`, description: `설명 ${index + 1}` }))
function job(): NaturalCmsJob {
  const before = { id: 'CLASSIC', layout: 'CLASSIC', primaryColor: '#123456', siteName: 'Site', headerText: '', footerText: '', heroTitle: '기존 문구', heroSubtitle: '', heroButtonLabel: '', heroButtonUrl: '', updatedAt: '2026-09-11T00:00:00Z', heroImages: images, active: true }
  const command = { operation: 'UPDATE', fields: { heroTitle: '새 문구', heroImages: [...images].reverse() } }
  return { schemaVersion: '1.0', jobId: 'job', traceId: 'trace', profileVersionId: 'active-snapshot', pipelineAttempt: 1, stateVersion: 2, status: 'WAITING_APPROVAL', requestText: '사진 순서를 뒤집어 줘', resource: { type: 'TEMPLATE', id: 'CLASSIC' }, structuredCommand: command, previewId: 'preview', previewHash: 'hash', previewValid: true, approvalDecision: null, approvalFeedback: null, createdAt: '', updatedAt: '', preview: { previewId: 'preview', previewHash: 'hash', resource: { type: 'TEMPLATE', id: 'CLASSIC' }, command, before, after: { ...before, ...command.fields } } }
}

describe('saved template proposal', () => {
  it('keeps both highlighted view buttons usable and closes each preview without changing the proposal', () => {
    const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
    const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', '') } },
      close: { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open') } },
    })
    const value = job()
    const saved = JSON.stringify(value)
    try {
      render(<TemplateProposalPreview job={value} />)
      for (const name of ['변경 전 화면 보기', '변경 후 화면 보기']) {
        const button = screen.getByRole('button', { name })
        expect(button).toHaveClass('cms-template-preview-button')
        expect(button).toHaveAttribute('type', 'button')
        fireEvent.click(button)
        const dialog = screen.getByRole('dialog', { name: 'CLASSIC 템플릿 미리보기' })
        fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      }
      expect(JSON.stringify(value)).toBe(saved)
    } finally {
      if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow)
      else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
      if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose)
      else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
    }
  })
  it('uses saved before/after and preserves all five captions in order', () => {
    const proposal = templateProposal(job())!
    expect(proposal.before.heroImages).toEqual(images)
    expect(proposal.after.heroImages).toEqual([...images].reverse())
    render(<TemplateProposalPreview job={job()} />)
    expect(screen.getByText('기존 문구')).toBeInTheDocument()
    expect(screen.getByText('새 문구')).toBeInTheDocument()
    expect(screen.getAllByRole('img')).toHaveLength(10)
  })
  it.each(['missing', 'hash', 'resource', 'command', 'after', 'invalid'])('blocks %s preview', (kind) => {
    const value = job()
    const preview = value.preview as Record<string, unknown>
    if (kind === 'missing') value.preview = null
    if (kind === 'hash') preview.previewHash = 'other'
    if (kind === 'resource') preview.resource = { type: 'TEMPLATE', id: 'BOLD' }
    if (kind === 'command') preview.command = { operation: 'DELETE', fields: {} }
    if (kind === 'after') preview.after = { ...(preview.after as object), siteName: 'unapproved' }
    if (kind === 'invalid') value.previewValid = false
    expect(templateProposal(value)).toBeNull()
  })
  it('creates with the active profile and selected key, then prevents approval after selection changes', async () => {
    const pending = job()
    const api = { activeProfileVersionId: vi.fn().mockResolvedValue('active-snapshot'), createJob: vi.fn().mockResolvedValue(pending), job: vi.fn().mockResolvedValue(pending), decide: vi.fn().mockResolvedValue({ ...pending, status: 'COMPLETED' }) }
    const target = { type: 'TEMPLATE' as const, id: 'CLASSIC', label: '템플릿 1', fields: {} }
    const props = { route: 'templates' as const, target, candidates: [], menus: [], onTarget: vi.fn(), api: api as unknown as NaturalCmsApi, collapsed: false, onToggle: vi.fn(), templateContext: { target, blockedReason: null, menus: [] } }
    const view = render(<CmsAiAssistant {...props} />)
    fireEvent.change(screen.getByLabelText('자연어 요청'), { target: { value: '사진 순서를 뒤집어 줘' } })
    fireEvent.click(screen.getByRole('button', { name: '요청 분석하기' }))
    await screen.findByRole('button', { name: '승인하고 반영' })
    expect(api.createJob).toHaveBeenCalledWith({ profileVersionId: 'active-snapshot', requestText: '사진 순서를 뒤집어 줘', resource: { type: 'TEMPLATE', id: 'CLASSIC' } })
    expect(api.decide).not.toHaveBeenCalled()
    view.rerender(<CmsAiAssistant {...props} target={{ ...target, id: 'BOLD' }} />)
    expect(screen.getByRole('button', { name: '승인하고 반영' })).toBeDisabled()
    view.rerender(<CmsAiAssistant {...props} templateContext={{ ...props.templateContext, blockedReason: '저장 필요' }} />)
    expect(screen.getByRole('button', { name: '승인하고 반영' })).toBeDisabled()
    view.rerender(<CmsAiAssistant {...props} />)
    api.job.mockResolvedValue({ ...pending, status: 'COMPLETED' })
    fireEvent.click(screen.getByRole('button', { name: '승인하고 반영' }))
    fireEvent.click(screen.getByRole('button', { name: '승인하고 반영' }))
    await waitFor(() => expect(api.decide).toHaveBeenCalledTimes(1))
    expect(api.decide).toHaveBeenCalledWith('job', { previewId: 'preview', previewHash: 'hash', decision: 'APPROVED' })
  })
  it('finishes five uploads before creating a job and ignores a concurrent attachment gesture', async () => {
    let release!: (image: { id: number }) => void
    const first = new Promise<{ id: number }>((resolve) => { release = resolve })
    const upload = vi.fn().mockReturnValueOnce(first)
    for (let id = 2; id <= 5; id++) upload.mockResolvedValueOnce({ id })
    const api = { activeProfileVersionId: vi.fn().mockResolvedValue('active-snapshot'), createJob: vi.fn().mockResolvedValue(job()), job: vi.fn().mockResolvedValue(job()) }
    const target = { type: 'TEMPLATE' as const, id: 'CLASSIC', label: '템플릿 1', fields: {} }
    const view = render(<CmsAiAssistant route="templates" target={target} candidates={[]} menus={[]} onTarget={vi.fn()} api={api as unknown as NaturalCmsApi}
      collapsed={false} onToggle={vi.fn()} onUploadImage={upload} templateContext={{ target, blockedReason: null, menus: [] }} />)
    const files = Array.from({ length: 5 }, (_, i) => new File(['image'], `${i}.png`, { type: 'image/png' }))
    const input = view.container.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files } })
    fireEvent.change(input, { target: { files: [files[0]] } })
    fireEvent.change(screen.getByLabelText('자연어 요청'), { target: { value: '첨부한 다섯 사진으로 바꿔 줘' } })
    expect(screen.getByRole('button', { name: '요청 분석하기' })).toBeDisabled()
    expect(api.createJob).not.toHaveBeenCalled()
    release({ id: 1 })
    await waitFor(() => expect(screen.getByRole('button', { name: '요청 분석하기' })).toBeEnabled())
    expect(upload).toHaveBeenCalledTimes(5)
    fireEvent.click(screen.getByRole('button', { name: '요청 분석하기' }))
    await waitFor(() => expect(api.createJob).toHaveBeenCalledOnce())
    expect(api.createJob.mock.calls[0][0].requestText).toBe('첨부한 다섯 사진으로 바꿔 줘\n\n[이 요청에 첨부한 사진 주소: /api/site/images/1, /api/site/images/2, /api/site/images/3, /api/site/images/4, /api/site/images/5]')
  })
})

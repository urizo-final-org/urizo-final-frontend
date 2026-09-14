import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import CmsAiAssistant, { type CmsAssistantTarget } from './CmsAiAssistant'
import type { NaturalCmsApi, NaturalCmsJob } from './api'

it.each([
  ['menus', 'MENU', '3', 'DELETE', '삭제'],
  ['contents', 'CONTENT', '7', 'DELETE', '삭제'],
  ['boards', 'BOARD', '4', 'DELETE', '삭제'],
  ['boards', 'BOARD', 'board:4:post:12', 'DELETE', '삭제'],
  ['templates', 'TEMPLATE', '3', 'UPDATE', '수정'],
] as const)('%s %s:%s shows the server guardrail reason without allowing approval', async (
  route, type, id, operation, label,
) => {
  const target: CmsAssistantTarget = { type, id, label: '선택 대상', fields: {} }
  const rejected: NaturalCmsJob = {
    schemaVersion: '1.0', jobId: 'test-job', traceId: 'test-trace', profileVersionId: 'test-profile',
    pipelineAttempt: 1, stateVersion: 1, status: 'REJECTED', requestText: '선택 대상 변경',
    resource: { type, id }, structuredCommand: null, previewId: null, previewHash: null,
    previewValid: false, approvalDecision: null, approvalFeedback: null,
    createdAt: '2026-09-13T00:00:00Z', updatedAt: '2026-09-13T00:00:00Z',
  }
  const client = {
    activeProfileVersionId: vi.fn().mockResolvedValue('test-profile'),
    createJob: vi.fn().mockResolvedValue({ ...rejected, status: 'ACTIVE' }),
    job: vi.fn().mockResolvedValue(rejected),
    refusal: vi.fn().mockResolvedValue({
      code: 'CMS_OPERATION_NOT_ALLOWED', reason: '모델의 임의 문구', operations: [operation],
    }),
    decide: vi.fn(),
    records: vi.fn().mockResolvedValue([]),
  }
  render(<CmsAiAssistant route={route} target={target} candidates={[]} menus={[]}
    onTarget={vi.fn()} api={client as unknown as NaturalCmsApi}
    collapsed={false} onToggle={vi.fn()} />)
  fireEvent.change(screen.getByRole('textbox', { name: '자연어 요청' }), {
    target: { value: `선택 대상을 ${label}해 줘` },
  })
  fireEvent.click(screen.getByRole('button', { name: '요청 분석하기' }))
  expect(await screen.findByText(new RegExp(`가드레일 설정에 의해 ${label}`))).toBeInTheDocument()
  expect(client.createJob).toHaveBeenCalledWith(expect.objectContaining({ resource: { type, id } }))
  expect(client.refusal).toHaveBeenCalledWith('test-job')
  expect(client.decide).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: '승인하고 반영' })).not.toBeInTheDocument()
})

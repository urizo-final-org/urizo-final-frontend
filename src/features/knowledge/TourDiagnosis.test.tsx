import { render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { KnowledgeAdminApi } from './admin-api'
import type { KnowledgeVersion, TourDiagnosis } from './admin-types'
import { TourDiagnosisPanel } from './TourDiagnosis'

const version = {
  knowledgeVersionId: 'kv-10', knowledgeBaseId: 'kb-1', connectorVersionId: 'cv-1',
  versionNumber: 10, status: 'APPROVAL_PENDING', documentCount: 500, chunkCount: 500,
  createdAt: '2026-09-14T03:00:00.000Z',
} as unknown as KnowledgeVersion

const diagnosis: TourDiagnosis = {
  knowledgeVersionId: 'kv-10',
  steps: [
    { order: 1, tool: 'version_overview', reason: '버전 규모부터 본다', failed: false },
    { order: 2, tool: 'score_questions', reason: '실패 문항을 확보한다', failed: false },
  ],
  verdict: {
    verdict: '축제 문서의 설명이 비어 검색이 제목만으로 맞히고 있습니다',
    evidence: ['설명 채움 122/500', '실패 16문항 중 13건이 축제'],
    reasoning: '본문이 짧아 임베딩이 제목에 쏠린다',
    recommendation: '상세 설명 필드를 함께 수집하세요',
    confidence: 'HIGH',
  },
  stopReason: 'MODEL_CONCLUDED',
  promptVersion: 'v1',
  checkedAt: '2026-09-14T03:01:00.000Z',
}

/**
 * 서버는 조사를 마친 뒤 한 번에 돌려준다. 화면이 단계를 한 칸씩 풀어 놓고 마지막에
 * 진단을 세우는지 — 이 순서가 깨지면 30초 정적 뒤 완성 화면이 튀어나온다.
 */
test('steps are revealed in order and the verdict lands last', async () => {
  const api = { diagnoseTourVersion: vi.fn().mockResolvedValue(diagnosis) } as unknown as KnowledgeAdminApi

  render(<TourDiagnosisPanel api={api} knowledgeBaseId="kb-1" version={version} onClose={() => {}} />)

  expect(await screen.findByText(/에이전트가 조사하는 중입니다/)).toBeInTheDocument()
  expect(await screen.findByText(/버전 규모부터 본다/)).toBeInTheDocument()
  expect(screen.queryByText(diagnosis.verdict.verdict)).not.toBeInTheDocument()

  await waitFor(() => expect(screen.getByText(diagnosis.verdict.verdict)).toBeInTheDocument(),
    { timeout: 4000 })
  expect(screen.getByText(/조사 2단계/)).toBeInTheDocument()
  expect(screen.getByText(/에이전트가 스스로 종료/)).toBeInTheDocument()
  expect(api.diagnoseTourVersion).toHaveBeenCalledWith('kb-1', 'kv-10')
})

// 로컬 통로가 없는 환경에서는 404가 온다. 빈 칸이 아니라 이유가 보여야 한다.
test('a failed call shows the reason instead of an empty panel', async () => {
  const api = {
    diagnoseTourVersion: vi.fn().mockRejectedValue(new Error('boom')),
  } as unknown as KnowledgeAdminApi

  render(<TourDiagnosisPanel api={api} knowledgeBaseId="kb-1" version={version} onClose={() => {}} />)

  await waitFor(() => expect(screen.queryByText(/조사하는 중입니다/)).not.toBeInTheDocument())
  expect(screen.getByText(/품질 진단/)).toBeInTheDocument()
})

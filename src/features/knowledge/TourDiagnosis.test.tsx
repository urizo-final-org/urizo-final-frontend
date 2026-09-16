import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { KnowledgeAdminApi } from './admin-api'
import type { KnowledgeVersion, TourDiagnosis } from './admin-types'
import { TourDiagnosisPanel } from './TourDiagnosis'

const version = {
  knowledgeVersionId: 'kv-10', knowledgeBaseId: 'kb-1', connectorVersionId: 'cv-1',
  versionNumber: 10, status: 'APPROVAL_PENDING', documentCount: 500, chunkCount: 500,
  createdAt: '2026-09-14T03:00:00.000Z',
  evaluation: {
    method: 'GOLDEN_QUESTION', sampleSize: 50, hit5: 0.68, hit10: 0.74, mrr10: 0.6123,
    setVersion: 1,
  },
} as unknown as KnowledgeVersion

const diagnosis: TourDiagnosis = {
  knowledgeVersionId: 'kv-10',
  steps: [
    { order: 1, tool: 'version_overview', reason: '버전 규모부터 봅니다', failed: false },
    { order: 2, tool: 'score_questions', reason: '실패 문항을 확보합니다', failed: false },
  ],
  verdict: {
    verdict: '축제 문서의 설명이 비어 검색이 제목만으로 맞히고 있습니다',
    evidence: ['설명 채움 122/500', '실패 16문항 중 13건이 축제'],
    reasoning: '본문이 짧아 임베딩이 제목에 쏠립니다',
    recommendation: '상세 설명 필드를 함께 수집하세요',
    confidence: 'HIGH',
  },
  stopReason: 'MODEL_CONCLUDED',
  promptVersion: 'v1',
  checkedAt: '2026-09-14T03:01:00.000Z',
}

function open() {
  const api = { diagnoseTourVersion: vi.fn().mockResolvedValue(diagnosis) } as unknown as KnowledgeAdminApi
  render(<TourDiagnosisPanel api={api} knowledgeBaseId="kb-1" version={version} onClose={() => {}} />)
  return api
}

const settled = () => waitFor(
  () => expect(screen.getByText(diagnosis.verdict.verdict)).toBeInTheDocument(),
  { timeout: 4000 },
)

/**
 * 서버는 조사를 마친 뒤 한 번에 돌려줍니다. 화면이 단계를 한 칸씩 풀어 놓고 마지막에
 * 진단을 세우는지 — 이 순서가 깨지면 30초 정적 뒤 완성 화면이 튀어나옵니다.
 */
test('steps are revealed in order and the verdict lands last', async () => {
  const api = open()

  expect(await screen.findByText(/에이전트가 조사하는 중입니다/)).toBeInTheDocument()
  expect(await screen.findByText(/버전 규모부터 봅니다/)).toBeInTheDocument()
  expect(screen.queryByText(diagnosis.verdict.verdict)).not.toBeInTheDocument()

  await settled()
  expect(screen.getByText(/에이전트가 스스로 마쳤습니다/)).toBeInTheDocument()
  expect(api.diagnoseTourVersion).toHaveBeenCalledWith('kb-1', 'kv-10')
})

/**
 * 끝난 조사는 접힙니다. 단계 제목은 남고 이유는 「자세히」 뒤로 갑니다 — 진단이
 * 화면의 주인이 되려면 조사 기록이 세로를 다 먹으면 안 됩니다.
 */
test('finished steps collapse to titles and reopen on demand', async () => {
  open()
  await settled()

  expect(screen.getByText('버전 정보 확인')).toBeInTheDocument()
  expect(screen.queryByText(/버전 규모부터 봅니다/)).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '자세히' }))
  expect(screen.getByText(/버전 규모부터 봅니다/)).toBeInTheDocument()
})

/** 지표는 접어 두고, 펼치면 버전이 실제로 받은 값을 보입니다 — 만들어 내지 않습니다. */
test('evaluation metrics stay folded until asked for', async () => {
  open()
  await settled()

  expect(screen.getByText(/품질 평가 68%/)).toBeInTheDocument()
  expect(screen.queryByText('Hit@5')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '상세보기' }))
  expect(screen.getByText('Hit@5')).toBeInTheDocument()
  expect(screen.getByText('68.0%')).toBeInTheDocument()
  expect(screen.getByText('74.0%')).toBeInTheDocument()
  expect(screen.getByText('0.612')).toBeInTheDocument()
  expect(screen.getByText(/문항 50개로 잰 값입니다/)).toBeInTheDocument()
})

// 로컬 통로가 없는 환경에서는 404가 옵니다. 빈 칸이 아니라 이유가 보여야 합니다.
test('a failed call shows the reason instead of an empty panel', async () => {
  const api = {
    diagnoseTourVersion: vi.fn().mockRejectedValue(new Error('boom')),
  } as unknown as KnowledgeAdminApi

  render(<TourDiagnosisPanel api={api} knowledgeBaseId="kb-1" version={version} onClose={() => {}} />)

  await waitFor(() => expect(screen.queryByText(/조사하는 중입니다/)).not.toBeInTheDocument())
  expect(screen.getByText(/품질 진단/)).toBeInTheDocument()
})

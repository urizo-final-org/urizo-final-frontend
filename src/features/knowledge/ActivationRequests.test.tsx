import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { expect, test, vi } from 'vitest'
import { ActivationRequests } from './ActivationRequests'
import type { KnowledgeAdminApi } from './admin-api'
import type { ActivationRequest, KnowledgeVersion } from './admin-types'

function version(overrides: Partial<KnowledgeVersion> = {}): KnowledgeVersion {
  return {
    knowledgeVersionId: `kv-${overrides.versionNumber ?? 9}`, knowledgeBaseId: 'kb-1',
    connectorVersionId: 'cv-1', versionNumber: 9, status: 'APPROVAL_PENDING',
    documentCount: 500, chunkCount: 500, createdAt: '2026-09-07T03:00:00.000Z', ...overrides,
  }
}

function request(overrides: Partial<ActivationRequest> = {}): ActivationRequest {
  return {
    requestId: 'r-1', knowledgeBaseId: 'kb-1', knowledgeVersionId: null, reason: '8월 자료가 비어 있습니다.',
    status: 'OPEN', requestedBy: 'u-2', requestedByName: '일반 관리자',
    createdAt: '2026-09-07T04:00:00.000Z', ...overrides,
  }
}

function api(overrides: Partial<Record<keyof KnowledgeAdminApi, unknown>> = {}) {
  return {
    listActivationRequests: vi.fn().mockResolvedValue({ items: [] }),
    createActivationRequest: vi.fn().mockResolvedValue(request()),
    ...overrides,
  } as unknown as KnowledgeAdminApi
}

function show(calls: KnowledgeAdminApi, props: Partial<Parameters<typeof ActivationRequests>[0]> = {}) {
  return render(<ActivationRequests
    api={calls}
    knowledgeBaseId="kb-1"
    mayWrite={false}
    versions={[version()]}
    refreshKey={0}
    {...props}
  />)
}

test('a general admin gets a request form where the tooltip used to dead-end', async () => {
  show(api())
  expect(await screen.findByRole('button', { name: '갱신 요청' })).toBeEnabled()
})

/** 쓰기가 되는 사람에게 자기 자신에게 보내는 요청 폼을 주지 않는다. 목록만 본다. */
test('a super admin sees the list without a form', async () => {
  show(api({ listActivationRequests: vi.fn().mockResolvedValue({ items: [request()] }) }), { mayWrite: true })
  expect(await screen.findByText('일반 관리자')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '갱신 요청' })).not.toBeInTheDocument()
})

/** 대상 버전은 선택이다. 기본값은 "새로 만들어 주세요" — 아직 대상 버전이 없는 경우다. */
test('an unspecified target sends no version id', async () => {
  const calls = api()
  show(calls)
  fireEvent.change(await screen.findByPlaceholderText(/8월 관광지/), { target: { value: '자료가 낡았습니다.' } })
  fireEvent.click(screen.getByRole('button', { name: '갱신 요청' }))
  await waitFor(() => expect(calls.createActivationRequest).toHaveBeenCalledWith('kb-1', {
    knowledgeVersionId: undefined, reason: '자료가 낡았습니다.',
  }))
})

test('choosing a pending version asks for that version', async () => {
  const calls = api()
  show(calls)
  fireEvent.change(await screen.findByLabelText('요청 대상'), { target: { value: 'kv-9' } })
  fireEvent.click(screen.getByRole('button', { name: '갱신 요청' }))
  await waitFor(() => expect(calls.createActivationRequest).toHaveBeenCalledWith('kb-1', {
    knowledgeVersionId: 'kv-9', reason: undefined,
  }))
})

/**
 * 눌렀는데 아무 일도 안 일어난 것처럼 보이면 사람은 다시 누른다. 방금 남긴 요청이 목록에
 * 보이는 것이 전달됐다는 유일한 증거다.
 */
test('a sent request comes back in the list', async () => {
  const listing = vi.fn()
    .mockResolvedValueOnce({ items: [] })
    .mockResolvedValue({ items: [request()] })
  show(api({ listActivationRequests: listing }))
  expect(await screen.findByText('열린 요청이 없습니다.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '갱신 요청' }))
  expect(await screen.findByText('일반 관리자')).toBeInTheDocument()
  expect(screen.getByText('새 빌드 요청')).toBeInTheDocument()
})

/**
 * 활성화·롤백이 곧 처리다. 서버가 그때 닫으므로 프론트가 할 일은 다시 읽는 것뿐이다 —
 * 처리 완료 버튼은 만들지 않는다.
 */
test('a resolved request disappears when the panel bumps the refresh key', async () => {
  const listing = vi.fn()
    .mockResolvedValueOnce({ items: [request()] })
    .mockResolvedValue({ items: [] })
  const { rerender } = show(api({ listActivationRequests: listing }))
  expect(await screen.findByText('일반 관리자')).toBeInTheDocument()
  rerender(<ActivationRequests
    api={api({ listActivationRequests: listing })}
    knowledgeBaseId="kb-1" mayWrite versions={[version()]} refreshKey={1}
  />)
  expect(await screen.findByText('열린 요청이 없습니다.')).toBeInTheDocument()
})

/**
 * PR #55 리뷰 1 — 지식 베이스를 바꾸면 이전 베이스에서 고른 버전 UUID가 상태에 남았다.
 * select는 일치 옵션이 없어 "대상 버전 없음"으로 보이는데 전송값은 그 UUID라, 보이는 것과
 * 보내는 것이 갈라졌다. 서버가 404로 막긴 하지만 사용자는 영문 모를 오류를 받는다.
 */
test('switching the knowledge base drops the previously chosen target', async () => {
  const calls = api()
  const { rerender } = show(calls)
  fireEvent.change(await screen.findByLabelText('요청 대상'), { target: { value: 'kv-9' } })
  rerender(<ActivationRequests
    api={calls}
    knowledgeBaseId="kb-2"
    mayWrite={false}
    versions={[version({ knowledgeVersionId: 'kv-20', knowledgeBaseId: 'kb-2', versionNumber: 20 })]}
    refreshKey={0}
  />)
  fireEvent.click(await screen.findByRole('button', { name: '갱신 요청' }))
  await waitFor(() => expect(calls.createActivationRequest).toHaveBeenCalledWith('kb-2', {
    knowledgeVersionId: undefined, reason: undefined,
  }))
})

/** 요청 목록 하나가 실패해도 RAG 화면 전체가 오류로 덮이면 안 된다. */
test('a failing list leaves the panel standing', async () => {
  show(api({ listActivationRequests: vi.fn().mockRejectedValue(new Error('down')) }))
  expect(await screen.findByRole('button', { name: '갱신 요청' })).toBeInTheDocument()
})

/** AI02-005 함정 3 — 정리에서 alive를 false로만 두면 두 번째 마운트가 영원히 막힌다. */
test('it still loads under StrictMode double mounting', async () => {
  render(<StrictMode>
    <ActivationRequests
      api={api({ listActivationRequests: vi.fn().mockResolvedValue({ items: [request()] }) })}
      knowledgeBaseId="kb-1" mayWrite versions={[version()]} refreshKey={0}
    />
  </StrictMode>)
  expect(await screen.findByText('일반 관리자')).toBeInTheDocument()
})

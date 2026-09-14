import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => window.localStorage.removeItem('axms-portal-project:sme'))
import type { KnowledgeAdminApi } from './admin-api'
import { CustomerOnboarding } from './CustomerOnboarding'

function renderPanel(api: KnowledgeAdminApi, role: 'SUPER_ADMIN' | 'GENERAL_ADMIN', onCreated = vi.fn()) {
  const view = render(<MemoryRouter><CustomerOnboarding api={api} role={role} onCreated={onCreated} /></MemoryRouter>)
  return { ...view, onCreated }
}

function apiWith(overrides: Partial<Record<'createProject' | 'createKnowledgeBase' | 'createChatbot', ReturnType<typeof vi.fn>>> = {}) {
  return {
    createProject: overrides.createProject
      ?? vi.fn().mockResolvedValue({ projectId: 'p-1', name: '중기부 지원사업', status: 'ACTIVE' }),
    createKnowledgeBase: overrides.createKnowledgeBase
      ?? vi.fn().mockResolvedValue({ knowledgeBaseId: 'kb-1', projectId: 'p-1', name: '중기부 지원사업' }),
    createChatbot: overrides.createChatbot
      ?? vi.fn().mockResolvedValue({ chatbotId: 'cb-1' }),
  } as unknown as KnowledgeAdminApi & Record<string, ReturnType<typeof vi.fn>>
}

function openAndSubmit(name = '중기부 지원사업') {
  fireEvent.click(screen.getByRole('button', { name: /새 고객사 등록/ }))
  fireEvent.change(screen.getByLabelText(/고객사 이름/), { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: '고객사 등록' }))
}

test('creates project, knowledge base and chatbot as one action', async () => {
  const api = apiWith()
  const { onCreated } = renderPanel(api, 'SUPER_ADMIN')
  openAndSubmit()

  await waitFor(() => expect(screen.getByTestId('onboarding-done')).toBeInTheDocument())
  expect(api.createProject).toHaveBeenCalledWith('중기부 지원사업', undefined)
  expect(api.createKnowledgeBase).toHaveBeenCalledWith('p-1', '중기부 지원사업')
  expect(api.createChatbot).toHaveBeenCalledWith('p-1', '중기부 지원사업 챗봇', 'kb-1')
  expect(onCreated).toHaveBeenCalledTimes(1)
  expect(screen.getByText(/프로젝트 p-1/)).toBeInTheDocument()
  // 고객사가 2건 이상이면 관리 패널이 자동 선택을 멈추므로, 링크가 대상을 싣고 가야 한다.
  expect(screen.getByRole('link', { name: /커넥터/ }))
    .toHaveAttribute('href', '/admin/rag?projectId=p-1&knowledgeBaseId=kb-1')
})

// 라이브 촬영의 핵심: 등록 직후 같은 브라우저의 /sme가 새 프로젝트를 바로 쓴다.
test('records the portal binding and offers a deep link when a slug is chosen', async () => {
  renderPanel(apiWith(), 'SUPER_ADMIN')
  fireEvent.click(screen.getByRole('button', { name: /새 고객사 등록/ }))
  fireEvent.change(screen.getByLabelText(/고객사 이름/), { target: { value: '중기부 지원사업' } })
  fireEvent.change(screen.getByLabelText(/사용자 포털 경로/), { target: { value: 'sme' } })
  fireEvent.click(screen.getByRole('button', { name: '고객사 등록' }))

  await waitFor(() => expect(screen.getByTestId('onboarding-done')).toBeInTheDocument())
  expect(window.localStorage.getItem('axms-portal-project:sme')).toBe('p-1')
  expect(screen.getByRole('link', { name: /\/sme 열기/ }))
    .toHaveAttribute('href', '/sme?project=p-1')
})

// 중간 실패가 프로젝트만 생긴 고아 상태로 끝나면 사람이 API로 수습해야 한다.
// 재시도는 이미 만들어진 단계를 건너뛰어야 중복 프로젝트를 만들지 않는다.
test('resumes from the failed step instead of recreating the project', async () => {
  const createKnowledgeBase = vi.fn()
    .mockRejectedValueOnce(new Error('down'))
    .mockResolvedValue({ knowledgeBaseId: 'kb-1', projectId: 'p-1', name: '중기부 지원사업' })
  const api = apiWith({ createKnowledgeBase })
  const { onCreated } = renderPanel(api, 'SUPER_ADMIN')
  openAndSubmit()

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('지식베이스 생성 실패'))
  expect(onCreated).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: '이어서 재시도' }))
  await waitFor(() => expect(screen.getByTestId('onboarding-done')).toBeInTheDocument())
  expect(api.createProject).toHaveBeenCalledTimes(1)
  expect(createKnowledgeBase).toHaveBeenCalledTimes(2)
  expect(onCreated).toHaveBeenCalledTimes(1)
})

// 생성 계약 셋은 전부 SUPER_ADMIN 전용이다 — 권한 없는 화면에는 버튼도 그리지 않는다.
test('renders nothing for a general administrator', () => {
  const { container } = renderPanel(apiWith(), 'GENERAL_ADMIN')
  expect(container).toBeEmptyDOMElement()
})

import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { OpsRouteId } from '../../app/routes'
import OpsWorkspace from './OpsWorkspace'

afterEach(() => vi.unstubAllGlobals())

/** Static mockups, so a render plus its heading is the whole contract worth pinning. */
const screens: [OpsRouteId, string][] = [
  ['home', '안녕하세요, 일반 관리자님'],
  ['agents', 'Agent 관리'],
  ['models', '모델 및 Provider 관리'],
  ['rag', 'RAG 관리'],
  ['devops', 'LLM DevOps'],
  ['approvals', '승인 관리'],
  ['runs', '실행 이력'],
  ['settings', '설정'],
  ['system-settings', '시스템 설정'],
  ['sites', '사이트 관리'],
]

test.each(screens)('the %s mockup renders its heading', (route, heading) => {
  render(<OpsWorkspace route={route} actorName="일반 관리자" roleLabel="일반관리자" />)
  expect(screen.getByRole('heading', { name: heading, level: 1 })).toBeInTheDocument()
})

test('every mockup says its data is not real', () => {
  for (const [route] of screens) {
    const view = render(<OpsWorkspace route={route} actorName="일반 관리자" roleLabel="일반관리자" />)
    expect(view.container.textContent).toMatch(/데모|Mock|목업/)
    view.unmount()
  }
})

test('the home mockup greets the signed-in operator, not a fixed name', () => {
  render(<OpsWorkspace route="home" actorName="최고 관리자" roleLabel="최고관리자" />)
  expect(screen.getByRole('heading', { name: '안녕하세요, 최고 관리자님', level: 1 })).toBeInTheDocument()
})

test('system settings has exactly two local tabs and keeps central Guardrails distinct', () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  render(<OpsWorkspace route="system-settings" actorName="최고 관리자" roleLabel="최고관리자" />)

  const tabs = within(screen.getByRole('tablist', { name: '시스템 설정 영역' })).getAllByRole('tab')
  expect(tabs).toHaveLength(2)
  expect(tabs.map((tab) => tab.textContent)).toEqual(['CMS 기본 설정', 'Guardrail Profile'])
  expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1])
  fireEvent.change(screen.getByLabelText('CMS 기본 사이트명'), { target: { value: '관광 CMS' } })
  expect(screen.getByLabelText('CMS 기본 사이트명')).toHaveValue('관광 CMS')

  fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
  expect(tabs[1]).toHaveFocus()
  expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText(/Agent 설정의 로컬 최소 Guardrail 토글과는 별개/)).toBeInTheDocument()
  expect(screen.getByLabelText('잠금 Guardrail Secret 노출 차단')).toBeDisabled()
  expect(screen.getByLabelText('잠금 Guardrail 작업 경로 제한')).toBeDisabled()
  expect(screen.getByLabelText('잠금 Guardrail Agent별 Tool Allowlist')).toBeDisabled()
  expect(screen.getByLabelText('잠금 Guardrail Prompt·Source·Diff 원문 전송 차단')).toBeChecked()
  fireEvent.change(screen.getByLabelText('중앙 Guardrail 허용 작업 경로'), { target: { value: 'src/features/**' } })
  expect(screen.getByLabelText('중앙 Guardrail 허용 작업 경로')).toHaveValue('src/features/**')
  fireEvent.click(screen.getByRole('tab', { name: 'CMS 기본 설정' }))
  expect(screen.getByLabelText('CMS 기본 사이트명')).toHaveValue('관광 CMS')
  expect(fetcher).not.toHaveBeenCalled()
})

test('site management edits the single user site only in local state', () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  render(<OpsWorkspace route="sites" actorName="최고 관리자" roleLabel="최고관리자" />)

  expect(screen.getByText(/실제 사용자 사이트나 CMS 저장 API에 반영되지 않습니다/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '기본 사용자 사이트 선택' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.change(screen.getByLabelText('관리 사이트명'), { target: { value: '관광 안내 사이트' } })
  expect(screen.getByRole('button', { name: '기본 사용자 사이트 선택' })).toHaveTextContent('관광 안내 사이트')
  expect(screen.getByText(/추가·삭제·Version·실제 게시 기능은 포함하지 않습니다/)).toBeInTheDocument()
  expect(fetcher).not.toHaveBeenCalled()
})

test('the existing general settings tabs remain separate from system settings', () => {
  render(<OpsWorkspace route="settings" actorName="일반 관리자" roleLabel="일반관리자" />)

  const tabs = within(screen.getByLabelText('일반 설정 탭')).getAllByRole('button')
  expect(tabs.map((tab) => tab.textContent)).toEqual(['일반', '권한', 'API Key', '알림'])
})

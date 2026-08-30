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

test('system settings keeps two labelled placeholders and removes editable policy controls', () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  render(<OpsWorkspace route="system-settings" actorName="최고 관리자" roleLabel="최고관리자" />)

  const tabs = within(screen.getByRole('tablist', { name: '시스템 설정 영역' })).getAllByRole('tab')
  expect(tabs).toHaveLength(2)
  expect(tabs[0]).toHaveTextContent('CMS 기본 설정')
  expect(tabs[0]).toHaveTextContent('임시')
  expect(tabs[1]).toHaveTextContent('Guardrail Profile')
  expect(tabs[1]).toHaveTextContent('임시')
  expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1])
  expect(screen.getByText('현재 CMS')).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

  fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
  expect(tabs[1]).toHaveFocus()
  expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText(/중앙 정책 작성·저장 API는 없습니다/)).toBeInTheDocument()
  expect(screen.getByText('Snapshot 잠금 Guardrail')).toBeInTheDocument()
  expect(screen.getByText('중앙 정책 UI·저장 API')).toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(fetcher).not.toHaveBeenCalled()
})

test('site management shows the current single-site boundary without fake editing', () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  render(<OpsWorkspace route="sites" actorName="최고 관리자" roleLabel="최고관리자" />)

  expect(screen.getByText(/사용자 사이트 한 곳을 공개 경로/)).toBeInTheDocument()
  expect(screen.getByText('기본 사용자 사이트')).toBeInTheDocument()
  expect(screen.getByText('사이트별 설정 API')).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(fetcher).not.toHaveBeenCalled()
})

test('general settings removes fake organization, key, permission, and alert controls', () => {
  render(<OpsWorkspace route="settings" actorName="일반 관리자" roleLabel="일반관리자" />)

  expect(screen.getByText(/조직·권한 정책·API Key·알림 저장 API가 없어/)).toBeInTheDocument()
  expect(screen.getByText('CMS 로그인·역할')).toBeInTheDocument()
  expect(screen.getByText('API Key·알림 설정')).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test.each([
  ['approvals' as const, /가짜 요청·건수·처리 버튼을 표시하지 않습니다/, '승인 처리·이력 API'],
  ['runs' as const, /가짜 실행 기록, 로딩 수치, CSV 버튼을 표시하지 않습니다/, '이력 조회·통계 API'],
])('%s exposes only current runtime status', (route, notice, missingContract) => {
  render(<OpsWorkspace route={route} actorName="일반 관리자" roleLabel="일반관리자" />)
  expect(screen.getByText(notice)).toBeInTheDocument()
  expect(screen.getByText(missingContract)).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})

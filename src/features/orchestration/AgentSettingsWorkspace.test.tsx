import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import AgentSettingsWorkspace from './AgentSettingsWorkspace'

afterEach(() => vi.unstubAllGlobals())

test('the five Agent settings tabs expose runtime status without fake controls or metrics', () => {
  render(<AgentSettingsWorkspace />)

  expect(screen.getByRole('heading', { name: 'Agent 설정' })).toBeInTheDocument()
  expect(screen.getByText('최고관리자 전용')).toBeInTheDocument()
  expect(screen.getByText(/저장·검증·실행 API는 호출하지 않습니다/)).toBeInTheDocument()

  const tabs = within(screen.getByRole('tablist', { name: 'Agent 설정 영역' })).getAllByRole('tab')
  expect(tabs).toHaveLength(5)
  expect(tabs[2]).toHaveTextContent('자연어 기능 Profile')
  expect(tabs[2]).toHaveTextContent('임시')
  expect(tabs[3]).toHaveTextContent('임시')
  expect(tabs[4]).toHaveTextContent('임시')
  expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1, -1, -1])
  fireEvent.keyDown(tabs[1], { key: 'ArrowRight' })
  expect(tabs[2]).toHaveFocus()
  expect(tabs[2]).toHaveAttribute('aria-selected', 'true')

  fireEvent.click(screen.getByRole('tab', { name: /Tool·실행 정책/ }))
  expect(screen.getByText('Job·Queue·Snapshot')).toBeInTheDocument()
  expect(screen.getByText('Approval·Check·Guardrail')).toBeInTheDocument()
  expect(screen.getByText('MCP Tool 실행')).toBeInTheDocument()
  expect(screen.queryByText('OmniRoute')).not.toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('tab', { name: /사용량·평가/ }))
  expect(screen.getAllByText('API 없음')).toHaveLength(3)
  expect(screen.queryByText(/RAGAS|Langfuse|ToolCallAccuracy|AgentGoalAccuracy/)).not.toBeInTheDocument()
})

test('natural feature profiles show only read-only runtime ownership boundaries', () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  render(<AgentSettingsWorkspace />)

  fireEvent.click(screen.getByRole('tab', { name: /자연어 기능 Profile/ }))
  expect(screen.getByText(/Queue Lane과 Job–Profile Version 바인딩 경계/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'LLM_OPS Profile 선택' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('Profile Version 조회·Job 고정 바인딩 구현')).toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'NATURAL_CMS Profile 선택' }))
  expect(screen.getByText('공통 Profile 계약만 정의 · 기능 연결 전')).toBeInTheDocument()
  expect(screen.getByText(/Model·Tool·업무 규칙은 이 공통 목업에서 저장하지 않습니다/)).toBeInTheDocument()
  expect(fetcher).not.toHaveBeenCalled()
})

test('the Node Palette adds and deletes every supported kind through local state', () => {
  render(<AgentSettingsWorkspace />)
  const palette = screen.getByLabelText('Node Palette')

  for (const kind of ['Start', 'Agent', 'MCP Tool', 'Guardrail', 'Approval', 'Check', 'End']) {
    expect(within(palette).getByRole('button', { name: kind })).toBeInTheDocument()
  }

  fireEvent.click(within(palette).getByRole('button', { name: 'End' }))
  expect(screen.getByLabelText('End 2 Node')).toBeInTheDocument()
  expect(screen.getByLabelText('선택 Node 이름')).toHaveValue('End 2')

  fireEvent.change(screen.getByLabelText('선택 Node 이름'), { target: { value: '배포 종료' } })
  expect(screen.getByLabelText('배포 종료 Node')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Node 삭제' }))
  expect(screen.queryByLabelText('배포 종료 Node')).not.toBeInTheDocument()
  expect(screen.getByText('배포 종료 Node를 삭제했습니다.')).toBeInTheDocument()
})

test('nodes can connect, disconnect, move, and change sequence order', () => {
  render(<AgentSettingsWorkspace />)

  fireEvent.click(screen.getByLabelText('잠금 Guardrail Node'))
  fireEvent.click(screen.getByRole('button', { name: '결과 Check 연결 해제' }))
  expect(screen.getByText('Node 연결을 해제했습니다.')).toBeInTheDocument()

  fireEvent.click(screen.getByLabelText('결과 Check Node'))
  fireEvent.click(screen.getByRole('button', { name: '이 Node에서 연결' }))
  fireEvent.click(screen.getByLabelText('End Node'))
  expect(screen.getByText('결과 Check → End 연결을 추가했습니다.')).toBeInTheDocument()

  const grip = screen.getByRole('button', { name: '잠금 Guardrail Node 이동' })
  fireEvent.pointerDown(grip, { pointerId: 1, clientX: 200, clientY: 48 })
  fireEvent.pointerMove(grip, { pointerId: 1, clientX: 260, clientY: 470 })
  fireEvent.pointerUp(grip, { pointerId: 1, clientX: 260, clientY: 470 })
  expect(screen.getByText('잠금 Guardrail Node 위치와 순서를 변경했습니다.')).toBeInTheDocument()
  expect(within(screen.getByLabelText('잠금 Guardrail Node')).getByText('순서 5')).toBeInTheDocument()
})

test('selected Agent settings update the model and fixed Tool mapping locally', () => {
  render(<AgentSettingsWorkspace />)

  fireEvent.click(within(screen.getByLabelText('Node Palette')).getByRole('button', { name: 'Agent' }))
  fireEvent.change(screen.getByLabelText('선택 Agent Model'), { target: { value: 'Gemini Pro' } })
  expect(screen.getByLabelText('선택 Agent Model')).toHaveValue('Gemini Pro')
  expect(screen.getByLabelText('apply_patch')).not.toBeChecked()
  fireEvent.click(screen.getByLabelText('apply_patch'))
  expect(screen.getByLabelText('apply_patch')).toBeChecked()
})

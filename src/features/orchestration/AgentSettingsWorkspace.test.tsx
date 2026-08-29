import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import AgentSettingsWorkspace from './AgentSettingsWorkspace'

test('the four Agent settings tabs expose only mock and collaboration boundaries', () => {
  render(<AgentSettingsWorkspace />)

  expect(screen.getByRole('heading', { name: 'Agent 설정' })).toBeInTheDocument()
  expect(screen.getByText('최고관리자 전용')).toBeInTheDocument()
  expect(screen.getByText(/저장·검증·실행 API를 호출하지 않습니다/)).toBeInTheDocument()

  for (const tab of ['Provider·Model', 'Agent·Workflow', 'Tool·실행 정책', '사용량·평가']) {
    expect(screen.getByRole('tab', { name: tab })).toBeInTheDocument()
  }

  fireEvent.click(screen.getByRole('tab', { name: 'Tool·실행 정책' }))
  expect(screen.getByRole('checkbox', { name: 'OmniRoute 비활성 목업' })).toBeDisabled()
  expect(screen.getByText('OmniRoute')).toBeInTheDocument()
  expect(screen.getAllByText('향후 적용 예정').length).toBeGreaterThan(0)
  expect(screen.getAllByText(/4번과 협의 필요/).length).toBeGreaterThan(0)
  expect(screen.getByLabelText('apply_patch')).not.toBeChecked()
  fireEvent.click(screen.getByLabelText('apply_patch'))
  expect(screen.getByLabelText('apply_patch')).toBeChecked()

  fireEvent.click(screen.getByRole('tab', { name: '사용량·평가' }))
  expect(screen.getByText('RAGAS 참고 평가')).toBeInTheDocument()
  expect(screen.getByText('Langfuse Monitoring')).toBeInTheDocument()
  expect(screen.getByText('AgentGoalAccuracy')).toBeInTheDocument()
  expect(screen.getByText('ToolCallAccuracy')).toBeInTheDocument()
})

test('the Node Palette adds and deletes every supported kind through local state', () => {
  render(<AgentSettingsWorkspace />)
  const palette = screen.getByLabelText('Node Palette')

  for (const kind of ['Start', 'Agent', 'MCP Tool', 'Approval', 'Check', 'End']) {
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

  fireEvent.click(screen.getByLabelText('요구사항 분석 Node'))
  fireEvent.click(screen.getByRole('button', { name: '코드 작성 연결 해제' }))
  expect(screen.getByText('Node 연결을 해제했습니다.')).toBeInTheDocument()

  fireEvent.click(screen.getByLabelText('코드 리뷰 Node'))
  fireEvent.click(screen.getByRole('button', { name: '이 Node에서 연결' }))
  fireEvent.click(screen.getByLabelText('End Node'))
  expect(screen.getByText('코드 리뷰 → End 연결을 추가했습니다.')).toBeInTheDocument()

  const grip = screen.getByRole('button', { name: '요구사항 분석 Node 이동' })
  fireEvent.pointerDown(grip, { pointerId: 1, clientX: 210, clientY: 48 })
  fireEvent.pointerMove(grip, { pointerId: 1, clientX: 260, clientY: 470 })
  fireEvent.pointerUp(grip, { pointerId: 1, clientX: 260, clientY: 470 })
  expect(screen.getByText('요구사항 분석 Node 위치와 순서를 변경했습니다.')).toBeInTheDocument()
  expect(within(screen.getByLabelText('요구사항 분석 Node')).getByText('순서 8')).toBeInTheDocument()
})

test('selected Agent settings update the model and fixed Tool mapping locally', () => {
  render(<AgentSettingsWorkspace />)

  fireEvent.click(screen.getByLabelText('요구사항 분석 Node'))
  fireEvent.change(screen.getByLabelText('선택 Agent Model'), { target: { value: 'Gemini Pro' } })
  expect(screen.getByLabelText('선택 Agent Model')).toHaveValue('Gemini Pro')
  expect(screen.getByLabelText('apply_patch')).not.toBeChecked()
  fireEvent.click(screen.getByLabelText('apply_patch'))
  expect(screen.getByLabelText('apply_patch')).toBeChecked()
})

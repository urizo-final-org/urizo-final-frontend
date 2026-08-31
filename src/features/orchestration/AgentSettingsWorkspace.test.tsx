import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import AgentSettingsWorkspace from './AgentSettingsWorkspace'
import type { ProfileVersion, ProfileVersionApiClient } from './api'

afterEach(() => vi.unstubAllGlobals())

const activeVersion: ProfileVersion = {
  profileVersionId: 'version-2', profileKey: 'LLM_OPS', profileVersion: 2, status: 'ACTIVE', createdAt: '2026-08-31T00:00:00Z',
  snapshot: {
    contractVersion: '1.0', profileVersionId: 'version-2', profileKey: 'LLM_OPS', profileVersion: 2,
    nodes: [{ id: 'guardrail', type: 'guardrail', config: { locked: true } }], edges: [], config: {}, modelBindings: {}, toolPolicy: {}, guardrailProfileKey: 'central.default',
  },
}

function profileApi(overrides: Partial<ProfileVersionApiClient> = {}): ProfileVersionApiClient {
  return {
    list: vi.fn().mockResolvedValue([activeVersion]),
    create: vi.fn().mockResolvedValue({ ...activeVersion, profileVersionId: 'version-3', profileVersion: 3, status: 'DRAFT' }),
    activate: vi.fn().mockResolvedValue({ ...activeVersion, profileVersionId: 'version-3', profileVersion: 3 }),
    ...overrides,
  }
}

test('the five Agent settings tabs expose runtime status without fake controls or metrics', () => {
  render(<AgentSettingsWorkspace api={profileApi()} />)

  expect(screen.getByRole('heading', { name: 'Agent 설정' })).toBeInTheDocument()
  expect(screen.getByText('최고관리자 전용')).toBeInTheDocument()
  expect(screen.getByText(/자연어 기능 Profile은 실제 API를 사용합니다/)).toBeInTheDocument()

  const tabs = within(screen.getByRole('tablist', { name: 'Agent 설정 영역' })).getAllByRole('tab')
  expect(tabs).toHaveLength(5)
  expect(tabs[2]).toHaveTextContent('자연어 기능 Profile')
  expect(tabs[2]).not.toHaveTextContent('임시')
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

test('natural feature profiles query, create, and explicitly activate immutable versions', async () => {
  const draft = { ...activeVersion, profileVersionId: 'version-3', profileVersion: 3, status: 'DRAFT' as const }
  const activated = { ...draft, status: 'ACTIVE' as const }
  const api = profileApi({
    create: vi.fn().mockResolvedValue(draft),
    activate: vi.fn().mockResolvedValue(activated),
  })
  render(<AgentSettingsWorkspace api={api} />)

  fireEvent.click(screen.getByRole('tab', { name: /자연어 기능 Profile/ }))
  expect(screen.getByRole('button', { name: 'LLM_OPS Profile 선택' })).toHaveAttribute('aria-pressed', 'true')
  await screen.findByRole('button', { name: 'v2 ACTIVE 선택' })
  expect(api.list).toHaveBeenCalledWith('LLM_OPS')
  expect((screen.getByLabelText('Profile Snapshot JSON') as HTMLTextAreaElement).value).toContain('central.default')

  fireEvent.click(screen.getByRole('button', { name: '불변 버전 저장' }))
  await screen.findByText('v3 DRAFT를 저장했습니다.')
  expect(api.create).toHaveBeenCalledWith('LLM_OPS', expect.objectContaining({ guardrailProfileKey: 'central.default' }))

  fireEvent.click(screen.getByRole('button', { name: '선택 DRAFT 활성화' }))
  await screen.findByText('v3을 ACTIVE로 전환했습니다.')
  expect(api.activate).toHaveBeenCalledWith('version-3')

  fireEvent.click(screen.getByRole('button', { name: 'NATURAL_CMS Profile 선택' }))
  await waitFor(() => expect(api.list).toHaveBeenCalledWith('NATURAL_CMS'))
})

test('profile API failures remain visible with their public error code', async () => {
  const api = profileApi({ list: vi.fn().mockRejectedValue(new Error('조회 실패 [FORBIDDEN]')) })
  render(<AgentSettingsWorkspace api={api} />)
  fireEvent.click(screen.getByRole('tab', { name: /자연어 기능 Profile/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('조회 실패 [FORBIDDEN]')
})

test('a Profile with no stored versions can create its first DRAFT from the current starter contract', async () => {
  const first = { ...activeVersion, profileVersionId: 'version-1', profileVersion: 1, status: 'DRAFT' as const }
  const api = profileApi({ list: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue(first) })
  render(<AgentSettingsWorkspace api={api} />)
  fireEvent.click(screen.getByRole('tab', { name: /자연어 기능 Profile/ }))

  expect(await screen.findByText('저장된 Version이 없습니다.')).toBeInTheDocument()
  expect((screen.getByLabelText('Profile Snapshot JSON') as HTMLTextAreaElement).value).toContain('common.guardrail')
  fireEvent.click(screen.getByRole('button', { name: '불변 버전 저장' }))
  await screen.findByText('v1 DRAFT를 저장했습니다.')
  expect(api.create).toHaveBeenCalledWith('LLM_OPS', expect.objectContaining({ guardrailProfileKey: 'central.default' }))
})

test('the Node Palette adds and deletes every supported kind through local state', () => {
  render(<AgentSettingsWorkspace api={profileApi()} />)
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
  render(<AgentSettingsWorkspace api={profileApi()} />)

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
  render(<AgentSettingsWorkspace api={profileApi()} />)

  expect(screen.getByLabelText('선택 Node 유형')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Node 삭제' })).toBeDisabled()
  expect(screen.getByText('Guardrail은 삭제하거나 비활성화할 수 없습니다.')).toBeInTheDocument()

  fireEvent.click(within(screen.getByLabelText('Node Palette')).getByRole('button', { name: 'Agent' }))
  fireEvent.change(screen.getByLabelText('선택 Agent Model'), { target: { value: 'Gemini Pro' } })
  expect(screen.getByLabelText('선택 Agent Model')).toHaveValue('Gemini Pro')
  expect(screen.getByLabelText('apply_patch')).not.toBeChecked()
  fireEvent.click(screen.getByLabelText('apply_patch'))
  expect(screen.getByLabelText('apply_patch')).toBeChecked()
})

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import AgentSettingsWorkspace from './AgentSettingsWorkspace'
import { starterSnapshots } from './WorkflowPanel'
import type { AgentSettingsApiClient, ProfileVersion, ProviderConnectionTestResult } from './api'

afterEach(() => vi.unstubAllGlobals())

const activeVersion: ProfileVersion = {
  profileVersionId: 'version-2', profileKey: 'LLM_OPS', profileVersion: 2, status: 'ACTIVE', createdAt: '2026-08-31T00:00:00Z',
  snapshot: {
    contractVersion: '1.0', profileVersionId: 'version-2', profileKey: 'LLM_OPS', profileVersion: 2,
    ...starterSnapshots.LLM_OPS,
  },
}

function profileApi(overrides: Partial<AgentSettingsApiClient> = {}): AgentSettingsApiClient {
  return {
    list: vi.fn().mockResolvedValue([activeVersion]),
    create: vi.fn().mockResolvedValue({ ...activeVersion, profileVersionId: 'version-3', profileVersion: 3, status: 'DRAFT' }),
    activate: vi.fn().mockResolvedValue({ ...activeVersion, profileVersionId: 'version-3', profileVersion: 3 }),
    listProviderCredentials: vi.fn().mockResolvedValue({
      csrfToken: 'csrf-fixture',
      providers: [
        { provider: 'OPENAI', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
        { provider: 'ANTHROPIC', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
        { provider: 'GOOGLE_GENAI', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
      ],
      checkedAt: '2026-08-31T00:00:00Z',
    }),
    storeProviderCredential: vi.fn(),
    testProviderCredential: vi.fn(),
    deleteProviderCredential: vi.fn(),
    ...overrides,
  }
}

test('the five Agent settings tabs expose runtime status without fake controls or metrics', () => {
  render(<AgentSettingsWorkspace api={profileApi()} />)

  expect(screen.getByRole('heading', { name: 'Agent 설정' })).toBeInTheDocument()
  expect(screen.getByText('최고관리자 전용')).toBeInTheDocument()
  expect(screen.getByText(/Agent·Workflow Profile Version은 실제 API를 사용합니다/)).toBeInTheDocument()

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

test('provider keys can be stored, tested, and deleted without rendering the secret again', async () => {
  const stored = {
    provider: 'OPENAI' as const, configured: true, state: 'STORED' as const, fingerprintSuffix: 'abc123fixture',
    updatedAt: '2026-08-31T00:01:00Z', lastTestedAt: null,
  }
  const api = profileApi({
    listProviderCredentials: vi.fn()
      .mockResolvedValueOnce({
        csrfToken: 'csrf-fixture',
        providers: [
          { provider: 'OPENAI', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
          { provider: 'ANTHROPIC', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
          { provider: 'GOOGLE_GENAI', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
        ],
        checkedAt: '2026-08-31T00:00:00Z',
      })
      .mockResolvedValueOnce({
        csrfToken: 'csrf-fixture',
        providers: [
          { ...stored, state: 'VERIFIED', lastTestedAt: '2026-08-31T00:02:01Z' },
          { provider: 'ANTHROPIC', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
          { provider: 'GOOGLE_GENAI', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
        ],
        checkedAt: '2026-08-31T00:02:00Z',
      }),
    storeProviderCredential: vi.fn().mockResolvedValue(stored),
    testProviderCredential: vi.fn().mockResolvedValue({
      provider: 'OPENAI', modelId: 'fixture-model', state: 'VERIFIED', inferenceExecuted: true,
      inputTokens: 1, outputTokens: 1, latencyMs: 12, testedAt: '2026-08-31T00:02:00Z', safeCode: 'OK',
    }),
    deleteProviderCredential: vi.fn().mockResolvedValue({
      provider: 'OPENAI', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null,
    }),
  })
  vi.stubGlobal('confirm', vi.fn(() => true))
  render(<AgentSettingsWorkspace api={api} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Provider·Model' }))

  await waitFor(() => expect(api.listProviderCredentials).toHaveBeenCalled())
  const secretInput = screen.getByLabelText('OpenAI API Key')
  fireEvent.change(secretInput, { target: { value: 'fixture-credential-value' } })
  fireEvent.click(within(secretInput.closest('article') as HTMLElement).getByRole('button', { name: 'Key 저장' }))

  await screen.findByText(/OpenAI API Key를 암호화 저장했습니다/)
  expect(api.storeProviderCredential).toHaveBeenCalledWith('OPENAI', 'fixture-credential-value', 'csrf-fixture')
  expect(secretInput).toHaveValue('')
  expect(screen.queryByDisplayValue('fixture-credential-value')).not.toBeInTheDocument()
  expect(screen.getByText('...abc123fixture')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '연결 테스트' }))
  await screen.findByText('OpenAI 연결 테스트 결과: 연결 확인 · OK.')
  expect(api.testProviderCredential).toHaveBeenCalledWith('OPENAI', 'csrf-fixture')

  fireEvent.click(screen.getByRole('button', { name: 'Key 삭제' }))
  await screen.findByText('OpenAI API Key를 삭제했습니다.')
  expect(api.deleteProviderCredential).toHaveBeenCalledWith('OPENAI', 'csrf-fixture')
  expect(screen.queryByRole('button', { name: 'Key 삭제' })).not.toBeInTheDocument()
})

test('provider status load failure stays failed and locks credential actions until a successful reload', async () => {
  const api = profileApi({
    listProviderCredentials: vi.fn()
      .mockRejectedValueOnce(new Error('Provider 상태 조회 실패 [PROVIDER_STATUS_UNAVAILABLE]'))
      .mockResolvedValueOnce({
        csrfToken: 'csrf-reloaded',
        providers: [
          { provider: 'OPENAI', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
          { provider: 'ANTHROPIC', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
          { provider: 'GOOGLE_GENAI', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
        ],
        checkedAt: '2026-08-31T00:03:00Z',
      }),
  })

  render(<AgentSettingsWorkspace api={api} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Provider·Model' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Provider 상태 조회 실패 [PROVIDER_STATUS_UNAVAILABLE]')
  expect(screen.getByText('상태 조회 실패')).toBeInTheDocument()
  const providerSection = screen.getByText('Provider Credential').closest('section') as HTMLElement
  expect(within(providerSection).queryByText('실제 API 연결')).not.toBeInTheDocument()
  expect(screen.queryByText('미등록')).not.toBeInTheDocument()
  expect(screen.queryByText('저장된 Key가 없습니다.')).not.toBeInTheDocument()
  for (const input of screen.getAllByLabelText(/API Key$/)) expect(input).toBeDisabled()
  for (const button of screen.getAllByRole('button', { name: 'Key 저장' })) expect(button).toBeDisabled()

  fireEvent.click(screen.getByRole('button', { name: '상태 다시 조회' }))

  await waitFor(() => expect(api.listProviderCredentials).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(within(providerSection).getByText('실제 API 연결')).toBeInTheDocument())
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getAllByText('미등록')).toHaveLength(3)
  for (const input of screen.getAllByLabelText(/API Key$/)) expect(input).toBeEnabled()
})

test('replacing a verified provider key discards the prior verification evidence', async () => {
  const api = profileApi({
    listProviderCredentials: vi.fn().mockResolvedValue({
      csrfToken: 'csrf-fixture',
      providers: [
        {
          provider: 'OPENAI', configured: true, state: 'VERIFIED', fingerprintSuffix: 'old-fixture',
          updatedAt: '2026-08-31T00:01:00Z', lastTestedAt: '2026-08-31T00:02:00Z',
        },
        { provider: 'ANTHROPIC', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
        { provider: 'GOOGLE_GENAI', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
      ],
      checkedAt: '2026-08-31T00:02:00Z',
    }),
    storeProviderCredential: vi.fn().mockResolvedValue({
      provider: 'OPENAI', configured: true, state: 'STORED', fingerprintSuffix: 'new-fixture',
      updatedAt: '2026-08-31T00:03:00Z', lastTestedAt: null,
    }),
  })

  render(<AgentSettingsWorkspace api={api} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Provider·Model' }))

  const secretInput = await screen.findByLabelText('OpenAI API Key')
  expect(await screen.findByText('연결 확인')).toBeInTheDocument()
  expect(screen.getByText(/마지막 테스트/)).toBeInTheDocument()
  fireEvent.change(secretInput, { target: { value: 'replacement-credential' } })
  fireEvent.click(within(secretInput.closest('article') as HTMLElement).getByRole('button', { name: 'Key 교체' }))

  expect(await screen.findByText('저장됨 · 미검증')).toBeInTheDocument()
  expect(screen.queryByText('연결 확인')).not.toBeInTheDocument()
  expect(screen.queryByText(/마지막 테스트/)).not.toBeInTheDocument()
  expect(screen.getByText('...new-fixture')).toBeInTheDocument()
})

test('an obsolete connection test cannot restore verification after the provider key changed', async () => {
  const pendingTest = deferred<ProviderConnectionTestResult>()
  const api = profileApi({
    listProviderCredentials: vi.fn()
      .mockResolvedValueOnce({
        csrfToken: 'csrf-before',
        providers: [
          {
            provider: 'OPENAI', configured: true, state: 'STORED', fingerprintSuffix: 'old-fixture',
            updatedAt: '2026-08-31T00:01:00Z', lastTestedAt: null,
          },
          { provider: 'ANTHROPIC', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
          { provider: 'GOOGLE_GENAI', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
        ],
        checkedAt: '2026-08-31T00:01:00Z',
      })
      .mockResolvedValueOnce({
        csrfToken: 'csrf-after',
        providers: [
          {
            provider: 'OPENAI', configured: true, state: 'VERIFIED', fingerprintSuffix: 'replacement-fixture',
            updatedAt: '2026-08-31T00:03:00Z', lastTestedAt: '2026-08-31T00:03:01Z',
          },
          { provider: 'ANTHROPIC', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
          { provider: 'GOOGLE_GENAI', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
        ],
        checkedAt: '2026-08-31T00:03:00Z',
      }),
    testProviderCredential: vi.fn().mockReturnValue(pendingTest.promise),
  })

  render(<AgentSettingsWorkspace api={api} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Provider·Model' }))
  fireEvent.click(await screen.findByRole('button', { name: '연결 테스트' }))

  await act(async () => pendingTest.resolve({
    provider: 'OPENAI', modelId: 'fixture-model', state: 'VERIFIED', inferenceExecuted: true,
    inputTokens: 1, outputTokens: 1, latencyMs: 12, testedAt: '2026-08-31T00:02:00Z', safeCode: 'OK',
  }))

  await waitFor(() => expect(api.listProviderCredentials).toHaveBeenCalledTimes(2))
  expect(screen.getByText('연결 확인')).toBeInTheDocument()
  expect(screen.queryByText('OpenAI 연결 테스트 결과: 연결 확인 · OK.')).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('OpenAI Key가 변경되어 이전 연결 테스트 결과를 폐기했습니다.')
  expect(screen.getByText(/마지막 테스트/)).toBeInTheDocument()
  expect(screen.getByText('...replacement-fixture')).toBeInTheDocument()
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

test('the Workflow Canvas loads the latest stored Snapshot with exact edges, bindings, and Tool policy', async () => {
  const api = profileApi()
  render(<AgentSettingsWorkspace api={api} />)

  await screen.findByLabelText('analyze Node')
  expect(api.list).toHaveBeenCalledWith('LLM_OPS')
  expect(screen.getByLabelText('저장된 Workflow Version')).toHaveValue('version-2')
  fireEvent.click(screen.getByLabelText('analyze Node'))
  expect(screen.getByLabelText('선택 Handler')).toHaveValue('coding.analyze')
  expect(screen.getByLabelText('선택 Agent Model Binding')).toHaveValue('llm-ops-analyze')
  expect(screen.getByLabelText('허용 Tool apply_patch')).toBeChecked()
  expect(screen.getByRole('button', { name: 'analyze.feasible에서 scope_approval 연결 해제' })).toBeInTheDocument()
})

test('the Workflow Canvas uses a left control dock and one scrollable coordinate system for layered Nodes and lower detours', async () => {
  render(<AgentSettingsWorkspace api={profileApi()} />)

  await screen.findByLabelText('analyze Node')
  const canvas = screen.getByLabelText('Node 편집 Canvas')
  const dock = screen.getByLabelText('Workflow control dock')
  const paletteToggle = screen.getByRole('button', { name: /등록 Handler Palette/ })

  expect(canvas.className).toContain('bg-[#20262e]')
  expect(dock).toHaveTextContent('Node 설정')
  expect(paletteToggle).toHaveAttribute('aria-expanded', 'true')
  expect(paletteToggle).toHaveAttribute('aria-controls', 'handler-palette-panel')
  fireEvent.click(paletteToggle)
  expect(paletteToggle).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(paletteToggle)
  expect(canvas.querySelectorAll('[data-node-port="input"]')).toHaveLength(starterSnapshots.LLM_OPS.nodes.length)
  expect(canvas.querySelectorAll('[data-node-port="output"]')).toHaveLength(starterSnapshots.LLM_OPS.nodes.length)
  expect(canvas.querySelector('[data-edge-route="direct"]')).not.toBeNull()
  expect(canvas.querySelector('[data-edge-route="detour"]')).not.toBeNull()
  expect(canvas.querySelector('[data-edge-route="detour"][data-edge-lane="0"]')).not.toBeNull()
  expect(canvas.querySelector('[data-edge-active="true"]')).not.toBeNull()
  expect(Number(canvas.dataset.canvasWidth)).toBeGreaterThan(1180)
  expect(Number(canvas.dataset.canvasHeight)).toBeGreaterThan(680)
  expect(canvas.querySelector('svg')).toHaveAttribute('viewBox', `0 0 ${canvas.dataset.canvasWidth} ${canvas.dataset.canvasHeight}`)
  expect(Number(screen.getByLabelText('start Node').dataset.nodeX)).toBeLessThan(Number(screen.getByLabelText('guardrail Node').dataset.nodeX))
  expect(Number(screen.getByLabelText('guardrail Node').dataset.nodeX)).toBeLessThan(Number(screen.getByLabelText('analyze Node').dataset.nodeX))

  const viewport = canvas.closest('[data-canvas-viewport]') as HTMLDivElement
  viewport.scrollLeft = 120
  viewport.scrollTop = 90
  fireEvent.pointerDown(canvas, { pointerId: 7, clientX: 400, clientY: 320 })
  expect(canvas.className).toContain('cursor-grabbing')
  fireEvent.pointerMove(canvas, { pointerId: 7, clientX: 350, clientY: 260 })
  expect(viewport.scrollLeft).toBe(170)
  expect(viewport.scrollTop).toBe(150)
  fireEvent.pointerUp(canvas, { pointerId: 7 })
  expect(canvas.className).toContain('cursor-grab')

  fireEvent.pointerDown(screen.getByLabelText('analyze Node'), { pointerId: 8, clientX: 350, clientY: 260 })
  fireEvent.pointerMove(canvas, { pointerId: 8, clientX: 250, clientY: 160 })
  expect(viewport.scrollLeft).toBe(170)
  expect(viewport.scrollTop).toBe(150)
  expect(screen.getByText('Retry·Reject 하단 Routing')).toBeInTheDocument()
})

test('the Workflow Profile selector loads the saved NATURAL_CMS production contract', async () => {
  const naturalVersion: ProfileVersion = {
    profileVersionId: 'natural-version-4', profileKey: 'NATURAL_CMS', profileVersion: 4,
    status: 'ACTIVE', createdAt: '2026-09-01T00:00:00Z',
    snapshot: {
      contractVersion: '1.0', profileVersionId: 'natural-version-4', profileKey: 'NATURAL_CMS', profileVersion: 4,
      ...starterSnapshots.NATURAL_CMS,
    },
  }
  const api = profileApi({
    list: vi.fn().mockImplementation((profileKey) => Promise.resolve(profileKey === 'NATURAL_CMS' ? [naturalVersion] : [activeVersion])),
  })
  render(<AgentSettingsWorkspace api={api} />)
  await screen.findByLabelText('analyze Node')

  fireEvent.change(screen.getByLabelText('Workflow Profile'), { target: { value: 'NATURAL_CMS' } })

  await screen.findByLabelText('apply Node')
  expect(api.list).toHaveBeenCalledWith('NATURAL_CMS')
  expect(screen.getByLabelText('저장된 Workflow Version')).toHaveValue('natural-version-4')
  fireEvent.click(screen.getByLabelText('preview Node'))
  expect(screen.getByLabelText('선택 Agent Model Binding')).toHaveValue('natural-cms-command')
  expect(screen.getByLabelText('허용 Tool apply_cms_preview')).toBeChecked()
})

test('Workflow edits save a new immutable DRAFT, activate it explicitly, and restore after remount', async () => {
  let stored = [activeVersion]
  const create = vi.fn().mockImplementation(async (profileKey, snapshot) => {
    const created: ProfileVersion = {
      profileVersionId: 'version-3', profileKey, profileVersion: 3, status: 'DRAFT', createdAt: '2026-09-01T01:00:00Z',
      snapshot: { contractVersion: '1.0', profileVersionId: 'version-3', profileKey, profileVersion: 3, ...snapshot },
    }
    stored = [created, ...stored]
    return created
  })
  const activate = vi.fn().mockImplementation(async (profileVersionId) => {
    const activated = { ...stored.find((version) => version.profileVersionId === profileVersionId)!, status: 'ACTIVE' as const }
    stored = stored.map((version) => version.profileVersionId === profileVersionId
      ? activated
      : version.status === 'ACTIVE' ? { ...version, status: 'INACTIVE' as const } : version)
    return activated
  })
  const api = profileApi({ list: vi.fn().mockImplementation(async () => stored), create, activate })
  const first = render(<AgentSettingsWorkspace api={api} />)
  await screen.findByLabelText('analyze Node')

  fireEvent.click(screen.getByLabelText('analyze Node'))
  fireEvent.change(screen.getByLabelText('선택 Agent Model Binding'), { target: { value: 'llm-ops-claude' } })
  fireEvent.click(screen.getByLabelText('Fallback llm-ops-review'))
  fireEvent.click(screen.getByLabelText('허용 Tool apply_patch'))
  fireEvent.click(screen.getByRole('button', { name: '새 DRAFT 저장' }))

  expect(await screen.findByRole('status')).toHaveTextContent('v3 DRAFT를 저장하고 다시 조회했습니다.')
  expect(create).toHaveBeenCalledWith('LLM_OPS', expect.objectContaining({
    nodes: expect.arrayContaining([expect.objectContaining({ id: 'analyze', handlerKey: 'coding.analyze' })]),
    edges: expect.arrayContaining([expect.objectContaining({ from: 'analyze', resultPort: 'feasible', to: 'scope_approval' })]),
    modelBindings: expect.objectContaining({ analyze: { primary: 'llm-ops-claude', fallback: ['llm-ops-review'] } }),
    toolPolicy: expect.objectContaining({ allowedTools: expect.not.arrayContaining(['apply_patch']) }),
  }))
  fireEvent.click(screen.getByLabelText('analyze Node'))
  expect(screen.getByLabelText('선택 Agent Model Binding')).toHaveValue('llm-ops-claude')
  expect(screen.getByLabelText('허용 Tool apply_patch')).not.toBeChecked()

  fireEvent.click(screen.getByRole('button', { name: '선택 DRAFT 활성화' }))
  expect(await screen.findByRole('status')).toHaveTextContent('v3을 ACTIVE로 전환하고 다시 조회했습니다.')
  expect(activate).toHaveBeenCalledWith('version-3')

  first.unmount()
  render(<AgentSettingsWorkspace api={api} />)
  await screen.findByLabelText('analyze Node')
  expect(screen.getByLabelText('저장된 Workflow Version')).toHaveValue('version-3')
  fireEvent.click(screen.getByLabelText('analyze Node'))
  expect(screen.getByLabelText('선택 Agent Model Binding')).toHaveValue('llm-ops-claude')
  expect(screen.getByLabelText('Fallback llm-ops-review')).toBeChecked()
  expect(screen.getByLabelText('허용 Tool apply_patch')).not.toBeChecked()
})

test('the Canvas exposes only registered handlers and result-port edges while locking required nodes', async () => {
  render(<AgentSettingsWorkspace api={profileApi()} />)
  await screen.findByLabelText('guardrail Node')

  fireEvent.click(screen.getByLabelText('guardrail Node'))
  expect(screen.getByRole('button', { name: 'Node 삭제' })).toBeDisabled()
  expect(screen.getByText('Guardrail은 삭제하거나 비활성화할 수 없습니다.')).toBeInTheDocument()
  expect(screen.queryByText(/custom handler/i)).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'guardrail.passed에서 analyze 연결 해제' }))
  fireEvent.click(screen.getByLabelText('guardrail Node'))
  fireEvent.change(screen.getByLabelText('연결 Result Port'), { target: { value: 'passed' } })
  fireEvent.click(screen.getByRole('button', { name: '이 Port에서 연결' }))
  fireEvent.click(screen.getByLabelText('preview Node'))
  expect(screen.getByText('guardrail.passed → preview 연결을 추가했습니다.')).toBeInTheDocument()

  fireEvent.click(screen.getByLabelText('deploy_request Node'))
  fireEvent.click(screen.getByRole('button', { name: 'Node 삭제' }))
  expect(screen.queryByLabelText('deploy_request Node')).not.toBeInTheDocument()
  fireEvent.click(within(screen.getByLabelText('Node Palette')).getByRole('button', { name: /공통 Check/ }))
  expect(screen.getByLabelText('check Node')).toBeInTheDocument()
  expect(screen.getByLabelText('선택 Handler')).toHaveValue('common.check')
})

test('Workflow DRAFT validation failures remain visible with the Backend error code', async () => {
  const api = profileApi({ create: vi.fn().mockRejectedValue(new Error('Snapshot 검증 실패 [CONTRACT_VALIDATION_FAILED]')) })
  render(<AgentSettingsWorkspace api={api} />)
  await screen.findByLabelText('guardrail Node')

  fireEvent.click(screen.getByRole('button', { name: '새 DRAFT 저장' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Snapshot 검증 실패 [CONTRACT_VALIDATION_FAILED]')
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => { resolve = accept })
  return { promise, resolve }
}

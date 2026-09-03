import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ProductApiError } from '../../shared/api/error'
import AgentSettingsWorkspace from './AgentSettingsWorkspace'
import { resolveEdgePorts, starterSnapshots } from './WorkflowPanel'
import type { AgentSettingsApiClient, ProfileVersion, ProviderConnectionTestResult } from './api'

afterEach(() => vi.unstubAllGlobals())

test('the LLM_OPS starter uses the v4 PR-to-deploy tail without a CMS approval node', () => {
  const snapshot = starterSnapshots.LLM_OPS
  const node = (id: string) => snapshot.nodes.find((item) => item.id === id)
  const edge = (from: string, resultPort: string, to: string) =>
    snapshot.edges.some((item) => item.from === from && item.resultPort === resultPort && item.to === to)

  expect(snapshot.nodes).toEqual([
    { id: 'start', type: 'start', handlerKey: 'common.start', resultPorts: ['next'], config: {} },
    { id: 'guardrail', type: 'guardrail', handlerKey: 'common.guardrail', resultPorts: ['passed', 'failed'], config: { locked: true } },
    { id: 'analyze', type: 'agent', handlerKey: 'coding.analyze', resultPorts: ['feasible', 'infeasible'], config: {} },
    { id: 'scope_approval', type: 'approval', handlerKey: 'coding.approval', resultPorts: ['approved'], config: { stage: 'SCOPE', requiredRole: 'GENERAL_ADMIN' } },
    { id: 'code', type: 'agent', handlerKey: 'coding.code', resultPorts: ['completed'], config: {} },
    { id: 'review', type: 'agent', handlerKey: 'coding.review', resultPorts: ['passed', 'changes_requested'], config: {} },
    { id: 'rework_gate', type: 'check', handlerKey: 'coding.rework_gate', resultPorts: ['retry', 'handover'], config: { maxReworkRounds: 3 } },
    { id: 'preview', type: 'tool', handlerKey: 'coding.preview', resultPorts: ['ready'], config: {} },
    { id: 'preview_approval', type: 'approval', handlerKey: 'coding.preview_approval', resultPorts: ['approved', 'rejected'], config: { stage: 'CANDIDATE', requiredRole: 'GENERAL_ADMIN' } },
    { id: 'pr_request', type: 'tool', handlerKey: 'coding.pr_request', resultPorts: ['requested'], config: {} },
    { id: 'github_approval', type: 'approval', handlerKey: 'coding.approval', resultPorts: ['approved'], config: { stage: 'GITHUB', requiredRole: 'SUPER_ADMIN' } },
    { id: 'pr_complete', type: 'tool', handlerKey: 'coding.pr_complete', resultPorts: ['completed'], config: {} },
    { id: 'deploy_request', type: 'tool', handlerKey: 'coding.deploy_request', resultPorts: ['recorded'], config: { mode: 'request_record_only' } },
    { id: 'deploy_approval', type: 'approval', handlerKey: 'coding.approval', resultPorts: ['approved'], config: { stage: 'DEPLOY', requiredRole: 'SUPER_ADMIN' } },
    { id: 'dev_merge_check', type: 'check', handlerKey: 'coding.dev_merge_check', resultPorts: ['merged', 'not_merged', 'blocked'], config: {} },
    { id: 'deploy', type: 'tool', handlerKey: 'coding.deploy', resultPorts: ['completed', 'blocked'], config: {} },
    { id: 'end', type: 'end', handlerKey: 'common.end', resultPorts: [], config: {} },
  ])
  expect(snapshot.edges).toEqual([
    { from: 'start', resultPort: 'next', to: 'guardrail' }, { from: 'guardrail', resultPort: 'passed', to: 'analyze' },
    { from: 'guardrail', resultPort: 'failed', to: 'end' }, { from: 'analyze', resultPort: 'feasible', to: 'scope_approval' },
    { from: 'analyze', resultPort: 'infeasible', to: 'end' }, { from: 'scope_approval', resultPort: 'approved', to: 'code' },
    { from: 'code', resultPort: 'completed', to: 'review' }, { from: 'review', resultPort: 'passed', to: 'preview' },
    { from: 'review', resultPort: 'changes_requested', to: 'rework_gate' }, { from: 'rework_gate', resultPort: 'retry', to: 'code' },
    { from: 'rework_gate', resultPort: 'handover', to: 'end' }, { from: 'preview', resultPort: 'ready', to: 'preview_approval' },
    { from: 'preview_approval', resultPort: 'approved', to: 'pr_request' }, { from: 'preview_approval', resultPort: 'rejected', to: 'analyze' },
    { from: 'pr_request', resultPort: 'requested', to: 'github_approval' }, { from: 'github_approval', resultPort: 'approved', to: 'pr_complete' },
    { from: 'pr_complete', resultPort: 'completed', to: 'deploy_request' }, { from: 'deploy_request', resultPort: 'recorded', to: 'deploy_approval' },
    { from: 'deploy_approval', resultPort: 'approved', to: 'dev_merge_check' }, { from: 'dev_merge_check', resultPort: 'not_merged', to: 'deploy_request' },
    { from: 'dev_merge_check', resultPort: 'merged', to: 'deploy' }, { from: 'dev_merge_check', resultPort: 'blocked', to: 'end' },
    { from: 'deploy', resultPort: 'completed', to: 'end' }, { from: 'deploy', resultPort: 'blocked', to: 'end' },
  ])
  expect(snapshot.config).toEqual({
    maxNodes: 17, maxAttempts: 3,
    loopLimits: [
      { from: 'rework_gate', resultPort: 'retry', to: 'code', maxIterations: 2 },
      { from: 'preview_approval', resultPort: 'rejected', to: 'analyze', maxIterations: 2 },
      { from: 'dev_merge_check', resultPort: 'not_merged', to: 'deploy_request', maxIterations: 2 },
    ],
  })
  expect(snapshot.modelBindings).toEqual({
    analyze: { primary: 'llm-ops-analyze', fallback: [] },
    code: { primary: 'llm-ops-code', fallback: [] },
    review: { primary: 'llm-ops-review', fallback: [] },
  })
  expect(snapshot.toolPolicy).toEqual({
    allowedTools: ['read_file', 'search_code', 'read_diff', 'apply_patch', 'run_check', 'check_package_allowlist', 'scan_changed_files'],
  })
  expect(snapshot.guardrailProfileKey).toBe('central.default')
  expect(snapshot.nodes).toHaveLength(17)
  expect(node('cms_approval')).toBeUndefined()
  expect(node('pr_complete')).toMatchObject({ handlerKey: 'coding.pr_complete', resultPorts: ['completed'] })
  expect(node('dev_merge_check')).toMatchObject({ handlerKey: 'coding.dev_merge_check', resultPorts: ['merged', 'not_merged', 'blocked'] })
  expect(node('deploy')).toMatchObject({ handlerKey: 'coding.deploy', resultPorts: ['completed', 'blocked'] })
  expect(edge('github_approval', 'approved', 'pr_complete')).toBe(true)
  expect(edge('pr_complete', 'completed', 'deploy_request')).toBe(true)
  expect(edge('deploy_request', 'recorded', 'deploy_approval')).toBe(true)
  expect(edge('deploy_approval', 'approved', 'dev_merge_check')).toBe(true)
  expect(edge('dev_merge_check', 'not_merged', 'deploy_request')).toBe(true)
  expect(edge('dev_merge_check', 'merged', 'deploy')).toBe(true)
  expect(edge('dev_merge_check', 'blocked', 'end')).toBe(true)
  expect(edge('deploy', 'completed', 'end')).toBe(true)
  expect(edge('deploy', 'blocked', 'end')).toBe(true)
  expect(snapshot.config.loopLimits).toContainEqual({ from: 'dev_merge_check', resultPort: 'not_merged', to: 'deploy_request', maxIterations: 2 })
})

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
    getEditorLayout: vi.fn().mockResolvedValue({
      profileVersionId: 'version-2', createdAt: '2026-09-03T00:00:00Z',
      nodes: starterSnapshots.LLM_OPS.nodes.map((node, index) => ({ id: node.id, x: 48 + index * 244, y: 48 })),
    }),
    saveEditorLayout: vi.fn().mockResolvedValue({
      profileVersionId: 'version-3', createdAt: '2026-09-03T00:00:00Z', nodes: [],
    }),
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
  expect(screen.getByLabelText('analyze Node')).toHaveAttribute('aria-current', 'true')
  expect(screen.getByLabelText('analyze Node')).toHaveAttribute('data-node-selected', 'true')
  expect(screen.getByLabelText('analyze Node')).toHaveClass('scale-[1.035]', 'border-2')
  expect(screen.getByLabelText('analyze Node')).toHaveStyle({ transform: 'scale(1.035)', borderColor: '#2f8de4' })
  expect(screen.getByText('선택됨')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('analyze Node를 선택했습니다.')
  expect(screen.getByRole('status')).toHaveClass('cms-success-toast')
  expect(screen.getByLabelText('선택 Node ID')).toHaveClass('cursor-not-allowed')
  expect(screen.getByLabelText('선택 Node ID')).toHaveStyle({ backgroundColor: '#f1f3f5', color: '#3f4a56' })
  expect(screen.getByLabelText('선택 Handler')).toHaveClass('cursor-not-allowed')
  expect(screen.getByLabelText('선택 Handler')).toHaveStyle({ backgroundColor: '#f1f3f5', color: '#3f4a56' })
  expect(screen.getByLabelText('선택 Handler')).toHaveValue('coding.analyze')
  expect(screen.getByLabelText('선택 주 모델')).toHaveValue('llm-ops-analyze')
  expect(screen.getByRole('option', { name: 'OpenAI · gpt-5.4-nano (llm-ops-analyze)' })).toBeInTheDocument()
  expect(screen.getByText(/괄호 안 Binding Key를 Snapshot에 저장/)).toBeInTheDocument()
  expect(screen.getByLabelText('허용 Tool apply_patch')).toBeChecked()
  expect(screen.getByText('guardrail.passed → analyze')).toBeInTheDocument()
  expect(screen.getByText('analyze.feasible → scope_approval')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'analyze.feasible에서 scope_approval 연결 해제' })).toBeInTheDocument()

  const edgeToggle = screen.getByRole('button', { name: /Edge/ })
  expect(edgeToggle).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(edgeToggle)
  expect(edgeToggle).toHaveAttribute('aria-expanded', 'false')
  expect(document.getElementById('selected-node-edge-panel')).toHaveClass('hidden')
})

test('the Workflow Canvas restores saved coordinates, while auto layout remains local and deterministic', async () => {
  const storedNodes = starterSnapshots.LLM_OPS.nodes.map((node, index) => ({ id: node.id, x: 700 - index * 9, y: 120 + index * 17 }))
  const api = profileApi({
    getEditorLayout: vi.fn().mockResolvedValue({ profileVersionId: 'version-2', createdAt: '2026-09-03T00:00:00Z', nodes: storedNodes }),
  })
  render(<AgentSettingsWorkspace api={api} />)

  const start = await screen.findByLabelText('start Node')
  expect(start).toHaveAttribute('data-node-x', '700')
  expect(start).toHaveAttribute('data-node-y', '120')
  fireEvent.click(screen.getByRole('button', { name: '자동 배치' }))
  expect(start).toHaveAttribute('data-node-x', '48')
  expect(start).toHaveAttribute('data-node-y', '48')
  expect(api.saveEditorLayout).not.toHaveBeenCalled()
})

test('the Workflow Canvas falls back to deterministic auto layout when an older Version has no Editor Layout', async () => {
  const api = profileApi({
    getEditorLayout: vi.fn().mockRejectedValue(new ProductApiError({
      status: 404, code: 'PROFILE_EDITOR_LAYOUT_NOT_FOUND', message: 'Layout missing', traceId: 'layout-missing', retryable: false,
    })),
  })
  render(<AgentSettingsWorkspace api={api} />)

  const start = await screen.findByLabelText('start Node')
  expect(start).toHaveAttribute('data-node-x', '48')
  expect(start).toHaveAttribute('data-node-y', '48')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('the Workflow Canvas uses a left control dock and one scrollable coordinate system for layered Nodes and lower detours', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0 })
  render(<AgentSettingsWorkspace api={profileApi()} />)

  await screen.findByLabelText('analyze Node')
  const canvas = screen.getByLabelText('Node 편집 Canvas')
  const dock = screen.getByLabelText('Workflow control dock')
  const paletteToggle = screen.getByRole('button', { name: /등록 Handler Palette/ })
  const toolPolicyToggle = screen.getByRole('button', { name: /Profile 허용 도구/ })

  expect(canvas.className).toContain('bg-[#20262e]')
  expect(dock).toHaveTextContent('Node 설정')
  expect(paletteToggle).toHaveAttribute('aria-expanded', 'false')
  expect(toolPolicyToggle).toHaveAttribute('aria-expanded', 'false')
  expect(paletteToggle).toHaveAttribute('aria-controls', 'handler-palette-panel')
  fireEvent.click(paletteToggle)
  expect(paletteToggle).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(toolPolicyToggle)
  expect(toolPolicyToggle).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText(/파일 읽기/)).toHaveTextContent('파일 읽기 (read_file)')
  expect(screen.getByText('승인된 Coding 작업공간의 UTF-8 텍스트 파일 하나를 읽습니다.')).toBeInTheDocument()
  expect(canvas.querySelectorAll('[data-node-port="left"]')).toHaveLength(starterSnapshots.LLM_OPS.nodes.length)
  expect(canvas.querySelectorAll('[data-node-port="right"]')).toHaveLength(starterSnapshots.LLM_OPS.nodes.length)
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
  const canvasContent = canvas.querySelector('[data-canvas-content]') as HTMLDivElement
  fireEvent.pointerDown(canvasContent, { pointerId: 7, clientX: 400, clientY: 320 })
  expect(canvas.className).toContain('cursor-grabbing')
  fireEvent.pointerMove(canvasContent, { pointerId: 7, clientX: 350, clientY: 260 })
  expect(viewport.scrollLeft).toBe(170)
  expect(viewport.scrollTop).toBe(150)
  fireEvent.pointerUp(canvasContent, { pointerId: 7 })
  expect(canvas.className).toContain('cursor-grab')

  fireEvent.pointerDown(screen.getByLabelText('analyze Node'), { pointerId: 8, clientX: 350, clientY: 260 })
  fireEvent.pointerMove(canvas, { pointerId: 8, clientX: 250, clientY: 160 })
  expect(viewport.scrollLeft).toBe(170)
  expect(viewport.scrollTop).toBe(150)
  expect(screen.getByText('Retry·Reject 하단 Routing')).toBeInTheDocument()

  fireEvent.wheel(canvas, { deltaY: -100, clientX: 400, clientY: 320 })
  expect(canvas).toHaveAttribute('data-canvas-zoom', '1.1')
  expect(canvasContent).toHaveStyle({ transform: 'scale(1.1)' })
  expect(screen.getByLabelText('Canvas 확대 비율')).toHaveTextContent('110%')
})

test('feedback Edges choose the open side of their source Node after Nodes move', () => {
  const node = (id: string, x: number, y: number) => ({ ...starterSnapshots.LLM_OPS.nodes.find((item) => item.id === id)!, x, y })
  const nodes = [node('review', 300, 100), node('preview', 500, 500), node('preview_approval', 200, 100), node('rework_gate', 200, 350), node('code', 80, 100), node('end', 800, 350)]
  const edges = [
    { from: 'review', resultPort: 'passed', to: 'preview' }, { from: 'preview', resultPort: 'ready', to: 'preview_approval' },
    { from: 'review', resultPort: 'changes_requested', to: 'rework_gate' }, { from: 'rework_gate', resultPort: 'retry', to: 'code' }, { from: 'rework_gate', resultPort: 'handover', to: 'end' },
  ]
  expect(resolveEdgePorts(edges[1], nodes, edges)).toEqual({ reverse: true, sourcePort: 'right', targetPort: 'right' })
  expect(resolveEdgePorts(edges[3], nodes, edges)).toEqual({ reverse: true, sourcePort: 'left', targetPort: 'left' })
  expect(resolveEdgePorts(edges[4], nodes, edges)).toEqual({ reverse: false, sourcePort: 'right', targetPort: 'left' })
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
  expect(screen.getByLabelText('선택 주 모델')).toHaveValue('natural-cms-command')
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
  fireEvent.change(screen.getByLabelText('선택 주 모델'), { target: { value: 'llm-ops-claude' } })
  fireEvent.click(screen.getByLabelText('Fallback llm-ops-review'))
  fireEvent.click(screen.getByLabelText('허용 Tool apply_patch'))
  const maxNodesInput = screen.getByLabelText('최대 Node 수 (maxNodes)')
  expect(maxNodesInput).toHaveAttribute('min', String(starterSnapshots.LLM_OPS.nodes.length))
  fireEvent.change(maxNodesInput, { target: { value: '20' } })
  const autoArrangeButton = screen.getByRole('button', { name: '자동 배치' })
  const saveDraftButton = screen.getByRole('button', { name: '새 DRAFT 저장' })
  const activateButton = screen.getByRole('button', { name: '선택 DRAFT 활성화' })
  const reloadButton = screen.getByRole('button', { name: '다시 조회' })
  expect(autoArrangeButton).toHaveStyle({ backgroundColor: '#e8f4fa', color: '#245b78' })
  expect(saveDraftButton).toHaveStyle({ color: '#fff' })
  expect(activateButton).toHaveStyle({ backgroundColor: '#e9f6ee', color: '#246b45' })
  expect(reloadButton).toHaveStyle({ backgroundColor: '#f0f2f5', color: '#435264' })
  fireEvent.click(saveDraftButton)

  await screen.findByText('v3 DRAFT를 저장하고 다시 조회했습니다.')
  expect(screen.getByRole('status')).toHaveTextContent('v3 DRAFT를 저장하고 다시 조회했습니다.')
  expect(create).toHaveBeenCalledWith('LLM_OPS', expect.objectContaining({
    nodes: expect.arrayContaining([expect.objectContaining({ id: 'analyze', handlerKey: 'coding.analyze' })]),
    edges: expect.arrayContaining([expect.objectContaining({ from: 'analyze', resultPort: 'feasible', to: 'scope_approval' })]),
    config: expect.objectContaining({ maxNodes: 20 }),
    modelBindings: expect.objectContaining({ analyze: { primary: 'llm-ops-claude', fallback: ['llm-ops-review'] } }),
    toolPolicy: expect.objectContaining({ allowedTools: expect.not.arrayContaining(['apply_patch']) }),
  }))
  expect(api.saveEditorLayout).toHaveBeenCalledWith('version-3', expect.any(Array))
  const savedNodes = (api.saveEditorLayout as ReturnType<typeof vi.fn>).mock.calls[0][1] as Array<Record<string, unknown>>
  expect(savedNodes).toHaveLength(starterSnapshots.LLM_OPS.nodes.length)
  expect(savedNodes.every((node) => Object.keys(node).sort().join(',') === 'id,x,y')).toBe(true)
  fireEvent.click(screen.getByLabelText('analyze Node'))
  expect(screen.getByLabelText('선택 주 모델')).toHaveValue('llm-ops-claude')
  expect(screen.getByLabelText('허용 Tool apply_patch')).not.toBeChecked()

  fireEvent.click(screen.getByRole('button', { name: '선택 DRAFT 활성화' }))
  await screen.findByText('v3을 ACTIVE로 전환하고 다시 조회했습니다.')
  expect(screen.getByRole('status')).toHaveTextContent('v3을 ACTIVE로 전환하고 다시 조회했습니다.')
  expect(activate).toHaveBeenCalledWith('version-3')

  first.unmount()
  render(<AgentSettingsWorkspace api={api} />)
  await screen.findByLabelText('analyze Node')
  expect(screen.getByLabelText('저장된 Workflow Version')).toHaveValue('version-3')
  fireEvent.click(screen.getByLabelText('analyze Node'))
  expect(screen.getByLabelText('선택 주 모델')).toHaveValue('llm-ops-claude')
  expect(screen.getByLabelText('Fallback llm-ops-review')).toBeChecked()
  expect(screen.getByLabelText('허용 Tool apply_patch')).not.toBeChecked()
})

test('a DRAFT remains visible when its separate Editor Layout save fails', async () => {
  const draft = { ...activeVersion, profileVersionId: 'version-3', profileVersion: 3, status: 'DRAFT' as const }
  const api = profileApi({
    create: vi.fn().mockResolvedValue(draft),
    saveEditorLayout: vi.fn().mockRejectedValue(new Error('Layout 저장 실패 [INTERNAL_TRANSIENT_ERROR]')),
    list: vi.fn().mockResolvedValue([draft, activeVersion]),
  })
  render(<AgentSettingsWorkspace api={api} />)
  await screen.findByLabelText('guardrail Node')

  fireEvent.click(screen.getByRole('button', { name: '새 DRAFT 저장' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('v3 DRAFT는 저장됐지만 Editor Layout 저장에 실패했습니다.')
  expect(screen.getByLabelText('저장된 Workflow Version')).toHaveValue('version-3')
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
  const connectButton = screen.getByRole('button', { name: '이 Port에서 연결' })
  expect(connectButton).toHaveStyle({ color: '#fff' })
  fireEvent.click(connectButton)
  expect(screen.getByRole('button', { name: '연결 선택 취소' })).not.toHaveStyle({ color: '#fff' })
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

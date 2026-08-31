import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { describeFailure } from '../../shared/api/error'
import { Icon, type IconName } from '../../shared/ui/icons'
import {
  Badge, Callout, PageHead, PanelTitle, Tag, control, dangerButton, panel, primaryButton, secondaryButton,
  type Tone,
} from '../../shared/ui/primitives'
import type {
  AgentSettingsApiClient, ModelProvider, ProfileAuthoringSnapshot, ProfileKey, ProfileVersion,
  ProfileVersionApiClient, ProviderCredentialState, ProviderCredentialStatus,
} from './api'

type TabId = 'provider' | 'workflow' | 'profile' | 'policy' | 'usage'
type NodeType = 'start' | 'agent' | 'tool' | 'guardrail' | 'approval' | 'check' | 'end'

const temporaryMockTitle = '임시 목업 · 향후 필요 시 현재 Runtime 계약 기준으로 구현'

interface WorkflowNode {
  id: string
  type: NodeType
  name: string
  x: number
  y: number
  model: string
  tools: string[]
}

interface WorkflowEdge {
  from: string
  to: string
}

const tabs: { id: TabId; label: string; temporary?: true }[] = [
  { id: 'provider', label: 'Provider·Model' },
  { id: 'workflow', label: 'Agent·Workflow' },
  { id: 'profile', label: '자연어 기능 Profile' },
  { id: 'policy', label: 'Tool·실행 정책', temporary: true },
  { id: 'usage', label: '사용량·평가', temporary: true },
]

const nodeTypes: Record<NodeType, { label: string; icon: IconName; meta: string; skin: string }> = {
  start: { label: 'Start', icon: 'play', meta: '요청 시작', skin: 'bg-ok-bg text-ok-fg' },
  agent: { label: 'Agent', icon: 'bot', meta: 'Model · Tool Mapping', skin: 'bg-run-bg text-run-fg' },
  tool: { label: 'MCP Tool', icon: 'plug', meta: '실행 계약 미연결', skin: 'bg-wait-bg text-wait-fg' },
  guardrail: { label: 'Guardrail', icon: 'shield-check', meta: 'Snapshot 잠금 계약', skin: 'bg-[#f2ecf8] text-[#765a91]' },
  approval: { label: 'Approval', icon: 'shield-check', meta: '공통 Handler 연결 전', skin: 'bg-[#f2ecf8] text-[#765a91]' },
  check: { label: 'Check', icon: 'check-check', meta: '공통 Handler 연결 전', skin: 'bg-[#f2ecf8] text-[#765a91]' },
  end: { label: 'End', icon: 'inbox', meta: '결과 종료', skin: 'bg-idle-bg text-idle-fg' },
}

const models = ['GPT-4o', 'Claude Sonnet', 'Gemini Pro', 'GPT-4o mini']
const fixedTools = ['read_file', 'search_code', 'apply_patch', 'read_diff', 'run_check']
const profileCatalog: Record<ProfileKey, {
  title: string
  owner: string
  queue: string
  target: string
  runtime: string
}> = {
  LLM_OPS: {
    title: 'LLM Ops',
    owner: '4번 · 제한형 LLM DevOps',
    queue: 'Coding',
    target: '승인된 Source Repository',
    runtime: 'Profile Version 조회·Job 고정 바인딩 구현',
  },
  NATURAL_CMS: {
    title: 'Natural CMS',
    owner: '5번 · 자연어 CMS 관리',
    queue: 'Natural CMS',
    target: '기존 CMS Resource',
    runtime: '공통 Profile 계약만 정의 · 기능 연결 전',
  },
}

const starterSnapshots: Record<ProfileKey, ProfileAuthoringSnapshot> = {
  LLM_OPS: {
    nodes: [
      { id: 'start', type: 'start', handlerKey: 'common.start', resultPorts: ['next'], config: {} },
      { id: 'guardrail', type: 'guardrail', handlerKey: 'common.guardrail', resultPorts: ['passed', 'failed'], config: { locked: true } },
      { id: 'analyze', type: 'agent', handlerKey: 'coding.analyze', resultPorts: ['feasible', 'infeasible'], config: {} },
      { id: 'scope_approval', type: 'approval', handlerKey: 'coding.approval', resultPorts: ['approved'], config: { stage: 'SCOPE', requiredRole: 'GENERAL_ADMIN' } },
      { id: 'code', type: 'agent', handlerKey: 'coding.code', resultPorts: ['completed'], config: {} },
      { id: 'review', type: 'agent', handlerKey: 'coding.review', resultPorts: ['passed', 'changes_requested'], config: {} },
      { id: 'preview', type: 'tool', handlerKey: 'coding.preview', resultPorts: ['ready'], config: {} },
      { id: 'preview_approval', type: 'approval', handlerKey: 'coding.preview_approval', resultPorts: ['approved', 'rejected'], config: { stage: 'CANDIDATE', requiredRole: 'GENERAL_ADMIN' } },
      { id: 'pr_request', type: 'tool', handlerKey: 'coding.pr_request', resultPorts: ['requested'], config: {} },
      { id: 'github_approval', type: 'approval', handlerKey: 'coding.approval', resultPorts: ['approved'], config: { stage: 'GITHUB', requiredRole: 'SUPER_ADMIN' } },
      { id: 'cms_approval', type: 'approval', handlerKey: 'coding.approval', resultPorts: ['approved'], config: { stage: 'CMS', requiredRole: 'GENERAL_ADMIN' } },
      { id: 'deploy_approval', type: 'approval', handlerKey: 'coding.approval', resultPorts: ['approved'], config: { stage: 'DEPLOY', requiredRole: 'SUPER_ADMIN' } },
      { id: 'deploy_request', type: 'tool', handlerKey: 'coding.deploy_request', resultPorts: ['recorded'], config: { mode: 'request_record_only' } },
      { id: 'end', type: 'end', handlerKey: 'common.end', resultPorts: [], config: {} },
    ],
    edges: [
      { from: 'start', resultPort: 'next', to: 'guardrail' }, { from: 'guardrail', resultPort: 'passed', to: 'analyze' },
      { from: 'guardrail', resultPort: 'failed', to: 'end' }, { from: 'analyze', resultPort: 'feasible', to: 'scope_approval' },
      { from: 'analyze', resultPort: 'infeasible', to: 'end' }, { from: 'scope_approval', resultPort: 'approved', to: 'code' },
      { from: 'code', resultPort: 'completed', to: 'review' }, { from: 'review', resultPort: 'passed', to: 'preview' },
      { from: 'review', resultPort: 'changes_requested', to: 'code' }, { from: 'preview', resultPort: 'ready', to: 'preview_approval' },
      { from: 'preview_approval', resultPort: 'approved', to: 'pr_request' }, { from: 'preview_approval', resultPort: 'rejected', to: 'analyze' },
      { from: 'pr_request', resultPort: 'requested', to: 'github_approval' }, { from: 'github_approval', resultPort: 'approved', to: 'cms_approval' },
      { from: 'cms_approval', resultPort: 'approved', to: 'deploy_approval' }, { from: 'deploy_approval', resultPort: 'approved', to: 'deploy_request' },
      { from: 'deploy_request', resultPort: 'recorded', to: 'end' },
    ],
    config: { maxNodes: 14, maxAttempts: 3, loopLimits: [
      { from: 'review', resultPort: 'changes_requested', to: 'code', maxIterations: 2 },
      { from: 'preview_approval', resultPort: 'rejected', to: 'analyze', maxIterations: 2 },
    ] },
    modelBindings: {
      analyze: { primary: 'llm-ops-analyze', fallback: [] }, code: { primary: 'llm-ops-code', fallback: [] }, review: { primary: 'llm-ops-review', fallback: [] },
    },
    toolPolicy: { allowedTools: ['read_file', 'search_code', 'read_diff', 'apply_patch', 'run_check', 'check_package_allowlist', 'scan_changed_files'] },
    guardrailProfileKey: 'central.default',
  },
  NATURAL_CMS: {
    nodes: [
      { id: 'start', type: 'start', handlerKey: 'common.start', resultPorts: ['next'], config: {} },
      { id: 'guardrail', type: 'guardrail', handlerKey: 'common.guardrail', resultPorts: ['passed', 'failed'], config: { locked: true } },
      { id: 'analyze', type: 'agent', handlerKey: 'cms.analyze', resultPorts: ['feasible', 'infeasible'], config: {} },
      { id: 'preview', type: 'agent', handlerKey: 'cms.preview', resultPorts: ['ready'], config: {} },
      { id: 'approval', type: 'approval', handlerKey: 'cms.approval', resultPorts: ['approved', 'rejected'], config: { stage: 'PREVIEW', requiredRole: 'GENERAL_ADMIN' } },
      { id: 'discard', type: 'tool', handlerKey: 'cms.discard', resultPorts: ['retry', 'discarded'], config: {} },
      { id: 'apply', type: 'tool', handlerKey: 'cms.apply', resultPorts: ['applied'], config: {} },
      { id: 'end', type: 'end', handlerKey: 'common.end', resultPorts: [], config: {} },
    ],
    edges: [
      { from: 'start', resultPort: 'next', to: 'guardrail' }, { from: 'guardrail', resultPort: 'passed', to: 'analyze' },
      { from: 'guardrail', resultPort: 'failed', to: 'end' }, { from: 'analyze', resultPort: 'feasible', to: 'preview' },
      { from: 'analyze', resultPort: 'infeasible', to: 'end' }, { from: 'preview', resultPort: 'ready', to: 'approval' },
      { from: 'approval', resultPort: 'approved', to: 'apply' }, { from: 'approval', resultPort: 'rejected', to: 'discard' },
      { from: 'discard', resultPort: 'retry', to: 'analyze' }, { from: 'discard', resultPort: 'discarded', to: 'end' },
      { from: 'apply', resultPort: 'applied', to: 'end' },
    ],
    config: { maxNodes: 8, maxAttempts: 3, loopLimits: [{ from: 'discard', resultPort: 'retry', to: 'analyze', maxIterations: 2 }] },
    modelBindings: { analyze: { primary: 'natural-cms-analyze', fallback: [] }, preview: { primary: 'natural-cms-command', fallback: [] } },
    toolPolicy: { allowedTools: ['resolve_cms_target', 'validate_cms_command', 'create_cms_preview', 'discard_cms_preview', 'revalidate_cms_preview', 'apply_cms_preview'] },
    guardrailProfileKey: 'central.default',
  },
}

const initialNodes: WorkflowNode[] = [
  { id: 'n1', type: 'start', name: 'Start', x: 24, y: 48, model: models[0], tools: [] },
  { id: 'n2', type: 'guardrail', name: '잠금 Guardrail', x: 200, y: 48, model: models[0], tools: [] },
  { id: 'n3', type: 'check', name: '결과 Check', x: 376, y: 48, model: models[0], tools: [] },
  { id: 'n4', type: 'approval', name: 'Approval', x: 552, y: 48, model: models[0], tools: [] },
  { id: 'n5', type: 'end', name: 'End', x: 376, y: 218, model: models[0], tools: [] },
]

const initialEdges: WorkflowEdge[] = [
  { from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4' }, { from: 'n4', to: 'n5' },
]

const providerCards: { id: ModelProvider; initial: string; name: string; model: string; skin: string }[] = [
  { id: 'OPENAI', initial: 'O', name: 'OpenAI', model: 'OpenAI API', skin: 'bg-run-bg text-run-fg' },
  { id: 'ANTHROPIC', initial: 'A', name: 'Anthropic', model: 'Anthropic API', skin: 'bg-[#f8f1ea] text-[#9a633a]' },
  { id: 'GOOGLE_GENAI', initial: 'G', name: 'Google', model: 'Gemini API', skin: 'bg-[#f1f4f9] text-[#4a5f8a]' },
]

const providerStatePresentation: Record<ProviderCredentialState, { label: string; tone: Tone }> = {
  STORED: { label: '저장됨 · 미검증', tone: 'wait' },
  VERIFIED: { label: '연결 확인', tone: 'ok' },
  BILLING_BLOCKED: { label: '결제 확인 필요', tone: 'wait' },
  INVALID_CREDENTIAL: { label: '인증 실패', tone: 'fail' },
  PROVIDER_UNAVAILABLE: { label: 'Provider 응답 없음', tone: 'fail' },
}

export default function AgentSettingsWorkspace({ api }: { api: AgentSettingsApiClient }) {
  const [activeTab, setActiveTab] = useState<TabId>('workflow')
  const [selectedProfileKey, setSelectedProfileKey] = useState<ProfileKey>('LLM_OPS')

  function moveTabFocus(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    setActiveTab(tabs[next].id)
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  return <>
    <PageHead title="Agent 설정" description="Provider Credential과 Profile Version을 최고관리자 계약으로 관리합니다.">
      <Badge tone="run" dot={false}>최고관리자 전용</Badge>
    </PageHead>
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-[#d9e6ef] bg-[#f4f9fc] px-3 py-2 text-[0.71875rem] text-run-fg">
      <Badge tone="run">부분 연결</Badge>
      <span>Provider Key와 자연어 기능 Profile은 실제 API를 사용합니다. Workflow·정책·사용량 영역은 아직 저장하거나 실행하지 않습니다.</span>
    </div>

    <div className="mb-[1.125rem] flex gap-[1.375rem] overflow-x-auto border-b border-line" role="tablist" aria-label="Agent 설정 영역">
      {tabs.map((tab, index) => <button
        key={tab.id}
        type="button"
        role="tab"
        id={`agent-settings-tab-${tab.id}`}
        aria-selected={activeTab === tab.id}
        tabIndex={activeTab === tab.id ? 0 : -1}
        className={`shrink-0 whitespace-nowrap bg-transparent px-[0.125rem] pb-[0.625rem] text-[0.8125rem] ${activeTab === tab.id ? 'font-semibold text-ink shadow-[inset_0_-2px_var(--primary)]' : 'font-medium text-muted'}`}
        onClick={() => setActiveTab(tab.id)}
        onKeyDown={(event) => moveTabFocus(event, index)}
      >
        {tab.label}
        {tab.temporary && <span className="ml-2 rounded border border-line bg-sub px-1 py-[0.0625rem] text-[0.5625rem] font-semibold text-muted-2" title={temporaryMockTitle}>임시</span>}
      </button>)}
    </div>

    {activeTab === 'provider' && <ProviderModelPanel api={api} />}
    {activeTab === 'workflow' && <WorkflowPanel />}
    {activeTab === 'profile' && <NaturalFeatureProfilePanel
      api={api}
      selectedKey={selectedProfileKey}
      onSelect={setSelectedProfileKey}
    />}
    {activeTab === 'policy' && <PolicyPanel />}
    {activeTab === 'usage' && <UsagePanel />}
  </>
}

function NaturalFeatureProfilePanel({ api, selectedKey, onSelect }: {
  api: ProfileVersionApiClient
  selectedKey: ProfileKey
  onSelect: (key: ProfileKey) => void
}) {
  const selected = profileCatalog[selectedKey]
  const [versions, setVersions] = useState<ProfileVersion[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [editor, setEditor] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setFailure(null)
    setNotice(null)
    void api.list(selectedKey).then((items) => {
      if (!active) return
      const next = [...items].sort((left, right) => right.profileVersion - left.profileVersion)
      const preferred = next.find((item) => item.status === 'ACTIVE') ?? next[0] ?? null
      setVersions(next)
      if (preferred) chooseVersion(preferred)
      else {
        setSelectedVersionId(null)
        setEditor(JSON.stringify(starterSnapshots[selectedKey], null, 2))
      }
    }).catch((error: unknown) => {
      if (active) { setVersions([]); setSelectedVersionId(null); setEditor(''); setFailure(describeFailure(error)) }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, selectedKey])

  const selectedVersion = versions.find((item) => item.profileVersionId === selectedVersionId) ?? null

  function chooseVersion(version: ProfileVersion | null) {
    setSelectedVersionId(version?.profileVersionId ?? null)
    setEditor(version ? JSON.stringify(toAuthoringSnapshot(version.snapshot), null, 2) : '')
  }

  async function saveDraft() {
    setFailure(null)
    setNotice(null)
    let snapshot: ProfileAuthoringSnapshot
    try {
      snapshot = JSON.parse(editor) as ProfileAuthoringSnapshot
    } catch {
      setFailure('Snapshot JSON 형식을 확인해 주세요.')
      return
    }
    setSaving(true)
    try {
      const created = await api.create(selectedKey, snapshot)
      setVersions((current) => [created, ...current])
      chooseVersion(created)
      setNotice(`v${created.profileVersion} DRAFT를 저장했습니다.`)
    } catch (error) {
      setFailure(describeFailure(error))
    } finally {
      setSaving(false)
    }
  }

  async function activateSelected() {
    if (!selectedVersion || selectedVersion.status !== 'DRAFT') return
    setSaving(true)
    setFailure(null)
    setNotice(null)
    try {
      const activated = await api.activate(selectedVersion.profileVersionId)
      setVersions((current) => current.map((item) => item.profileVersionId === activated.profileVersionId
        ? activated
        : item.status === 'ACTIVE' ? { ...item, status: 'INACTIVE' } : item))
      chooseVersion(activated)
      setNotice(`v${activated.profileVersion}을 ACTIVE로 전환했습니다.`)
    } catch (error) {
      setFailure(describeFailure(error))
    } finally {
      setSaving(false)
    }
  }

  return <section id="agent-settings-panel-profile" role="tabpanel" aria-labelledby="agent-settings-tab-profile">
    <Callout tone="ok" icon="shield-check">
      저장은 새 불변 DRAFT만 만들며 기존 Snapshot을 덮어쓰지 않습니다. 실행 반영은 DRAFT를 선택한 뒤 별도 활성화해야 합니다.
    </Callout>
    <div className="mt-3 grid items-start gap-[0.875rem] xl:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className={`${panel} overflow-hidden`} aria-label="자연어 기능 Profile 목록">
        <PanelTitle title="Profile" sub="기능 소유 영역별 버전" />
        <div className="grid gap-2 p-3">
          {(Object.keys(profileCatalog) as ProfileKey[]).map((key) => {
            const profile = profileCatalog[key]
            const active = selectedKey === key
            return <button
              key={key}
              type="button"
              aria-label={`${key} Profile 선택`}
              aria-pressed={active}
              className={`rounded-md border p-3 text-left ${active ? 'border-primary bg-run-bg' : 'border-line bg-white hover:bg-page'}`}
              onClick={() => onSelect(key)}
            >
              <span className="flex items-center gap-2">
                <b className="text-[0.8125rem] font-semibold">{profile.title}</b>
                <Tag>{key}</Tag>
              </span>
              <small className="mt-2 block text-[0.6875rem] text-muted-2">{profile.owner}</small>
            </button>
          })}
        </div>
        <div className="border-t border-row-line p-3">
          <b className="text-[0.71875rem] font-semibold">저장된 Version</b>
          {loading && <p className="mt-2 text-[0.6875rem] text-muted-2">조회 중…</p>}
          {!loading && versions.length === 0 && <p className="mt-2 text-[0.6875rem] text-muted-2">저장된 Version이 없습니다.</p>}
          <div className="mt-2 grid gap-2">
            {versions.map((version) => <button
              key={version.profileVersionId}
              type="button"
              aria-label={`v${version.profileVersion} ${version.status} 선택`}
              aria-pressed={selectedVersionId === version.profileVersionId}
              className={`flex items-center rounded border px-2 py-2 text-left text-[0.71875rem] ${selectedVersionId === version.profileVersionId ? 'border-primary bg-run-bg' : 'border-line bg-white'}`}
              onClick={() => chooseVersion(version)}
            >
              <b>v{version.profileVersion}</b><span className="ml-auto">{version.status}</span>
            </button>)}
          </div>
        </div>
      </aside>

      <article className={panel}>
        <PanelTitle title={`${selected.title} Profile`} sub={`${selectedKey} · ${selected.owner}`}>
          <Badge tone={selectedVersion?.status === 'ACTIVE' ? 'ok' : 'wait'} dot={false}>{selectedVersion?.status ?? 'VERSION 없음'}</Badge>
        </PanelTitle>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          <ProfileFact label="Queue Lane" value={selected.queue} />
          <ProfileFact label="작업 대상" value={selected.target} />
          <ProfileFact label="현재 Runtime" value={selected.runtime} />
        </div>
        <div className="border-t border-row-line p-4">
          <label className="block text-[0.71875rem] font-semibold text-body">새 DRAFT Snapshot JSON
            <textarea
              aria-label="Profile Snapshot JSON"
              className={`${control} min-h-[22rem] resize-y font-mono text-[0.6875rem] leading-5`}
              value={editor}
              disabled={saving}
              onChange={(event) => setEditor(event.target.value)}
            />
          </label>
          <p className="mt-2 text-[0.6875rem] leading-5 text-muted-2">서버가 계약·Handler Registry·잠금 Guardrail을 다시 검증하고 ID와 Version을 부여합니다.</p>
          {failure && <div role="alert" className="mt-3 rounded border border-[#ead2d2] bg-fail-bg px-3 py-2 text-[0.71875rem] text-fail-fg">{failure}</div>}
          {notice && <div role="status" className="mt-3 rounded border border-[#cfe8db] bg-ok-bg px-3 py-2 text-[0.71875rem] text-ok-fg">{notice}</div>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={primaryButton} disabled={!editor || saving} onClick={() => void saveDraft()}>불변 버전 저장</button>
            <button type="button" className={secondaryButton} disabled={!selectedVersion || selectedVersion.status !== 'DRAFT' || saving} onClick={() => void activateSelected()}>선택 DRAFT 활성화</button>
          </div>
        </div>
      </article>
    </div>
  </section>
}

function toAuthoringSnapshot(snapshot: ProfileVersion['snapshot']): ProfileAuthoringSnapshot {
  return {
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    config: snapshot.config,
    modelBindings: snapshot.modelBindings,
    toolPolicy: snapshot.toolPolicy,
    guardrailProfileKey: snapshot.guardrailProfileKey,
  }
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-line-soft bg-sub p-3">
    <small className="block text-[0.6875rem] text-muted-2">{label}</small>
    <b className="mt-1 block text-[0.78125rem] font-semibold text-body">{value}</b>
  </div>
}

function ProviderModelPanel({ api }: { api: AgentSettingsApiClient }) {
  const [csrfToken, setCsrfToken] = useState('')
  const [statuses, setStatuses] = useState<ProviderCredentialStatus[]>([])
  const [credentials, setCredentials] = useState<Record<ModelProvider, string>>({ OPENAI: '', ANTHROPIC: '', GOOGLE_GENAI: '' })
  const [busyProvider, setBusyProvider] = useState<ModelProvider | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    api.listProviderCredentials()
      .then((overview) => {
        if (!mounted) return
        setCsrfToken(overview.csrfToken)
        setStatuses(overview.providers)
        setError('')
      })
      .catch((failure: unknown) => {
        if (mounted) setError(describeFailure(failure))
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [api])

  function replaceStatus(next: ProviderCredentialStatus) {
    setStatuses((current) => current.some((item) => item.provider === next.provider)
      ? current.map((item) => item.provider === next.provider ? next : item)
      : [...current, next])
  }

  async function save(provider: typeof providerCards[number]) {
    const credential = credentials[provider.id]
    if (credential.length < 8) {
      setError(`${provider.name} API Key는 8자 이상 입력하세요.`)
      return
    }
    setBusyProvider(provider.id)
    setError('')
    setNotice('')
    try {
      const status = await api.storeProviderCredential(provider.id, credential, csrfToken)
      replaceStatus(status)
      setCredentials((current) => ({ ...current, [provider.id]: '' }))
      setNotice(`${provider.name} API Key를 암호화 저장했습니다. 원문은 다시 표시하지 않습니다.`)
    } catch (failure) {
      setError(describeFailure(failure))
    } finally {
      setBusyProvider(null)
    }
  }

  async function testConnection(provider: typeof providerCards[number], current: ProviderCredentialStatus) {
    setBusyProvider(provider.id)
    setError('')
    setNotice('')
    try {
      const result = await api.testProviderCredential(provider.id, csrfToken)
      replaceStatus({ ...current, state: result.state, lastTestedAt: result.testedAt })
      setNotice(`${provider.name} 연결 테스트 결과: ${providerStatePresentation[result.state].label} · ${result.safeCode}.`)
    } catch (failure) {
      setError(describeFailure(failure))
    } finally {
      setBusyProvider(null)
    }
  }

  async function remove(provider: typeof providerCards[number]) {
    if (!window.confirm(`${provider.name} API Key를 삭제할까요? 해당 Provider 호출은 즉시 중단됩니다.`)) return
    setBusyProvider(provider.id)
    setError('')
    setNotice('')
    try {
      replaceStatus(await api.deleteProviderCredential(provider.id, csrfToken))
      setCredentials((current) => ({ ...current, [provider.id]: '' }))
      setNotice(`${provider.name} API Key를 삭제했습니다.`)
    } catch (failure) {
      setError(describeFailure(failure))
    } finally {
      setBusyProvider(null)
    }
  }

  return <section id="agent-settings-panel-provider" role="tabpanel" aria-labelledby="agent-settings-tab-provider">
    <Callout tone="warn" icon="triangle-alert">
      API Key는 이 입력창에서 저장 요청에만 사용되고 다시 조회되지 않습니다. 연결 테스트는 Provider에 최소 추론 요청을 보내므로 계정 상태에 따라 과금될 수 있습니다.
    </Callout>
    {error && <div role="alert" className="mt-3 rounded-md border border-[#f0d5d1] bg-fail-bg px-3 py-2 text-xs text-fail-fg">{error}</div>}
    {notice && <div className="mt-3"><Callout tone="ok" icon="check-check">{notice}</Callout></div>}
    <section className={`${panel} mt-3`}>
      <PanelTitle title="Provider Credential" sub="dev 로컬 Secret Store · 최고관리자 전용 · AES-GCM 암호화 저장">
        <Badge tone={loading ? 'wait' : 'ok'} dot={false}>{loading ? '상태 조회 중' : '실제 API 연결'}</Badge>
      </PanelTitle>
      <div className="grid gap-3 p-4 md:grid-cols-3">
        {providerCards.map((provider) => {
          const status = statuses.find((item) => item.provider === provider.id)
          const presentation = status?.configured && status.state
            ? providerStatePresentation[status.state]
            : { label: '미등록', tone: 'idle' as Tone }
          const busy = busyProvider === provider.id
          return <article key={provider.id} className="rounded-md border border-line-soft bg-white p-4">
            <div className="flex items-center gap-[0.625rem]">
              <span className={`grid h-8 w-8 place-items-center rounded-md text-xs font-bold ${provider.skin}`}>{provider.initial}</span>
              <span className="min-w-0 flex-1">
                <b className="block text-[0.8125rem] font-semibold">{provider.name}</b>
                <small className="block text-[0.6875rem] text-muted-2">{provider.model}</small>
              </span>
              <Badge tone={presentation.tone}>{presentation.label}</Badge>
            </div>
            <div className="mt-4 min-h-9 text-[0.6875rem] leading-5 text-muted-2">
              {status?.configured
                ? <>암호화 지문 <span className="font-mono text-body">...{status.fingerprintSuffix}</span>{status.lastTestedAt && <span className="block">마지막 테스트 {new Date(status.lastTestedAt).toLocaleString('ko-KR')}</span>}</>
                : '저장된 Key가 없습니다.'}
            </div>
            <label className="mt-3 block text-[0.71875rem] font-semibold text-body">
              {provider.name} API Key
              <input
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                minLength={8}
                maxLength={4096}
                className={control}
                value={credentials[provider.id]}
                placeholder={status?.configured ? '새 Key 입력 시 교체' : 'API Key 입력'}
                disabled={loading || busyProvider !== null}
                onChange={(event) => setCredentials((current) => ({ ...current, [provider.id]: event.target.value }))}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={primaryButton} disabled={loading || busyProvider !== null || !csrfToken} onClick={() => void save(provider)}>
                {busy ? '처리 중' : status?.configured ? 'Key 교체' : 'Key 저장'}
              </button>
              {status?.configured && <button type="button" className={secondaryButton} disabled={busyProvider !== null || !csrfToken} onClick={() => void testConnection(provider, status)}>연결 테스트</button>}
              {status?.configured && <button type="button" className={dangerButton} disabled={busyProvider !== null || !csrfToken} onClick={() => void remove(provider)}>Key 삭제</button>}
            </div>
          </article>
        })}
      </div>
    </section>
  </section>
}

function WorkflowPanel() {
  const [nodes, setNodes] = useState(initialNodes)
  const [edges, setEdges] = useState(initialEdges)
  const [selectedId, setSelectedId] = useState('n2')
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [status, setStatus] = useState('Node를 선택하거나 Palette에서 추가하세요.')
  const nextId = useRef(6)
  const drag = useRef<{ id: string; pointerX: number; pointerY: number; x: number; y: number; moved: boolean } | null>(null)
  const ignoreClick = useRef<string | null>(null)
  const selected = nodes.find((node) => node.id === selectedId) ?? null

  function addNode(type: NodeType) {
    const info = nodeTypes[type]
    const count = nodes.filter((node) => node.type === type).length + 1
    const id = `n${nextId.current++}`
    const node: WorkflowNode = {
      id,
      type,
      name: `${info.label} ${count}`,
      x: 48 + ((nodes.length * 72) % 650),
      y: 76 + ((nodes.length * 94) % 390),
      model: models[0],
      tools: type === 'agent' ? ['read_file'] : type === 'tool' ? ['run_check'] : [],
    }
    setNodes((current) => [...current, node])
    setSelectedId(id)
    setConnectFrom(null)
    setStatus(`${info.label} Node를 추가했습니다.`)
  }

  function selectNode(id: string) {
    if (ignoreClick.current === id) { ignoreClick.current = null; return }
    if (connectFrom && connectFrom !== id) {
      const source = nodes.find((node) => node.id === connectFrom)
      const target = nodes.find((node) => node.id === id)
      setEdges((current) => current.some((edge) => edge.from === connectFrom && edge.to === id) ? current : [...current, { from: connectFrom, to: id }])
      setConnectFrom(null)
      setSelectedId(id)
      setStatus(`${source?.name ?? 'Node'} → ${target?.name ?? 'Node'} 연결을 추가했습니다.`)
      return
    }
    setSelectedId(id)
    setStatus(`${nodes.find((node) => node.id === id)?.name ?? 'Node'}를 선택했습니다.`)
  }

  function updateSelected(patch: Partial<WorkflowNode>) {
    if (!selected) return
    setNodes((current) => current.map((node) => node.id === selected.id ? { ...node, ...patch } : node))
  }

  function deleteSelected() {
    if (!selected) return
    if (selected.type === 'guardrail') {
      setStatus('잠금 Guardrail은 Snapshot 계약 때문에 삭제할 수 없습니다.')
      return
    }
    const remaining = nodes.filter((node) => node.id !== selected.id)
    setNodes(remaining)
    setEdges((current) => current.filter((edge) => edge.from !== selected.id && edge.to !== selected.id))
    setSelectedId(remaining[0]?.id ?? '')
    setConnectFrom(null)
    setStatus(`${selected.name} Node를 삭제했습니다.`)
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, node: WorkflowNode) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { id: node.id, pointerX: event.clientX, pointerY: event.clientY, x: node.x, y: node.y, moved: false }
    setSelectedId(node.id)
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const active = drag.current
    if (!active) return
    const deltaX = event.clientX - active.pointerX
    const deltaY = event.clientY - active.pointerY
    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) active.moved = true
    setNodes((current) => current.map((node) => node.id === active.id
      ? { ...node, x: Math.max(12, Math.min(730, active.x + deltaX)), y: Math.max(12, Math.min(470, active.y + deltaY)) }
      : node))
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>, node: WorkflowNode) {
    const active = drag.current
    if (!active) return
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)
    drag.current = null
    if (active.moved) {
      ignoreClick.current = node.id
      setNodes((current) => [...current].sort((left, right) => left.y - right.y || left.x - right.x))
      setStatus(`${node.name} Node 위치와 순서를 변경했습니다.`)
    }
  }

  const relatedEdges = selected ? edges.filter((edge) => edge.from === selected.id || edge.to === selected.id) : []

  return <section id="agent-settings-panel-workflow" role="tabpanel" aria-labelledby="agent-settings-tab-workflow">
    <Callout tone="warn" icon="triangle-alert">
      현재 Snapshot Node 유형을 기준으로 한 공통 실행 골격입니다. Approval·Check 공통 Handler와 MCP 실행은 아직 production Runtime에 연결되지 않았으며, 편집 결과는 저장하거나 실행하지 않습니다.
    </Callout>
    <div className={`${panel} mt-3 grid min-h-[39rem] overflow-hidden xl:grid-cols-[13rem_minmax(0,1fr)_17rem]`}>
      <aside className="border-b border-line-soft bg-sub p-4 xl:border-b-0 xl:border-r" aria-label="Node Palette">
        <b className="text-[0.84375rem] font-semibold">Node Palette</b>
        <small className="mt-1 block text-[0.6875rem] text-muted-2">클릭하여 Canvas에 추가</small>
        <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-1">
          {(Object.keys(nodeTypes) as NodeType[]).map((type) => {
            const info = nodeTypes[type]
            return <button key={type} type="button" className="flex items-center gap-2 rounded-md border border-btn-line bg-white px-3 py-[0.625rem] text-left text-xs font-semibold hover:bg-page" onClick={() => addNode(type)}>
              <span className={`grid h-6 w-6 place-items-center rounded ${info.skin}`}><Icon name={info.icon} size={13} /></span>
              {info.label}
            </button>
          })}
        </div>
        <div className="mt-4"><Badge tone="wait" dot={false}>임시 목업</Badge></div>
      </aside>

      <div className="min-w-0 bg-[#f8fafc]">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-white px-4 py-3">
          <b className="text-[0.8125rem] font-semibold">공통 Runtime 골격</b>
          <Tag>Drag &amp; Drop</Tag><Tag>로컬 상태</Tag>
          <span className="ml-auto text-[0.6875rem] text-muted-2">Node {nodes.length} · 연결 {edges.length}</span>
        </div>
        <div className="overflow-auto p-3">
          <div className="relative h-[35rem] min-w-[56rem] overflow-hidden rounded-md border border-line bg-[radial-gradient(circle,#dfe5eb_1px,transparent_1px)] [background-size:18px_18px]" aria-label="Node 편집 Canvas">
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 896 560" preserveAspectRatio="none" aria-hidden="true">
              {edges.map((edge) => {
                const from = nodes.find((node) => node.id === edge.from)
                const to = nodes.find((node) => node.id === edge.to)
                if (!from || !to) return null
                const x1 = from.x + 152
                const y1 = from.y + 36
                const x2 = to.x
                const y2 = to.y + 36
                const bend = Math.max(42, Math.abs(x2 - x1) * 0.45)
                return <path key={`${edge.from}-${edge.to}`} d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`} fill="none" stroke="var(--primary)" strokeWidth="2" opacity=".62" />
              })}
            </svg>

            {nodes.map((node, index) => {
              const info = nodeTypes[node.type]
              const active = selectedId === node.id
              const source = connectFrom === node.id
              return <article
                key={node.id}
                aria-label={`${node.name} Node`}
                className={`absolute w-[9.5rem] rounded-md border bg-white p-[0.625rem] shadow-[0_5px_14px_#1426381f] ${active ? 'border-primary ring-2 ring-accent/45' : source ? 'border-wait-dot ring-2 ring-wait-bg' : 'border-line'}`}
                style={{ left: node.x, top: node.y }}
                onClick={() => selectNode(node.id)}
              >
                <span className="absolute -left-[0.25rem] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-primary bg-white" aria-hidden="true" />
                <span className="absolute -right-[0.25rem] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-primary bg-white" aria-hidden="true" />
                <button
                  type="button"
                  aria-label={`${node.name} Node 이동`}
                  className="flex w-full cursor-grab touch-none items-center gap-2 bg-transparent p-0 text-left active:cursor-grabbing"
                  onPointerDown={(event) => startDrag(event, node)}
                  onPointerMove={moveDrag}
                  onPointerUp={(event) => endDrag(event, node)}
                  onPointerCancel={(event) => endDrag(event, node)}
                >
                  <span className={`grid h-6 w-6 place-items-center rounded ${info.skin}`}><Icon name={info.icon} size={13} /></span>
                  <span className="min-w-0 flex-1 truncate text-[0.75rem] font-semibold">{node.name}</span>
                </button>
                <div className="mt-2 flex items-center gap-2 text-[0.625rem] text-muted-2">
                  <span className="truncate">{info.meta}</span><span className="ml-auto shrink-0">순서 {index + 1}</span>
                </div>
              </article>
            })}
          </div>
        </div>
        <div className="border-t border-line-soft bg-white px-4 py-2 text-[0.6875rem] text-muted" aria-live="polite">{status}</div>
      </div>

      <aside className="border-t border-line-soft bg-white p-4 xl:border-l xl:border-t-0" aria-label="선택 Node 설정">
        <b className="text-[0.84375rem] font-semibold">Node 설정</b>
        {!selected && <p className="mt-3 text-xs text-muted-2">Node를 선택하세요.</p>}
        {selected && <div className="mt-3">
          <label className="block text-[0.71875rem] font-semibold text-body">이름
            <input aria-label="선택 Node 이름" className={control} value={selected.name} onChange={(event) => updateSelected({ name: event.target.value || nodeTypes[selected.type].label })} />
          </label>
          <label className="mt-3 block text-[0.71875rem] font-semibold text-body">유형
            <select aria-label="선택 Node 유형" className={control} value={selected.type} disabled={selected.type === 'guardrail'} title={selected.type === 'guardrail' ? '잠금 Guardrail의 유형은 변경할 수 없습니다.' : undefined} onChange={(event) => updateSelected({ type: event.target.value as NodeType })}>
              {(Object.keys(nodeTypes) as NodeType[]).map((type) => <option key={type} value={type}>{nodeTypes[type].label}</option>)}
            </select>
          </label>

          {selected.type === 'agent' && <div className="mt-3 border-t border-row-line pt-3">
            <label className="block text-[0.71875rem] font-semibold text-body">배치 Model
              <select aria-label="선택 Agent Model" className={control} value={selected.model} onChange={(event) => updateSelected({ model: event.target.value })}>
                {models.map((model) => <option key={model}>{model}</option>)}
              </select>
            </label>
            <fieldset className="mt-3">
              <legend className="text-[0.71875rem] font-semibold text-body">허용 Tool</legend>
              <div className="mt-2 space-y-2">
                {fixedTools.map((tool) => <label key={tool} className="flex items-center gap-2 text-[0.6875rem] text-body">
                  <input type="checkbox" checked={selected.tools.includes(tool)} onChange={() => updateSelected({ tools: selected.tools.includes(tool) ? selected.tools.filter((item) => item !== tool) : [...selected.tools, tool] })} />
                  <code>{tool}</code>
                </label>)}
              </div>
            </fieldset>
          </div>}

          {selected.type === 'tool' && <label className="mt-3 block text-[0.71875rem] font-semibold text-body">고정 MCP Tool
            <select aria-label="선택 MCP Tool" className={control} value={selected.name} onChange={(event) => updateSelected({ name: event.target.value, tools: [event.target.value] })}>
              {fixedTools.map((tool) => <option key={tool}>{tool}</option>)}
            </select>
          </label>}

          {(selected.type === 'approval' || selected.type === 'check') && <div className="mt-3"><Badge tone="wait" dot={false}>공통 Handler 연결 전</Badge></div>}
          {selected.type === 'guardrail' && <div className="mt-3 text-[0.6875rem] leading-5 text-muted-2"><Badge tone="idle" dot={false}>Snapshot 잠금 계약</Badge><p className="mt-2">Guardrail은 삭제하거나 비활성화할 수 없습니다.</p></div>}

          <div className="mt-4 grid gap-2">
            <button type="button" className={connectFrom === selected.id ? secondaryButton : primaryButton} onClick={() => {
              if (connectFrom === selected.id) {
                setConnectFrom(null); setStatus('Node 연결 선택을 취소했습니다.')
              } else {
                setConnectFrom(selected.id); setStatus(`${selected.name}에서 연결할 대상 Node를 선택하세요.`)
              }
            }}>{connectFrom === selected.id ? '연결 선택 취소' : '이 Node에서 연결'}</button>
            <button type="button" className={dangerButton} disabled={selected.type === 'guardrail'} title={selected.type === 'guardrail' ? '잠금 Guardrail은 삭제할 수 없습니다.' : undefined} onClick={deleteSelected}>Node 삭제</button>
          </div>

          <div className="mt-4 border-t border-row-line pt-3">
            <b className="text-[0.71875rem] font-semibold">연결</b>
            {relatedEdges.length === 0 && <p className="mt-2 text-[0.6875rem] text-muted-2">연결 없음</p>}
            <div className="mt-2 space-y-2">
              {relatedEdges.map((edge) => {
                const outgoing = edge.from === selected.id
                const other = nodes.find((node) => node.id === (outgoing ? edge.to : edge.from))
                return <div key={`${edge.from}-${edge.to}`} className="flex items-center gap-2 rounded border border-line-soft bg-sub px-2 py-[0.4375rem] text-[0.6875rem]">
                  <span className="min-w-0 flex-1 truncate">{outgoing ? '→' : '←'} {other?.name ?? 'Unknown'}</span>
                  <button type="button" className="font-semibold text-fail-fg" aria-label={`${other?.name ?? 'Node'} 연결 해제`} onClick={() => {
                    setEdges((current) => current.filter((item) => item !== edge)); setStatus('Node 연결을 해제했습니다.')
                  }}>해제</button>
                </div>
              })}
            </div>
          </div>
        </div>}
      </aside>
    </div>
  </section>
}

function PolicyPanel() {
  return <section id="agent-settings-panel-policy" role="tabpanel" aria-labelledby="agent-settings-tab-policy">
    <Callout tone="warn" icon="triangle-alert">
      상세 Tool·보안 정책 편집 화면을 제공하지 않습니다. 현재 production Runtime에서 확인되는 공통 계약과 미연결 범위만 표시합니다.
    </Callout>
    <div className="mt-3 grid items-stretch gap-[0.875rem] xl:grid-cols-3">
      <RuntimeStatusCard
        title="Job·Queue·Snapshot"
        tone="ok"
        state="구현됨"
        description="Spring Job이 Profile Version을 고정하고 Queue에는 jobId만 전달합니다. Runner는 고정 Snapshot을 조회합니다."
      />
      <RuntimeStatusCard
        title="Approval·Check·Guardrail"
        tone="wait"
        state="연결 전"
        description="Snapshot 유형과 잠금 Guardrail 계약은 있으나 공통 production Handler 연결은 후속 작업입니다."
      />
      <RuntimeStatusCard
        title="MCP Tool 실행"
        tone="idle"
        state="미구현"
        description="Repository·Tool 실연동과 실행 정책 UI는 기능 담당 계약이 확정된 뒤 구현합니다."
      />
    </div>
  </section>
}

function RuntimeStatusCard({ title, tone, state, description }: {
  title: string
  tone: 'ok' | 'wait' | 'idle'
  state: string
  description: string
}) {
  return <article className={panel}>
    <PanelTitle title={title}><Badge tone={tone} dot={tone !== 'idle'}>{state}</Badge></PanelTitle>
    <p className="p-4 text-[0.71875rem] leading-6 text-muted-2">{description}</p>
  </article>
}

function UsagePanel() {
  return <section id="agent-settings-panel-usage" role="tabpanel" aria-labelledby="agent-settings-tab-usage">
    <Callout tone="warn" icon="triangle-alert">
      현재 사용량·평가·Trace 조회 API가 없어 수치나 품질 점수를 표시하지 않습니다.
    </Callout>
    <div className="grid items-start gap-[0.875rem] xl:grid-cols-3">
      <RuntimeStatusCard title="사용량" tone="idle" state="API 없음" description="Token·호출 횟수 집계 계약이 생기면 실제 Job 기준으로 연결합니다." />
      <RuntimeStatusCard title="평가" tone="idle" state="API 없음" description="품질 지표와 Gate는 기능 담당 요구가 확정된 뒤 별도 Work로 정의합니다." />
      <RuntimeStatusCard title="관측" tone="idle" state="API 없음" description="Trace·비용·지연시간 도구는 현재 공통 Runtime 범위에 포함하지 않습니다." />
    </div>
  </section>
}

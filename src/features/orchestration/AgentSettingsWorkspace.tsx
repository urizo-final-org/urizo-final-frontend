import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { describeFailure } from '../../shared/api/error'
import {
  Badge, Callout, PageHead, PanelTitle, Tag, control, dangerButton, panel, primaryButton, secondaryButton,
  type Tone,
} from '../../shared/ui/primitives'
import type {
  AgentSettingsApiClient, ModelProvider, ProfileAuthoringSnapshot, ProfileKey, ProfileVersion,
  ObservabilityMetricsResponse, ObservabilityResponse, ObservabilityStatus, ProfileVersionApiClient,
  ProviderCredentialState, ProviderCredentialStatus,
} from './api'
import ActiveJobMonitoringPanel from './ActiveJobMonitoringPanel'
import WorkflowPanel, {
  hydrateToolBindings, normalizeModelBindings, profileToolRequirement, starterSnapshots,
  toolCatalog, toolDetails, toolRequirementLabel,
} from './WorkflowPanel'

type TabId = 'provider' | 'workflow' | 'profile' | 'policy' | 'monitoring' | 'usage'

const temporaryMockTitle = '임시 목업 · 향후 필요 시 현재 Runtime 계약 기준으로 구현'

const tabs: { id: TabId; label: string; temporary?: true }[] = [
  { id: 'provider', label: 'Provider·Model' },
  { id: 'workflow', label: 'Agent·Workflow' },
  { id: 'profile', label: '자연어 기능 Profile' },
  { id: 'policy', label: 'Tool·실행 정책' },
  { id: 'monitoring', label: '실행 모니터링' },
  { id: 'usage', label: '사용량·평가' },
]

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
    runtime: '불변 Version 고정·production Snapshot Runner 연결',
  },
  NATURAL_CMS: {
    title: 'Natural CMS',
    owner: '5번 · 자연어 CMS 관리',
    queue: 'Natural CMS',
    target: '기존 CMS Resource',
    runtime: '불변 Version 고정·production Snapshot Runner 연결',
  },
}

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
      <Badge tone="run">실제 API 연결</Badge>
      <span>Provider Key와 Agent·Workflow Profile Version은 실제 API를 사용합니다. Tool 정책은 등록된 MCP Catalog를 읽기 전용으로 표시합니다.</span>
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
    {activeTab === 'workflow' && <WorkflowPanel api={api} />}
    {activeTab === 'profile' && <NaturalFeatureProfilePanel
      api={api}
      selectedKey={selectedProfileKey}
      onSelect={setSelectedProfileKey}
    />}
    {activeTab === 'policy' && <PolicyPanel />}
    {activeTab === 'monitoring' && <ActiveJobMonitoringPanel api={api} />}
    {activeTab === 'usage' && <UsagePanel api={api} />}
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
      const normalized = normalizeModelBindings(snapshot.nodes, snapshot.modelBindings, [])
      if (normalized === null) throw new Error('MODEL_BINDING_INCOMPLETE')
      snapshot = {
        ...snapshot,
        modelBindings: normalized,
        toolBindings: hydrateToolBindings(selectedKey, snapshot.nodes, snapshot.toolBindings),
      }
    } catch {
      setFailure('Snapshot JSON과 Agent별 Provider·Model selection metadata를 확인해 주세요.')
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
            <button type="button" className={primaryButton} style={{ color: '#fff' }} disabled={!editor || saving} onClick={() => void saveDraft()}>불변 버전 저장</button>
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
    toolBindings: snapshot.toolBindings,
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
  const [overviewReady, setOverviewReady] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const statusRequest = useRef(0)

  useEffect(() => {
    void loadStatuses()
    return () => { statusRequest.current += 1 }
  }, [api])

  async function loadStatuses() {
    const request = ++statusRequest.current
    setLoading(true)
    setOverviewReady(false)
    setCsrfToken('')
    setStatuses([])
    setError('')
    setNotice('')
    try {
      const overview = await api.listProviderCredentials()
      if (request !== statusRequest.current) return null
      setCsrfToken(overview.csrfToken)
      setStatuses(overview.providers)
      setOverviewReady(true)
      return overview
    } catch (failure) {
      if (request === statusRequest.current) setError(describeFailure(failure))
      return null
    } finally {
      if (request === statusRequest.current) setLoading(false)
    }
  }

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

  async function testConnection(provider: typeof providerCards[number], testedStatus: ProviderCredentialStatus) {
    const testedFingerprint = testedStatus.fingerprintSuffix
    setBusyProvider(provider.id)
    setError('')
    setNotice('')
    try {
      const result = await api.testProviderCredential(provider.id, csrfToken)
      const overview = await loadStatuses()
      const current = overview?.providers.find((status) => status.provider === provider.id)
      if (testedFingerprint !== null
        && current?.fingerprintSuffix === testedFingerprint
        && current.state === result.state
        && current.lastTestedAt !== null) {
        setNotice(`${provider.name} 연결 테스트 결과: ${providerStatePresentation[result.state].label} · ${result.safeCode}.`)
      } else if (overview) {
        setError(`${provider.name} Key가 변경되어 이전 연결 테스트 결과를 폐기했습니다.`)
      }
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
    {error && <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-[#f0d5d1] bg-fail-bg px-3 py-2 text-xs text-fail-fg">
      <span>{error}</span>
      {!overviewReady && !loading && <button type="button" className={`${secondaryButton} ml-auto`} onClick={() => void loadStatuses()}>상태 다시 조회</button>}
    </div>}
    {notice && <div className="mt-3"><Callout tone="ok" icon="check-check">{notice}</Callout></div>}
    <section className={`${panel} mt-3`}>
      <PanelTitle title="Provider Credential" sub="dev 로컬 Secret Store · 최고관리자 전용 · AES-GCM 암호화 저장">
        <Badge tone={loading ? 'wait' : overviewReady ? 'ok' : 'fail'} dot={false}>{loading ? '상태 조회 중' : overviewReady ? '실제 API 연결' : '상태 조회 실패'}</Badge>
      </PanelTitle>
      <div className="grid gap-3 p-4 md:grid-cols-3">
        {providerCards.map((provider) => {
          const status = statuses.find((item) => item.provider === provider.id)
          const presentation = !overviewReady
            ? { label: loading ? '조회 중' : '조회 실패', tone: loading ? 'wait' as Tone : 'fail' as Tone }
            : status?.configured && status.state
            ? providerStatePresentation[status.state]
            : { label: '미등록', tone: 'idle' as Tone }
          const busy = busyProvider === provider.id
          const controlsDisabled = loading || !overviewReady || busyProvider !== null
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
              {!overviewReady
                ? loading ? '상태를 조회하고 있습니다.' : '상태를 확인하지 못했습니다.'
                : status?.configured
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
                disabled={controlsDisabled}
                onChange={(event) => setCredentials((current) => ({ ...current, [provider.id]: event.target.value }))}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={primaryButton} style={{ color: '#fff' }} disabled={controlsDisabled || !csrfToken} onClick={() => void save(provider)}>
                {busy ? '처리 중' : status?.configured ? 'Key 교체' : 'Key 저장'}
              </button>
              {status?.configured && <button type="button" className={`${secondaryButton} provider-connection-test-button`} disabled={controlsDisabled || !csrfToken} onClick={() => void testConnection(provider, status)}>연결 테스트</button>}
              {status?.configured && <button type="button" className={dangerButton} disabled={controlsDisabled || !csrfToken} onClick={() => void remove(provider)}>Key 삭제</button>}
            </div>
          </article>
        })}
      </div>
    </section>
  </section>
}

function PolicyPanel() {
  const tools = Array.from(new Set(Object.values(toolCatalog).flat()))
  return <section id="agent-settings-panel-policy" role="tabpanel" aria-labelledby="agent-settings-tab-policy">
    <Callout tone="ok" icon="shield-check">
      시스템에 등록된 MCP Tool과 Profile별 허용 상한을 읽기 전용으로 표시합니다. Server·Tool 등록·삭제와 실행 의미 변경은 제공하지 않습니다.
    </Callout>
    <section className={`${panel} mt-3`} aria-label="전체 MCP Tool 카탈로그">
      <PanelTitle title="전체 MCP Tool 카탈로그" sub={`${tools.length}개 · 고정 등록 · 읽기 전용`}>
        <Badge tone="ok" dot={false}>실행 계약 유지</Badge>
      </PanelTitle>
      <div className="divide-y divide-row-line">
        {tools.map((tool) => <article key={tool} className="grid gap-3 p-4 lg:grid-cols-[minmax(13rem,1.2fr)_minmax(11rem,1fr)_minmax(11rem,1fr)]">
          <div>
            <b className="block text-[0.75rem] font-semibold text-body">{toolDetails[tool]?.label ?? tool}</b>
            <code className="mt-1 block text-[0.625rem] text-muted-2">{tool}</code>
            <p className="mt-1 text-[0.625rem] leading-4 text-muted-2">{toolDetails[tool]?.description}</p>
          </div>
          {(Object.keys(profileCatalog) as ProfileKey[]).map((profileKey) => {
            const allowed = toolCatalog[profileKey].includes(tool)
            const requirement = allowed ? profileToolRequirement(profileKey, tool) : null
            return <div key={profileKey} className="rounded border border-line-soft bg-sub p-3" aria-label={`${profileKey} ${tool} 정책`}>
              <span className="flex flex-wrap items-center gap-2">
                <b className="text-[0.6875rem]">{profileKey}</b>
                <Badge tone={allowed ? 'ok' : 'idle'} dot={false}>{allowed ? '허용 상한' : '범위 밖'}</Badge>
              </span>
              <small className="mt-2 block text-[0.625rem] text-muted-2">{requirement === null ? '이 Profile에서는 사용할 수 없음' : toolRequirementLabel(requirement)}</small>
            </div>
          })}
        </article>)}
      </div>
    </section>
  </section>
}

type ObservabilityTab = 'node' | 'provider' | 'quality'

function defaultObservabilityRange() {
  const to = new Date()
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000)
  return { from: from.toISOString().slice(0, 16), to: to.toISOString().slice(0, 16) }
}

function utcInstant(value: string) {
  const parsed = new Date(`${value}:00.000Z`)
  if (Number.isNaN(parsed.getTime())) throw new Error('UTC 조회 기간을 확인해 주세요.')
  return parsed.toISOString()
}

function shown(value: string | number | null) {
  return value === null ? '제공되지 않음' : String(value)
}

function availability(status: ObservabilityStatus, count: number) {
  if (status === 'DISABLED') return { label: '관측 연결 안 됨', tone: 'idle' as Tone }
  if (status === 'UNAVAILABLE') return { label: '관측 일시 사용 불가', tone: 'fail' as Tone }
  if (count === 0) return { label: '관측 대기', tone: 'wait' as Tone }
  return { label: '연결됨', tone: 'ok' as Tone }
}

function UsagePanel({ api }: { api: AgentSettingsApiClient }) {
  const initialRange = useRef(defaultObservabilityRange())
  const [activeTab, setActiveTab] = useState<ObservabilityTab>('node')
  const [fromInput, setFromInput] = useState(initialRange.current.from)
  const [toInput, setToInput] = useState(initialRange.current.to)
  const [jobInput, setJobInput] = useState('')
  const [query, setQuery] = useState(() => ({
    from: utcInstant(initialRange.current.from), to: utcInstant(initialRange.current.to), jobId: '',
    kind: 'NODE' as 'NODE' | 'PROVIDER', cursors: [undefined] as (string | undefined)[], page: 0,
  }))
  const [metrics, setMetrics] = useState<ObservabilityMetricsResponse | null>(null)
  const [observations, setObservations] = useState<ObservabilityResponse | null>(null)
  const [loadedAt, setLoadedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)

  function load() {
    try {
      const from = utcInstant(fromInput)
      const to = utcInstant(toInput)
      if (from >= to) throw new Error('UTC 조회 종료 시각은 시작 시각보다 뒤여야 합니다.')
      const jobId = jobInput.trim().toLowerCase()
      if (jobId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(jobId)) {
        throw new Error('Job ID는 전체 UUID를 입력해 주세요.')
      }
      setQuery({ from, to, jobId, kind: activeTab === 'provider' ? 'PROVIDER' : 'NODE', cursors: [undefined], page: 0 })
    } catch (error) {
      setFailure(describeFailure(error))
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setFailure(null)
    setMetrics(null)
    setObservations(null)
    const fetchPage = async () => {
      try {
        const [nextMetrics, nextObservations] = await Promise.all([
          api.getObservabilityMetrics(query.from, query.to, query.jobId || undefined, controller.signal),
          api.getObservations(query.from, query.to, {
            jobId: query.jobId || undefined, kind: query.kind, limit: 50, cursor: query.cursors[query.page],
          }, controller.signal),
        ])
        if (controller.signal.aborted) return
        if (nextMetrics.from !== nextObservations.from || nextMetrics.to !== nextObservations.to
          || nextMetrics.environment !== nextObservations.environment || nextMetrics.environment !== 'local') {
          throw new Error('관측 응답의 UTC 기간 또는 환경이 일치하지 않습니다.')
        }
        setMetrics(nextMetrics)
        setObservations(nextObservations)
        setLoadedAt(new Date().toISOString())
      } catch (error) {
        if (!controller.signal.aborted) setFailure(describeFailure(error))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void fetchPage()
    return () => controller.abort()
  }, [api, query])

  function selectTab(tab: ObservabilityTab) {
    setActiveTab(tab)
    if (tab !== 'quality') {
      const kind = tab === 'provider' ? 'PROVIDER' : 'NODE'
      if (kind !== query.kind) setQuery((current) => ({ ...current, kind, cursors: [undefined], page: 0 }))
    }
  }

  const nodeRows = observations?.observations.filter((row) => row.name !== 'axms.model') ?? []
  const providerRows = observations?.observations.filter((row) => row.name === 'axms.model') ?? []
  const nodeAvailability = observations && availability(observations.status, nodeRows.length)
  const providerAvailability = metrics && availability(metrics.status, metrics.rows.length)
  const providerDetailAvailability = observations && availability(observations.status, providerRows.length)
  const tabs: { id: ObservabilityTab; label: string }[] = [
    { id: 'node', label: 'Node 계측' },
    { id: 'provider', label: 'Provider 계측' },
    { id: 'quality', label: '품질 평가' },
  ]

  return <section id="agent-settings-panel-usage" role="tabpanel" aria-labelledby="agent-settings-tab-usage">
    <section className={panel}>
      <PanelTitle title="총괄 상세 대시보드">
        <Badge tone={loading ? 'wait' : failure ? 'fail' : 'ok'} dot={false}>
          {loading ? '조회 중' : failure ? '조회 실패' : 'environment=local'}
        </Badge>
      </PanelTitle>
      <form className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); void load() }}>
        <label className="text-[0.6875rem] font-semibold text-body">
          조회 시작 UTC
          <input aria-label="조회 시작 UTC" className={`${control} mt-1`} type="datetime-local" required disabled={loading} value={fromInput} onChange={(event) => setFromInput(event.target.value)} />
        </label>
        <label className="text-[0.6875rem] font-semibold text-body">
          조회 종료 UTC
          <input aria-label="조회 종료 UTC" className={`${control} mt-1`} type="datetime-local" required disabled={loading} value={toInput} onChange={(event) => setToInput(event.target.value)} />
        </label>
        <button type="submit" className={`${secondaryButton} self-end`} disabled={loading}>{loading ? '조회 중' : '새로고침'}</button>
      </form>
      <form className="flex flex-wrap items-end gap-2 border-t border-line-soft px-4 py-3" onSubmit={(event) => { event.preventDefault(); load() }}>
        <label className="min-w-0 flex-1 text-[0.6875rem] font-semibold text-body">
          Job ID 검색
          <input aria-label="Job ID 검색" className={`${control} mt-1 font-mono`} placeholder="전체 Job ID · 비워두면 전체 조회" maxLength={36} value={jobInput} disabled={loading} onChange={(event) => setJobInput(event.target.value)} />
        </label>
        <button type="submit" className={secondaryButton} disabled={loading}>검색</button>
      </form>
      <div className="border-t border-line-soft px-4 py-3 text-[0.6875rem] leading-5 text-muted-2">
        {metrics && observations
          ? <>기간 <span className="font-mono text-body">{metrics.from}</span> — <span className="font-mono text-body">{metrics.to}</span> · 환경 <b className="text-body">{metrics.environment}</b> · Job <span className="break-all font-mono text-body">{query.jobId || '전체'}</span>{loadedAt && <> · 조회 완료 <span className="font-mono text-body">{loadedAt}</span></>}</>
          : 'Metrics와 Observations에 같은 UTC 기간과 environment=local 필터를 적용합니다.'}
      </div>
    </section>

    {failure && <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-[#f0d5d1] bg-fail-bg px-3 py-2 text-xs text-fail-fg">
      <span>{failure}</span>
      <button type="button" className={`${secondaryButton} ml-auto`} disabled={loading} onClick={() => setQuery((current) => ({ ...current }))}>다시 조회</button>
    </div>}

    <div className="mt-4 flex gap-2 border-b border-line" role="tablist" aria-label="사용량·평가 상세 영역">
      {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id}
        className={`px-3 pb-2 text-[0.75rem] ${activeTab === tab.id ? 'font-semibold text-ink shadow-[inset_0_-2px_var(--primary)]' : 'text-muted'}`}
        onClick={() => selectTab(tab.id)}>{tab.label}</button>)}
    </div>

    {loading && <div className="mt-3"><Callout tone="warn" icon="loader-circle">Node와 Provider 계측을 조회하고 있습니다.</Callout></div>}

    {!loading && activeTab === 'node' && observations && <section className={`${panel} mt-3`} aria-label="Node 계측 결과">
      <PanelTitle title="Node 계측"><Badge tone={nodeAvailability?.tone ?? 'idle'}>{nodeAvailability?.label ?? '관측 대기'}</Badge></PanelTitle>
      <p className="border-t border-line-soft px-4 py-2 text-[0.6875rem] text-muted-2">선택한 조건의 Node·Tool·Check 관측 · 페이지당 최대 50건 · 최신순</p>
      {nodeRows.length === 0
        ? <p className="p-4 text-[0.71875rem] text-muted-2">{observations.status === 'AVAILABLE' ? '이번 조회 결과에 Node·Tool·Check 관측이 없습니다.' : observations.errorCode ?? '관측 연결 상태를 확인해 주세요.'}</p>
        : <div className="overflow-x-auto"><table className="w-full min-w-[46rem] text-left text-[0.6875rem]"><thead className="bg-sub text-muted-2"><tr><th className="px-3 py-2">관측</th><th className="px-3 py-2">Job / Node</th><th className="px-3 py-2">상태 / Attempt</th><th className="px-3 py-2">지연시간</th><th className="px-3 py-2">시작 UTC</th></tr></thead><tbody>
          {nodeRows.map((row) => <tr key={row.id} className="border-t border-line-soft"><td className="px-3 py-2 font-mono">{row.name}</td><td className="px-3 py-2"><span className="block">{shown(row.metadata.jobId)}</span><span className="font-mono text-muted-2">{shown(row.metadata.nodeId)}</span></td><td className="px-3 py-2">{shown(row.metadata.nodeStatus ?? row.metadata.toolStatus ?? row.metadata.checkStatus ?? row.level)} / {shown(row.metadata.attempt)}</td><td className="px-3 py-2">{row.latencyMs === null ? '제공되지 않음' : `${row.latencyMs} ms`}</td><td className="px-3 py-2 font-mono">{row.startTime}</td></tr>)}
        </tbody></table></div>}
    </section>}

    {!loading && activeTab === 'provider' && metrics && <section className={`${panel} mt-3`} aria-label="Provider 계측 결과">
      <PanelTitle title="Provider 계측"><Badge tone={providerAvailability?.tone ?? 'idle'}>{providerAvailability?.label ?? '관측 대기'}</Badge></PanelTitle>
      {metrics.rows.length === 0
        ? <p className="p-4 text-[0.71875rem] text-muted-2">{metrics.status === 'AVAILABLE' ? '선택한 기간의 실제 Provider 호출 계측이 아직 없습니다.' : metrics.errorCode ?? '관측 연결 상태를 확인해 주세요.'}</p>
        : <div className="overflow-x-auto"><table className="w-full min-w-[52rem] text-left text-[0.6875rem]"><thead className="bg-sub text-muted-2"><tr><th className="px-3 py-2">Model</th><th className="px-3 py-2">호출</th><th className="px-3 py-2">입력 Token</th><th className="px-3 py-2">출력 Token</th><th className="px-3 py-2">전체 Token</th><th className="px-3 py-2">Langfuse 비용</th><th className="px-3 py-2">P50 / P95</th></tr></thead><tbody>
          {metrics.rows.map((row, index) => <tr key={`${row.model ?? 'unknown'}-${index}`} className="border-t border-line-soft"><td className="px-3 py-2 font-mono">{shown(row.model)}</td><td className="px-3 py-2">{shown(row.observationCount)}</td><td className="px-3 py-2">{shown(row.inputTokens)}</td><td className="px-3 py-2">{shown(row.outputTokens)}</td><td className="px-3 py-2">{shown(row.totalTokens)}</td><td className="px-3 py-2">{shown(row.totalCost)}</td><td className="px-3 py-2">{row.p50LatencyMs === null ? '제공되지 않음' : `${row.p50LatencyMs} ms`} / {row.p95LatencyMs === null ? '제공되지 않음' : `${row.p95LatencyMs} ms`}</td></tr>)}
        </tbody></table></div>}
      {observations && <div className="border-t border-line-soft">
        <div className="flex items-center justify-between gap-2 bg-sub px-3 py-2"><b className="text-[0.6875rem]">실제 Provider 호출</b><Badge tone={providerDetailAvailability?.tone ?? 'idle'} dot={false}>{providerDetailAvailability?.label ?? '관측 대기'}</Badge></div>
        <p className="border-t border-line-soft px-4 py-2 text-[0.6875rem] text-muted-2">선택한 조건의 Provider 관측 · 페이지당 최대 50건 · 최신순 · 상단 집계는 전체 조회 기간 기준</p>
        {providerRows.length === 0
          ? <p className="p-4 text-[0.71875rem] text-muted-2">{observations.status === 'AVAILABLE' ? '이번 조회 결과에 실제 Provider 호출 Observation이 없습니다.' : observations.errorCode ?? '관측 연결 상태를 확인해 주세요.'}</p>
          : <div className="overflow-x-auto"><table className="w-full min-w-[56rem] text-left text-[0.6875rem]"><thead className="bg-sub text-muted-2"><tr><th className="px-3 py-2">Provider / Model</th><th className="px-3 py-2">Job / Node</th><th className="px-3 py-2">OTel Trace</th><th className="px-3 py-2">입력 / 출력 Token</th><th className="px-3 py-2">지연시간</th></tr></thead><tbody>
            {providerRows.map((row) => <tr key={row.id} className="border-t border-line-soft"><td className="px-3 py-2"><span className="block">{shown(row.metadata.provider)}</span><span className="font-mono text-muted-2">{shown(row.metadata.model ?? row.model)}</span></td><td className="px-3 py-2"><span className="block">{shown(row.metadata.jobId)}</span><span className="font-mono text-muted-2">{shown(row.metadata.nodeId)}</span></td><td className="px-3 py-2 font-mono">{row.traceId}</td><td className="px-3 py-2">{shown(row.inputTokens)} / {shown(row.outputTokens)}</td><td className="px-3 py-2">{row.latencyMs === null ? '제공되지 않음' : `${row.latencyMs} ms`}</td></tr>)}
          </tbody></table></div>}
      </div>}
    </section>}

    {activeTab !== 'quality' && <nav className="mt-3 flex flex-wrap items-center justify-end gap-2 text-xs text-muted-2" aria-label="관측 페이지 이동">
      <span aria-live="polite">{query.page + 1} 페이지{!loading && observations && ` · 현재 ${(query.kind === 'NODE' ? nodeRows : providerRows).length}건`}</span>
      <button type="button" className={secondaryButton} disabled={loading || query.page === 0} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}>이전</button>
      <button type="button" className={secondaryButton} disabled={loading || !!failure || !observations?.nextCursor || observations.status !== 'AVAILABLE'} onClick={() => {
        const cursor = observations?.nextCursor
        if (cursor) setQuery((current) => ({ ...current, page: current.page + 1, cursors: [...current.cursors.slice(0, current.page + 1), cursor] }))
      }}>다음</button>
    </nav>}

    {!loading && activeTab === 'quality' && <section className={`${panel} mt-3`} aria-label="품질 평가 결과">
      <PanelTitle title="품질 평가"><Badge tone="idle" dot={false}>평가 미설정</Badge></PanelTitle>
      <p className="p-4 text-[0.71875rem] leading-6 text-muted-2">평가가 아직 설정되지 않았습니다.</p>
    </section>}
  </section>
}

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { describeFailure } from '../../shared/api/error'
import {
  Badge, Callout, PageHead, PanelTitle, Tag, control, dangerButton, panel, primaryButton, secondaryButton,
  type Tone,
} from '../../shared/ui/primitives'
import type {
  AgentSettingsApiClient, ModelProvider, ProfileAuthoringSnapshot, ProfileKey, ProfileVersion,
  ProfileVersionApiClient, ProviderCredentialState, ProviderCredentialStatus,
} from './api'
import WorkflowPanel, { starterSnapshots } from './WorkflowPanel'

type TabId = 'provider' | 'workflow' | 'profile' | 'policy' | 'usage'

const temporaryMockTitle = '임시 목업 · 향후 필요 시 현재 Runtime 계약 기준으로 구현'

const tabs: { id: TabId; label: string; temporary?: true }[] = [
  { id: 'provider', label: 'Provider·Model' },
  { id: 'workflow', label: 'Agent·Workflow' },
  { id: 'profile', label: '자연어 기능 Profile' },
  { id: 'policy', label: 'Tool·실행 정책', temporary: true },
  { id: 'usage', label: '사용량·평가', temporary: true },
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
      <span>Provider Key와 Agent·Workflow Profile Version은 실제 API를 사용합니다. Tool 정책 상세 화면과 사용량·평가는 별도 범위입니다.</span>
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
              <button type="button" className={primaryButton} disabled={controlsDisabled || !csrfToken} onClick={() => void save(provider)}>
                {busy ? '처리 중' : status?.configured ? 'Key 교체' : 'Key 저장'}
              </button>
              {status?.configured && <button type="button" className={secondaryButton} disabled={controlsDisabled || !csrfToken} onClick={() => void testConnection(provider, status)}>연결 테스트</button>}
              {status?.configured && <button type="button" className={dangerButton} disabled={controlsDisabled || !csrfToken} onClick={() => void remove(provider)}>Key 삭제</button>}
            </div>
          </article>
        })}
      </div>
    </section>
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
        tone="ok"
        state="구현됨"
        description="등록된 production Handler와 잠금 Guardrail을 Snapshot Runner와 Backend 검증이 함께 강제합니다."
      />
      <RuntimeStatusCard
        title="MCP Tool 실행"
        tone="wait"
        state="고정 정책 적용"
        description="Profile별 승인 Tool allowlist만 Snapshot에 저장합니다. 상세 실행 정책 화면은 이 작업 범위에 포함하지 않습니다."
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

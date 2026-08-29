import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Icon, type IconName } from '../../shared/ui/icons'
import {
  Badge, Callout, PageHead, PanelTitle, Tag, control, dangerButton, panel, primaryButton, secondaryButton,
} from '../../shared/ui/primitives'

type TabId = 'provider' | 'workflow' | 'profile' | 'policy' | 'usage'
type NodeType = 'start' | 'agent' | 'tool' | 'approval' | 'check' | 'end'
type ProfileKey = 'LLM_OPS' | 'NATURAL_CMS'

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

const tabs: { id: TabId; label: string }[] = [
  { id: 'provider', label: 'Provider·Model' },
  { id: 'workflow', label: 'Agent·Workflow' },
  { id: 'profile', label: '자연어 기능 Profile' },
  { id: 'policy', label: 'Tool·실행 정책' },
  { id: 'usage', label: '사용량·평가' },
]

const nodeTypes: Record<NodeType, { label: string; icon: IconName; meta: string; skin: string }> = {
  start: { label: 'Start', icon: 'play', meta: '요청 시작', skin: 'bg-ok-bg text-ok-fg' },
  agent: { label: 'Agent', icon: 'bot', meta: 'Model · Tool Mapping', skin: 'bg-run-bg text-run-fg' },
  tool: { label: 'MCP Tool', icon: 'plug', meta: '고정 Tool 실행', skin: 'bg-wait-bg text-wait-fg' },
  approval: { label: 'Approval', icon: 'shield-check', meta: '4번과 협의 필요', skin: 'bg-[#f2ecf8] text-[#765a91]' },
  check: { label: 'Check', icon: 'check-check', meta: '4번과 협의 필요', skin: 'bg-[#f2ecf8] text-[#765a91]' },
  end: { label: 'End', icon: 'inbox', meta: '결과 종료', skin: 'bg-idle-bg text-idle-fg' },
}

const models = ['GPT-4o', 'Claude Sonnet', 'Gemini Pro', 'GPT-4o mini']
const fixedTools = ['read_file', 'search_code', 'apply_patch', 'read_diff', 'run_check']
const profileCatalog: Record<ProfileKey, {
  title: string
  owner: string
  queue: string
  target: string
  tools: string[]
}> = {
  LLM_OPS: {
    title: 'LLM Ops',
    owner: '4번 · 제한형 LLM DevOps',
    queue: 'Coding',
    target: '승인된 Source Repository',
    tools: ['read_file', 'search_code', 'read_diff', 'apply_patch', 'run_check', 'check_package_allowlist', 'scan_changed_files'],
  },
  NATURAL_CMS: {
    title: 'Natural CMS',
    owner: '5번 · 자연어 CMS 관리',
    queue: 'Natural CMS',
    target: '기존 CMS Resource',
    tools: ['resolve_cms_target', 'validate_cms_command', 'create_cms_preview', 'discard_cms_preview', 'revalidate_cms_preview', 'apply_cms_preview'],
  },
}

const initialProfileSettings: Record<ProfileKey, { model: string; tools: string[] }> = {
  LLM_OPS: { model: 'Claude Sonnet', tools: ['read_file', 'search_code', 'read_diff', 'run_check'] },
  NATURAL_CMS: { model: 'GPT-4o', tools: ['resolve_cms_target', 'validate_cms_command', 'create_cms_preview', 'revalidate_cms_preview'] },
}

const initialNodes: WorkflowNode[] = [
  { id: 'n1', type: 'start', name: 'Start', x: 24, y: 48, model: models[0], tools: [] },
  { id: 'n2', type: 'agent', name: '요구사항 분석', x: 210, y: 48, model: 'GPT-4o', tools: ['read_file', 'search_code'] },
  { id: 'n3', type: 'agent', name: '코드 작성', x: 396, y: 48, model: 'Claude Sonnet', tools: ['read_file', 'search_code', 'apply_patch'] },
  { id: 'n4', type: 'tool', name: 'run_check', x: 582, y: 48, model: models[0], tools: ['run_check'] },
  { id: 'n5', type: 'agent', name: '코드 리뷰', x: 210, y: 218, model: 'Gemini Pro', tools: ['read_diff', 'run_check'] },
  { id: 'n6', type: 'approval', name: 'PR 승인', x: 396, y: 218, model: models[0], tools: [] },
  { id: 'n7', type: 'check', name: '결과 점검', x: 582, y: 218, model: models[0], tools: [] },
  { id: 'n8', type: 'end', name: 'End', x: 396, y: 388, model: models[0], tools: [] },
]

const initialEdges: WorkflowEdge[] = [
  { from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4' },
  { from: 'n4', to: 'n5' }, { from: 'n5', to: 'n6' }, { from: 'n6', to: 'n7' },
  { from: 'n7', to: 'n8' },
]

const providerCards = [
  { initial: 'O', name: 'OpenAI', model: 'GPT-4o', role: '기본 모델', key: '•••• 9A2F', skin: 'bg-run-bg text-run-fg' },
  { initial: 'A', name: 'Anthropic', model: 'Claude Sonnet', role: '대체 모델', key: '•••• 4C71', skin: 'bg-[#f8f1ea] text-[#9a633a]' },
  { initial: 'G', name: 'Google', model: 'Gemini Pro', role: '리뷰 모델', key: '•••• B0D3', skin: 'bg-[#f1f4f9] text-[#4a5f8a]' },
]

const initialMappings = [
  { agent: '요구사항 분석', primary: 'GPT-4o', fallback: 'Claude Sonnet', tier: 'Balanced' },
  { agent: '코드 작성', primary: 'Claude Sonnet', fallback: 'GPT-4o', tier: 'Quality' },
  { agent: '코드 리뷰', primary: 'Gemini Pro', fallback: 'GPT-4o mini', tier: 'Balanced' },
]

const usage = [
  { agent: '요구사항 분석', model: 'GPT-4o', tokens: '12.4K', calls: '42', reason: '요구 분석 기본 Model' },
  { agent: '코드 작성', model: 'Claude Sonnet', tokens: '28.1K', calls: '31', reason: '코드 품질 우선' },
  { agent: '코드 리뷰', model: 'Gemini Pro', tokens: '8.7K', calls: '28', reason: '리뷰 기본 Model' },
]

export default function AgentSettingsWorkspace() {
  const [activeTab, setActiveTab] = useState<TabId>('workflow')
  const [selectedProfileKey, setSelectedProfileKey] = useState<ProfileKey>('LLM_OPS')
  const [profileSettings, setProfileSettings] = useState(initialProfileSettings)

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

  function updateProfileModel(key: ProfileKey, model: string) {
    setProfileSettings((current) => ({ ...current, [key]: { ...current[key], model } }))
  }

  function toggleProfileTool(key: ProfileKey, tool: string) {
    setProfileSettings((current) => {
      const profile = current[key]
      return {
        ...current,
        [key]: {
          ...profile,
          tools: profile.tools.includes(tool) ? profile.tools.filter((item) => item !== tool) : [...profile.tools, tool],
        },
      }
    })
  }

  return <>
    <PageHead title="Agent 설정" description="Provider·Model, Agent Workflow와 실행 정책을 설정합니다.">
      <Badge tone="run" dot={false}>최고관리자 전용</Badge>
    </PageHead>
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-[#d9e6ef] bg-[#f4f9fc] px-3 py-2 text-[0.71875rem] text-run-fg">
      <Badge tone="run">UI/UX Mock</Badge>
      <span>화면 편집 내용은 브라우저 로컬 상태에만 유지되며 저장·검증·실행 API를 호출하지 않습니다.</span>
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
      >{tab.label}</button>)}
    </div>

    {activeTab === 'provider' && <ProviderModelPanel />}
    {activeTab === 'workflow' && <WorkflowPanel />}
    {activeTab === 'profile' && <NaturalFeatureProfilePanel
      selectedKey={selectedProfileKey}
      settings={profileSettings}
      onSelect={setSelectedProfileKey}
      onModelChange={updateProfileModel}
      onToolToggle={toggleProfileTool}
    />}
    {activeTab === 'policy' && <PolicyPanel />}
    {activeTab === 'usage' && <UsagePanel />}
  </>
}

function NaturalFeatureProfilePanel({ selectedKey, settings, onSelect, onModelChange, onToolToggle }: {
  selectedKey: ProfileKey
  settings: Record<ProfileKey, { model: string; tools: string[] }>
  onSelect: (key: ProfileKey) => void
  onModelChange: (key: ProfileKey, model: string) => void
  onToolToggle: (key: ProfileKey, tool: string) => void
}) {
  const selected = profileCatalog[selectedKey]
  const selectedSettings = settings[selectedKey]

  return <section id="agent-settings-panel-profile" role="tabpanel" aria-labelledby="agent-settings-tab-profile">
    <Callout tone="warn" icon="triangle-alert">
      로컬 UI 목업이며 Profile Version 저장·활성화·검증, Spring API, LangGraph·MCP 실행을 하지 않습니다.
    </Callout>
    <div className="mt-3 grid items-start gap-[0.875rem] xl:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className={`${panel} overflow-hidden`} aria-label="자연어 기능 Profile 목록">
        <PanelTitle title="Profile" sub="기능 소유 영역별 로컬 설정" />
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
      </aside>

      <article className={panel}>
        <PanelTitle title={`${selected.title} Profile`} sub={`${selectedKey} · ${selected.owner}`}>
          <Badge tone="run" dot={false}>로컬 상태</Badge>
        </PanelTitle>
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.8fr)]">
          <div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ProfileFact label="Queue Lane" value={selected.queue} />
              <ProfileFact label="작업 대상" value={selected.target} />
            </div>
            <label className="mt-4 block text-[0.71875rem] font-semibold text-body">기본 Model
              <select aria-label={`${selectedKey} 기본 Model`} className={control} value={selectedSettings.model} onChange={(event) => onModelChange(selectedKey, event.target.value)}>
                {models.map((model) => <option key={model}>{model}</option>)}
              </select>
            </label>
            <p className="mt-3 text-[0.6875rem] leading-5 text-muted-2">
              LLM_OPS는 Coding Tool만, NATURAL_CMS는 CMS Tool만 구성합니다. 중앙 Guardrail Profile은 시스템 설정에서 별도로 검토합니다.
            </p>
          </div>

          <fieldset className="rounded-md border border-line-soft bg-sub p-3">
            <legend className="px-1 text-[0.71875rem] font-semibold text-body">허용 Tool</legend>
            <div className="space-y-1">
              {selected.tools.map((tool) => <label key={tool} className="flex items-center justify-between gap-3 border-b border-row-line py-2 text-[0.6875rem] last:border-b-0">
                <code className="min-w-0 break-all font-semibold text-body">{tool}</code>
                <input
                  type="checkbox"
                  aria-label={`${selectedKey} ${tool} 허용`}
                  checked={selectedSettings.tools.includes(tool)}
                  onChange={() => onToolToggle(selectedKey, tool)}
                />
              </label>)}
            </div>
          </fieldset>
        </div>
      </article>
    </div>
  </section>
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-line-soft bg-sub p-3">
    <small className="block text-[0.6875rem] text-muted-2">{label}</small>
    <b className="mt-1 block text-[0.78125rem] font-semibold text-body">{value}</b>
  </div>
}

function ProviderModelPanel() {
  const [mappings, setMappings] = useState(initialMappings)

  function updateMapping(index: number, key: 'primary' | 'fallback' | 'tier', value: string) {
    setMappings((current) => current.map((mapping, mappingIndex) => mappingIndex === index ? { ...mapping, [key]: value } : mapping))
  }

  return <section id="agent-settings-panel-provider" role="tabpanel" aria-labelledby="agent-settings-tab-provider">
    <div className="mb-[0.875rem] grid gap-3 md:grid-cols-3">
      {providerCards.map((provider) => <article key={provider.name} className={`${panel} p-4`}>
        <div className="flex items-center gap-[0.625rem]">
          <span className={`grid h-8 w-8 place-items-center rounded-md text-xs font-bold ${provider.skin}`}>{provider.initial}</span>
          <span className="min-w-0 flex-1">
            <b className="block text-[0.8125rem] font-semibold">{provider.name}</b>
            <small className="block text-[0.6875rem] text-muted-2">{provider.model} · {provider.role}</small>
          </span>
          <Badge tone="ok">연결됨</Badge>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-row-line pt-3 text-[0.71875rem] text-muted">
          <span>API Key</span><b className="font-mono font-medium text-body">{provider.key}</b>
        </div>
      </article>)}
    </div>

    <section className={panel}>
      <PanelTitle title="3-Agent Model Mapping" sub="변경값은 현재 화면의 로컬 상태에만 반영됩니다." />
      <div className="overflow-x-auto">
        <div className="min-w-[47rem]">
          <div className="grid grid-cols-[1.2fr_1fr_1fr_.8fr] gap-3 border-b border-line-soft bg-sub px-4 py-2 text-[0.6875rem] font-semibold text-muted-2">
            <span>Agent</span><span>기본 Model</span><span>대체 Model</span><span>Tier</span>
          </div>
          {mappings.map((mapping, index) => <div key={mapping.agent} className="grid grid-cols-[1.2fr_1fr_1fr_.8fr] items-center gap-3 border-b border-row-line px-4 py-3">
            <b className="text-[0.78125rem] font-semibold">{mapping.agent}</b>
            <select aria-label={`${mapping.agent} 기본 Model`} className={`${control} mt-0`} value={mapping.primary} onChange={(event) => updateMapping(index, 'primary', event.target.value)}>
              {models.map((model) => <option key={model}>{model}</option>)}
            </select>
            <select aria-label={`${mapping.agent} 대체 Model`} className={`${control} mt-0`} value={mapping.fallback} onChange={(event) => updateMapping(index, 'fallback', event.target.value)}>
              {models.map((model) => <option key={model}>{model}</option>)}
            </select>
            <select aria-label={`${mapping.agent} Model Tier`} className={`${control} mt-0`} value={mapping.tier} onChange={(event) => updateMapping(index, 'tier', event.target.value)}>
              {['Balanced', 'Quality', 'Fast'].map((tier) => <option key={tier}>{tier}</option>)}
            </select>
          </div>)}
        </div>
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
  const nextId = useRef(9)
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
      Pipeline 단계 의미와 Approval·Check·Guardrail 적용 시점은 <b>4번과 협의 필요</b>합니다. 편집 결과는 저장하거나 실행하지 않습니다.
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
        <div className="mt-4"><Badge tone="wait" dot={false}>4번과 협의 필요</Badge></div>
      </aside>

      <div className="min-w-0 bg-[#f8fafc]">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-white px-4 py-3">
          <b className="text-[0.8125rem] font-semibold">LLM DevOps Pipeline</b>
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
            <select aria-label="선택 Node 유형" className={control} value={selected.type} onChange={(event) => updateSelected({ type: event.target.value as NodeType })}>
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

          {(selected.type === 'approval' || selected.type === 'check') && <div className="mt-3"><Badge tone="wait" dot={false}>4번과 협의 필요</Badge></div>}

          <div className="mt-4 grid gap-2">
            <button type="button" className={connectFrom === selected.id ? secondaryButton : primaryButton} onClick={() => {
              if (connectFrom === selected.id) {
                setConnectFrom(null); setStatus('Node 연결 선택을 취소했습니다.')
              } else {
                setConnectFrom(selected.id); setStatus(`${selected.name}에서 연결할 대상 Node를 선택하세요.`)
              }
            }}>{connectFrom === selected.id ? '연결 선택 취소' : '이 Node에서 연결'}</button>
            <button type="button" className={dangerButton} onClick={deleteSelected}>Node 삭제</button>
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
  const [tools, setTools] = useState<Record<string, boolean>>({ read_file: true, search_code: true, apply_patch: false, read_diff: true, run_check: true })
  const [guardrails, setGuardrails] = useState<Record<string, boolean>>({ '작업 경로 제한': true, '보호 파일 제한': true, 'Package 허용 목록': false, 'Agent별 Tool 허용 목록': true, 'Secret 노출 차단': true })

  return <section id="agent-settings-panel-policy" role="tabpanel" aria-labelledby="agent-settings-tab-policy">
    <div className="grid items-start gap-[0.875rem] xl:grid-cols-3">
      <article className={panel}>
        <PanelTitle title="OmniRoute"><Badge tone="wait" dot={false}>향후 적용 예정</Badge></PanelTitle>
        <div className="p-4">
          <label className="flex items-center justify-between gap-3 text-xs font-semibold text-body">Routing ON/OFF
            <input type="checkbox" disabled aria-label="OmniRoute 비활성 목업" />
          </label>
          <p className="mt-3 text-[0.71875rem] leading-6 text-muted-2">실제 Model Switching·Token 압축은 연결하지 않습니다.</p>
        </div>
      </article>

      <article className={panel}>
        <PanelTitle title="고정 MCP Tool" sub="Agent별 허용 여부의 로컬 목업" />
        <div className="p-4">
          {fixedTools.map((tool) => <label key={tool} className="flex items-center justify-between gap-3 border-b border-row-line py-[0.625rem] text-xs">
            <code className="font-semibold text-body">{tool}</code>
            <input type="checkbox" checked={tools[tool]} onChange={() => setTools((current) => ({ ...current, [tool]: !current[tool] }))} />
          </label>)}
          <div className="mt-3"><Badge tone="wait" dot={false}>실행 조건은 4번과 협의 필요</Badge></div>
        </div>
      </article>

      <div className="flex flex-col gap-[0.875rem]">
        <article className={panel}>
          <PanelTitle title="최소 Guardrail"><Badge tone="wait" dot={false}>4번과 협의 필요</Badge></PanelTitle>
          <div className="p-4">
            {Object.entries(guardrails).map(([name, enabled]) => <label key={name} className="flex items-center justify-between gap-3 border-b border-row-line py-[0.625rem] text-xs text-body">
              <span>{name}</span><input type="checkbox" checked={enabled} onChange={() => setGuardrails((current) => ({ ...current, [name]: !current[name] }))} />
            </label>)}
          </div>
        </article>
        <article className={panel}>
          <PanelTitle title="Local Executor" />
          <div className="flex items-center justify-between gap-3 p-4 text-xs"><span>Coding Executor Container</span><Badge tone="ok">Mock 정상</Badge></div>
          <p className="px-4 pb-4 text-[0.6875rem] text-muted-2">실제 Container 상태 조회와 LangGraph 실행은 연결하지 않습니다.</p>
        </article>
      </div>
    </div>
  </section>
}

function UsagePanel() {
  return <section id="agent-settings-panel-usage" role="tabpanel" aria-labelledby="agent-settings-tab-usage">
    <div className="mb-[0.875rem] grid gap-3 md:grid-cols-3">
      {usage.map((item) => <article key={item.agent} className={`${panel} p-4`}>
        <div className="flex items-center gap-2"><Icon name="bot" className="text-run-fg" /><b className="text-[0.8125rem] font-semibold">{item.agent}</b><Badge tone="ok">정상</Badge></div>
        <p className="mt-3 text-xs font-semibold">{item.model} · {item.tokens} Token</p>
        <p className="mt-1 text-[0.6875rem] text-muted-2">호출 {item.calls}회 · {item.reason}</p>
      </article>)}
    </div>
    <div className="grid gap-[0.875rem] xl:grid-cols-2">
      <article className={panel}>
        <PanelTitle title="RAGAS 참고 평가" sub="Pipeline Gate로 사용하지 않는 Mock 점수" />
        <div className="grid grid-cols-2 gap-3 p-4">
          <Metric label="AgentGoalAccuracy" value="0.86" />
          <Metric label="ToolCallAccuracy" value="0.92" />
        </div>
        <div className="px-4 pb-4"><Badge tone="wait" dot={false}>Gate 전환은 4번과 협의 필요</Badge></div>
      </article>
      <article className={panel}>
        <PanelTitle title="Langfuse Monitoring"><Badge tone="wait" dot={false}>향후 적용 예정</Badge></PanelTitle>
        <div className="p-4 text-[0.71875rem] leading-6 text-muted-2">Trace, 비용, 지연시간 Monitoring은 현재 연결하지 않습니다. 향후 FOSS Self-host PoC 후보로만 표시합니다.</div>
      </article>
    </div>
  </section>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-line-soft bg-sub p-3">
    <small className="block text-[0.6875rem] text-muted-2">{label}</small>
    <b className="mt-1 block text-xl font-semibold tracking-[-.02em]">{value}</b>
  </div>
}

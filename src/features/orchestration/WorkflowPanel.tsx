import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { describeFailure, ProductApiError } from '../../shared/api/error'
import { Icon } from '../../shared/ui/icons'
import {
  Badge, Callout, Tag, control, dangerButton, panel, primaryButton, secondaryButton,
} from '../../shared/ui/primitives'
import type {
  ProfileAuthoringSnapshot, ProfileDefaultTemplateApiClient, ProfileEditorLayoutApiClient, ProfileKey, ProfileModelBinding, ProfileNodeType, ProfileSnapshotConfig,
  ProfileSnapshotEdge, ProfileSnapshotNode, ProfileVersion, ProfileVersionApiClient,
} from './api'

interface WorkflowNode extends ProfileSnapshotNode {
  x: number
  y: number
}

interface CanvasDimensions {
  width: number
  height: number
  nodeAreaHeight: number
}

type EdgePortSide = 'left' | 'right'

interface HandlerDefinition {
  key: string
  type: ProfileNodeType
  label: string
  resultPorts: string[]
  config: Record<string, unknown>
  locked?: true
}

const nodeTypes = {
  start: { icon: 'play' as const, meta: '요청 시작', skin: 'bg-ok-bg text-ok-fg' },
  agent: { icon: 'bot' as const, meta: 'Model Binding', skin: 'bg-run-bg text-run-fg' },
  tool: { icon: 'plug' as const, meta: '고정 Tool 정책', skin: 'bg-wait-bg text-wait-fg' },
  guardrail: { icon: 'shield-check' as const, meta: 'Snapshot 잠금 계약', skin: 'bg-[#f2ecf8] text-[#765a91]' },
  approval: { icon: 'shield-check' as const, meta: 'production Handler', skin: 'bg-[#f2ecf8] text-[#765a91]' },
  check: { icon: 'check-check' as const, meta: 'production Handler', skin: 'bg-[#f2ecf8] text-[#765a91]' },
  end: { icon: 'inbox' as const, meta: '결과 종료', skin: 'bg-idle-bg text-idle-fg' },
}

const handlerCatalog: Record<ProfileKey, HandlerDefinition[]> = {
  LLM_OPS: [
    { key: 'common.start', type: 'start', label: 'Start', resultPorts: ['next'], config: {}, locked: true },
    { key: 'common.guardrail', type: 'guardrail', label: '잠금 Guardrail', resultPorts: ['passed', 'failed'], config: { locked: true }, locked: true },
    { key: 'coding.analyze', type: 'agent', label: '요청 분석', resultPorts: ['feasible', 'infeasible'], config: {} },
    { key: 'coding.approval', type: 'approval', label: 'Coding Approval', resultPorts: ['approved'], config: { stage: 'SCOPE', requiredRole: 'GENERAL_ADMIN' } },
    { key: 'coding.code', type: 'agent', label: '코드 생성', resultPorts: ['completed'], config: {} },
    { key: 'coding.review', type: 'agent', label: '코드 검토', resultPorts: ['passed', 'changes_requested'], config: {} },
    { key: 'coding.rework_gate', type: 'check', label: '재작업 Check', resultPorts: ['retry', 'handover'], config: { maxReworkRounds: 3 } },
    { key: 'common.check', type: 'check', label: '공통 Check', resultPorts: ['passed', 'failed'], config: {} },
    { key: 'coding.preview', type: 'tool', label: '변경 Preview', resultPorts: ['ready'], config: {} },
    { key: 'coding.preview_approval', type: 'approval', label: 'Preview Approval', resultPorts: ['approved', 'rejected'], config: { stage: 'CANDIDATE', requiredRole: 'GENERAL_ADMIN' } },
    { key: 'coding.pr_request', type: 'tool', label: 'PR 요청', resultPorts: ['requested'], config: {} },
    { key: 'coding.pr_complete', type: 'tool', label: 'PR 완료 확인', resultPorts: ['completed'], config: {} },
    { key: 'coding.deploy_request', type: 'tool', label: '배포 요청 기록', resultPorts: ['recorded'], config: { mode: 'request_record_only' } },
    { key: 'coding.dev_merge_check', type: 'check', label: 'dev 병합 확인', resultPorts: ['merged', 'not_merged', 'blocked'], config: {} },
    { key: 'coding.deploy', type: 'tool', label: '배포', resultPorts: ['completed', 'blocked'], config: {} },
    { key: 'common.end', type: 'end', label: 'End', resultPorts: [], config: {}, locked: true },
  ],
  NATURAL_CMS: [
    { key: 'common.start', type: 'start', label: 'Start', resultPorts: ['next'], config: {}, locked: true },
    { key: 'common.guardrail', type: 'guardrail', label: '잠금 Guardrail', resultPorts: ['passed', 'failed'], config: { locked: true }, locked: true },
    { key: 'cms.analyze', type: 'agent', label: 'CMS 요청 분석', resultPorts: ['feasible', 'infeasible'], config: {} },
    { key: 'cms.preview', type: 'agent', label: 'CMS Preview 생성', resultPorts: ['ready'], config: {} },
    { key: 'cms.approval', type: 'approval', label: 'CMS Preview Approval', resultPorts: ['approved', 'rejected'], config: { stage: 'PREVIEW', requiredRole: 'GENERAL_ADMIN' } },
    { key: 'cms.discard', type: 'tool', label: 'CMS Preview 폐기', resultPorts: ['retry', 'discarded'], config: {} },
    { key: 'cms.apply', type: 'tool', label: 'CMS Preview 반영', resultPorts: ['applied'], config: {} },
    { key: 'common.check', type: 'check', label: '공통 Check', resultPorts: ['passed', 'failed'], config: {} },
    { key: 'common.end', type: 'end', label: 'End', resultPorts: [], config: {}, locked: true },
  ],
}

const modelBindingCatalog: Record<ProfileKey, string[]> = {
  LLM_OPS: ['llm-ops-analyze', 'llm-ops-code', 'llm-ops-review', 'llm-ops-claude'],
  NATURAL_CMS: ['natural-cms-analyze', 'natural-cms-command', 'natural-cms-claude'],
}

const modelBindingDetails: Record<string, { provider: string; model: string }> = {
  'llm-ops-analyze': { provider: 'OpenAI', model: 'gpt-5.4-nano' },
  'llm-ops-code': { provider: 'OpenAI', model: 'gpt-5.4-nano' },
  'llm-ops-review': { provider: 'Google', model: 'gemini-3.5-flash-lite' },
  'llm-ops-claude': { provider: 'Anthropic', model: 'claude-haiku-4-5-20251001' },
  'natural-cms-analyze': { provider: 'OpenAI', model: 'gpt-5.4-nano' },
  'natural-cms-command': { provider: 'Google', model: 'gemini-3.5-flash-lite' },
  'natural-cms-claude': { provider: 'Anthropic', model: 'claude-haiku-4-5-20251001' },
}

const toolCatalog: Record<ProfileKey, string[]> = {
  LLM_OPS: ['read_file', 'search_code', 'read_diff', 'apply_patch', 'run_check', 'check_package_allowlist', 'scan_changed_files'],
  NATURAL_CMS: ['resolve_cms_target', 'validate_cms_command', 'create_cms_preview', 'discard_cms_preview', 'revalidate_cms_preview', 'apply_cms_preview'],
}

const toolDetails: Record<string, { label: string; description: string }> = {
  read_file: { label: '파일 읽기', description: '승인된 Coding 작업공간의 UTF-8 텍스트 파일 하나를 읽습니다.' },
  search_code: { label: '코드 검색', description: '승인된 소스 파일 범위에서 지정한 문자열을 검색합니다.' },
  read_diff: { label: '변경사항 읽기', description: '보호 경로와 비밀정보 검사를 거친 Git 변경사항 전체를 읽습니다.' },
  apply_patch: { label: '코드 변경 적용', description: '제한된 텍스트 패치를 Git 작업공간에 적용합니다.' },
  run_check: { label: '검사 실행', description: '등록된 정적·결정적 검사 Profile을 실행합니다.' },
  check_package_allowlist: { label: '패키지 변경 검사', description: '의존성 Manifest와 Lockfile 변경이 허용되는지 검사합니다.' },
  scan_changed_files: { label: '변경 파일 보안 검사', description: '새로 추가된 코드에서 비밀정보로 의심되는 패턴을 검사합니다.' },
  resolve_cms_target: { label: 'CMS 대상 확인', description: 'Spring이 제공한 CMS Resource Snapshot에서 변경 대상을 확인합니다.' },
  validate_cms_command: { label: 'CMS 명령 검증', description: '구조화된 CMS 명령이 현재 Resource Snapshot에 유효한지 검사합니다.' },
  create_cms_preview: { label: 'CMS 미리보기 생성', description: 'DB를 변경하지 않고 결정적인 CMS 변경 미리보기를 생성합니다.' },
  discard_cms_preview: { label: 'CMS 미리보기 폐기', description: '생성된 CMS 변경 미리보기를 폐기 처리합니다.' },
  revalidate_cms_preview: { label: 'CMS 미리보기 재검증', description: '승인된 미리보기를 Spring의 최신 Resource Snapshot과 다시 비교합니다.' },
  apply_cms_preview: { label: 'CMS 반영 준비', description: 'Spring CmsService가 DB에 반영할 수 있는 검증된 명령을 반환합니다.' },
}

const NODE_WIDTH = 176
const NODE_HEIGHT = 88
const NODE_PORT_Y = 42
const CANVAS_PADDING = 48
const LAYER_GAP_X = 244
const LANE_GAP_Y = 124
const DETOUR_LANE_GAP = 32
const MIN_CANVAS_WIDTH = 1180
const MIN_NODE_AREA_HEIGHT = 680
const MIN_CANVAS_ZOOM = 0.5
const MAX_CANVAS_ZOOM = 1.5
const CANVAS_ZOOM_STEP = 0.1

function isDetourEdge(edge: ProfileSnapshotEdge, nodes: WorkflowNode[]) {
  const from = nodes.find((node) => node.id === edge.from)
  const to = nodes.find((node) => node.id === edge.to)
  return /retry|reject|changes_requested/i.test(edge.resultPort) || (from !== undefined && to !== undefined && to.x <= from.x)
}

function layoutSnapshotNodes(snapshotNodes: ProfileSnapshotNode[], edges: ProfileSnapshotEdge[]): WorkflowNode[] {
  const ids = snapshotNodes.map((node) => node.id).sort()
  const next = new Map(ids.map((id) => [id, [] as string[]]))
  for (const edge of edges) {
    if (!next.has(edge.from) || !next.has(edge.to)) continue
    next.get(edge.from)?.push(edge.to)
  }
  const index = new Map<string, number>()
  const lowlink = new Map<string, number>()
  const component = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  let cursor = 0
  let componentCount = 0
  const visit = (id: string) => {
    index.set(id, cursor); lowlink.set(id, cursor); cursor += 1
    stack.push(id); onStack.add(id)
    for (const target of next.get(id)?.sort() ?? []) {
      if (!index.has(target)) { visit(target); lowlink.set(id, Math.min(lowlink.get(id)!, lowlink.get(target)!)) }
      else if (onStack.has(target)) lowlink.set(id, Math.min(lowlink.get(id)!, index.get(target)!))
    }
    if (lowlink.get(id) !== index.get(id)) return
    for (;;) {
      const member = stack.pop()!
      onStack.delete(member); component.set(member, componentCount)
      if (member === id) break
    }
    componentCount += 1
  }
  for (const id of ids) if (!index.has(id)) visit(id)

  const componentNext = new Map(Array.from({ length: componentCount }, (_, id) => [id, new Set<number>()]))
  const incoming = new Map(Array.from({ length: componentCount }, (_, id) => [id, 0]))
  for (const [from, targets] of next) for (const to of targets) {
    const fromComponent = component.get(from)!
    const toComponent = component.get(to)!
    if (fromComponent === toComponent || componentNext.get(fromComponent)!.has(toComponent)) continue
    componentNext.get(fromComponent)!.add(toComponent)
    incoming.set(toComponent, (incoming.get(toComponent) ?? 0) + 1)
  }
  const levels = new Map(Array.from({ length: componentCount }, (_, id) => [id, 0]))
  const ready = Array.from({ length: componentCount }, (_, id) => id).filter((id) => incoming.get(id) === 0)
  while (ready.length > 0) {
    ready.sort((left, right) => left - right)
    const current = ready.shift()!
    for (const target of componentNext.get(current) ?? []) {
      levels.set(target, Math.max(levels.get(target) ?? 0, (levels.get(current) ?? 0) + 1))
      const remaining = (incoming.get(target) ?? 1) - 1
      incoming.set(target, remaining)
      if (remaining === 0) ready.push(target)
    }
  }

  const lanes = new Map<number, number>()
  const positions = new Map<string, { x: number; y: number }>()
  for (const id of [...ids].sort((left, right) => (levels.get(component.get(left)!) ?? 0) - (levels.get(component.get(right)!) ?? 0) || left.localeCompare(right))) {
    const level = levels.get(component.get(id)!) ?? 0
    const lane = lanes.get(level) ?? 0
    lanes.set(level, lane + 1)
    positions.set(id, {
      x: CANVAS_PADDING + level * LAYER_GAP_X,
      y: CANVAS_PADDING + lane * LANE_GAP_Y,
    })
  }
  return snapshotNodes.map((node) => {
    const position = positions.get(node.id)!
    return {
      ...node,
      resultPorts: [...node.resultPorts],
      config: { ...node.config },
      ...position,
    }
  })
}

export function resolveEdgePorts(edge: ProfileSnapshotEdge, nodes: WorkflowNode[], edges: ProfileSnapshotEdge[]) {
  const from = nodes.find((node) => node.id === edge.from)
  const to = nodes.find((node) => node.id === edge.to)
  if (!from || !to) return { reverse: false, sourcePort: 'right' as EdgePortSide, targetPort: 'left' as EdgePortSide }
  const reverse = to.x <= from.x
  const sourceHasLeftInput = edges.some((incoming) => incoming.to === from.id && (nodes.find((node) => node.id === incoming.from)?.x ?? from.x) < from.x)
  const sourcePort: EdgePortSide = reverse && !sourceHasLeftInput ? 'left' : 'right'
  return { reverse, sourcePort, targetPort: reverse ? sourcePort : 'left' as EdgePortSide }
}

function restoreLayout(snapshot: ProfileAuthoringSnapshot, nodes: { id: string; x: number; y: number }[]) {
  const generated = layoutSnapshotNodes(snapshot.nodes, snapshot.edges)
  const coordinates = new Map(nodes.map((node) => [node.id, node]))
  if (coordinates.size !== generated.length || generated.some((node) => !coordinates.has(node.id))) return generated
  return generated.map((node) => ({ ...node, ...coordinates.get(node.id)! }))
}

function canvasDimensions(nodes: WorkflowNode[], edges: ProfileSnapshotEdge[]): CanvasDimensions {
  const farthestRight = Math.max(0, ...nodes.map((node) => node.x + NODE_WIDTH))
  const farthestBottom = Math.max(0, ...nodes.map((node) => node.y + NODE_HEIGHT))
  const detourCount = edges.filter((edge) => isDetourEdge(edge, nodes)).length
  const nodeAreaHeight = Math.max(MIN_NODE_AREA_HEIGHT, farthestBottom + CANVAS_PADDING)
  return {
    width: Math.max(MIN_CANVAS_WIDTH, farthestRight + CANVAS_PADDING),
    height: nodeAreaHeight + CANVAS_PADDING + Math.max(1, detourCount) * DETOUR_LANE_GAP,
    nodeAreaHeight,
  }
}

export const starterSnapshots: Record<ProfileKey, ProfileAuthoringSnapshot> = {
  LLM_OPS: {
    nodes: [
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
    ],
    edges: [
      { from: 'start', resultPort: 'next', to: 'guardrail' },
      { from: 'guardrail', resultPort: 'passed', to: 'analyze' },
      { from: 'guardrail', resultPort: 'failed', to: 'end' },
      { from: 'analyze', resultPort: 'feasible', to: 'scope_approval' },
      { from: 'analyze', resultPort: 'infeasible', to: 'end' },
      { from: 'scope_approval', resultPort: 'approved', to: 'code' },
      { from: 'code', resultPort: 'completed', to: 'review' },
      { from: 'review', resultPort: 'passed', to: 'preview' },
      { from: 'review', resultPort: 'changes_requested', to: 'rework_gate' },
      { from: 'rework_gate', resultPort: 'retry', to: 'code' },
      { from: 'rework_gate', resultPort: 'handover', to: 'end' },
      { from: 'preview', resultPort: 'ready', to: 'preview_approval' },
      { from: 'preview_approval', resultPort: 'approved', to: 'pr_request' },
      { from: 'preview_approval', resultPort: 'rejected', to: 'analyze' },
      { from: 'pr_request', resultPort: 'requested', to: 'github_approval' },
      { from: 'github_approval', resultPort: 'approved', to: 'pr_complete' },
      { from: 'pr_complete', resultPort: 'completed', to: 'deploy_request' },
      { from: 'deploy_request', resultPort: 'recorded', to: 'deploy_approval' },
      { from: 'deploy_approval', resultPort: 'approved', to: 'dev_merge_check' },
      { from: 'dev_merge_check', resultPort: 'not_merged', to: 'deploy_request' },
      { from: 'dev_merge_check', resultPort: 'merged', to: 'deploy' },
      { from: 'dev_merge_check', resultPort: 'blocked', to: 'end' },
      { from: 'deploy', resultPort: 'completed', to: 'end' },
      { from: 'deploy', resultPort: 'blocked', to: 'end' },
    ],
    config: {
      maxNodes: 17,
      maxAttempts: 3,
      loopLimits: [
        { from: 'rework_gate', resultPort: 'retry', to: 'code', maxIterations: 2 },
        { from: 'preview_approval', resultPort: 'rejected', to: 'analyze', maxIterations: 2 },
        { from: 'dev_merge_check', resultPort: 'not_merged', to: 'deploy_request', maxIterations: 2 },
      ],
    },
    modelBindings: {
      analyze: { primary: 'llm-ops-analyze', fallback: [] },
      code: { primary: 'llm-ops-code', fallback: [] },
      review: { primary: 'llm-ops-review', fallback: [] },
    },
    toolPolicy: { allowedTools: [...toolCatalog.LLM_OPS] },
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
      { from: 'start', resultPort: 'next', to: 'guardrail' },
      { from: 'guardrail', resultPort: 'passed', to: 'analyze' },
      { from: 'guardrail', resultPort: 'failed', to: 'end' },
      { from: 'analyze', resultPort: 'feasible', to: 'preview' },
      { from: 'analyze', resultPort: 'infeasible', to: 'end' },
      { from: 'preview', resultPort: 'ready', to: 'approval' },
      { from: 'approval', resultPort: 'approved', to: 'apply' },
      { from: 'approval', resultPort: 'rejected', to: 'discard' },
      { from: 'discard', resultPort: 'retry', to: 'analyze' },
      { from: 'discard', resultPort: 'discarded', to: 'end' },
      { from: 'apply', resultPort: 'applied', to: 'end' },
    ],
    config: {
      maxNodes: 8,
      maxAttempts: 3,
      loopLimits: [{ from: 'discard', resultPort: 'retry', to: 'analyze', maxIterations: 2 }],
    },
    modelBindings: {
      analyze: { primary: 'natural-cms-analyze', fallback: [] },
      preview: { primary: 'natural-cms-command', fallback: [] },
    },
    toolPolicy: { allowedTools: [...toolCatalog.NATURAL_CMS] },
    guardrailProfileKey: 'central.default',
  },
}

export default function WorkflowPanel({ api }: { api: ProfileVersionApiClient & ProfileEditorLayoutApiClient & ProfileDefaultTemplateApiClient }) {
  const [profileKey, setProfileKey] = useState<ProfileKey>('LLM_OPS')
  const [versions, setVersions] = useState<ProfileVersion[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [nodes, setNodes] = useState<WorkflowNode[]>([])
  const [edges, setEdges] = useState<ProfileSnapshotEdge[]>([])
  const [config, setConfig] = useState<ProfileSnapshotConfig>(starterSnapshots.LLM_OPS.config)
  const [modelBindings, setModelBindings] = useState<Record<string, ProfileModelBinding>>({})
  const [allowedTools, setAllowedTools] = useState<string[]>([])
  const [guardrailProfileKey, setGuardrailProfileKey] = useState('central.default')
  const [selectedId, setSelectedId] = useState('')
  const [connectFrom, setConnectFrom] = useState<{ nodeId: string; resultPort: string } | null>(null)
  const [connectPort, setConnectPort] = useState('')
  const [status, setStatus] = useState('저장된 Profile Version을 조회하고 있습니다.')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [handlerPaletteOpen, setHandlerPaletteOpen] = useState(false)
  const [toolPolicyOpen, setToolPolicyOpen] = useState(false)
  const [edgeListOpen, setEdgeListOpen] = useState(true)
  const [canvasZoom, setCanvasZoom] = useState(1)
  const versionRequest = useRef(0)
  const canvasViewport = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; pointerX: number; pointerY: number; x: number; y: number; moved: boolean } | null>(null)
  const pan = useRef<{ pointerId: number; pointerX: number; pointerY: number; scrollLeft: number; scrollTop: number } | null>(null)
  const ignoreClick = useRef<string | null>(null)
  const [panning, setPanning] = useState(false)

  const selected = nodes.find((node) => node.id === selectedId) ?? null
  const selectedDefinition = selected ? definitionFor(profileKey, selected.handlerKey) : null
  const selectedVersion = versions.find((version) => version.profileVersionId === selectedVersionId) ?? null
  const canvas = canvasDimensions(nodes, edges)
  const supported = nodes.every((node) => matchesDefinition(profileKey, node))
    && allowedTools.every((tool) => toolCatalog[profileKey].includes(tool))
    && nodes.filter((node) => node.type === 'agent').every((node) => {
      const binding = modelBindings[node.id]
      return binding !== undefined
        && modelBindingCatalog[profileKey].includes(binding.primary)
        && binding.fallback.every((item) => modelBindingCatalog[profileKey].includes(item))
    })

  useEffect(() => {
    void loadVersions(profileKey)
    return () => { versionRequest.current += 1 }
  }, [api, profileKey])

  useEffect(() => {
    const viewport = canvasViewport.current
    if (!viewport) return
    const handleWheel = (event: WheelEvent) => zoomCanvas(event)
    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [canvasZoom])

  useEffect(() => {
    if (!status) return
    const timer = window.setTimeout(() => setStatus(''), 2600)
    return () => window.clearTimeout(timer)
  }, [status])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2600)
    return () => window.clearTimeout(timer)
  }, [notice])

  async function loadVersions(key: ProfileKey, preferredId?: string) {
    const request = ++versionRequest.current
    setLoading(true)
    setFailure(null)
    setNotice(null)
    try {
      const items = [...await api.list(key)].sort((left, right) => right.profileVersion - left.profileVersion)
      if (request !== versionRequest.current) return false
      const preferred = items.find((item) => item.profileVersionId === preferredId)
        ?? items[0]
        ?? null
      setVersions(items)
      if (preferred) applySnapshot(preferred.snapshot, preferred.profileVersionId)
      else {
        const template = await api.getDefaultTemplate(key)
        if (request !== versionRequest.current) return false
        applySnapshot(template.snapshot, null)
      }
      if (preferred) await loadEditorLayout(preferred.snapshot, preferred.profileVersionId, request)
      setStatus(preferred
        ? `${key} v${preferred.profileVersion} ${preferred.status} Snapshot을 불러왔습니다.`
        : `${key} 저장 Version이 없어 기본 템플릿을 불러왔습니다.`)
      return true
    } catch (error) {
      if (request === versionRequest.current) {
        setVersions([])
        setSelectedVersionId(null)
        setNodes([])
        setEdges([])
        setFailure(describeFailure(error))
        setStatus('Profile Version을 불러오지 못했습니다.')
      }
      return false
    } finally {
      if (request === versionRequest.current) setLoading(false)
    }
  }

  function applySnapshot(snapshot: ProfileAuthoringSnapshot, versionId: string | null) {
    const nextNodes = layoutSnapshotNodes(snapshot.nodes, snapshot.edges)
    const nextSelected = nextNodes.find((node) => node.type === 'guardrail') ?? nextNodes[0] ?? null
    setSelectedVersionId(versionId)
    setNodes(nextNodes)
    setEdges(snapshot.edges.map((edge) => ({ ...edge })))
    setConfig({
      ...snapshot.config,
      loopLimits: snapshot.config.loopLimits.map((limit) => ({ ...limit })),
    })
    setModelBindings(Object.fromEntries(Object.entries(snapshot.modelBindings).map(([nodeId, binding]) => [
      nodeId,
      { primary: binding.primary, fallback: [...binding.fallback] },
    ])))
    setAllowedTools([...snapshot.toolPolicy.allowedTools])
    setGuardrailProfileKey(snapshot.guardrailProfileKey)
    setSelectedId(nextSelected?.id ?? '')
    setConnectPort(nextSelected?.resultPorts[0] ?? '')
    setConnectFrom(null)
  }

  function chooseVersion(versionId: string) {
    const version = versions.find((item) => item.profileVersionId === versionId)
    if (!version) return
    const request = ++versionRequest.current
    applySnapshot(version.snapshot, version.profileVersionId)
    void loadEditorLayout(version.snapshot, version.profileVersionId, request)
    setFailure(null)
    setNotice(null)
    setStatus(`${version.profileKey} v${version.profileVersion} ${version.status} Snapshot을 불러왔습니다.`)
  }

  function authoringSnapshot(): ProfileAuthoringSnapshot {
    const routes = new Set(edges.map((edge) => `${edge.from}:${edge.resultPort}:${edge.to}`))
    const agentBindings = Object.fromEntries(nodes.filter((node) => node.type === 'agent').map((node) => {
      const binding = modelBindings[node.id] ?? { primary: defaultBinding(profileKey, node.handlerKey), fallback: [] }
      return [node.id, { primary: binding.primary, fallback: [...binding.fallback] }]
    }))
    return {
      nodes: nodes.map(({ x: _x, y: _y, ...node }) => ({
        ...node,
        resultPorts: [...node.resultPorts],
        config: { ...node.config },
      })),
      edges: edges.map((edge) => ({ ...edge })),
      config: {
        ...config,
        loopLimits: config.loopLimits
          .filter((limit) => routes.has(`${limit.from}:${limit.resultPort}:${limit.to}`))
          .map((limit) => ({ ...limit })),
      },
      modelBindings: agentBindings,
      toolPolicy: { allowedTools: [...allowedTools] },
      guardrailProfileKey,
    }
  }

  function editorLayout() {
    return nodes.map(({ id, x, y }) => ({ id, x, y }))
  }

  async function loadEditorLayout(snapshot: ProfileAuthoringSnapshot, versionId: string, request: number) {
    try {
      const layout = await api.getEditorLayout(versionId)
      if (request !== versionRequest.current) return
      setNodes(restoreLayout(snapshot, layout.nodes))
    } catch (error) {
      if (request !== versionRequest.current || (error instanceof ProductApiError && error.status === 404)) return
      setFailure(`Editor Layout을 불러오지 못했습니다. ${describeFailure(error)}`)
    }
  }

  async function saveDraft() {
    if (!supported || nodes.length === 0) return
    setSaving(true)
    setStatus('')
    setFailure(null)
    setNotice(null)
    try {
      const created = await api.create(profileKey, authoringSnapshot())
      try {
        await api.saveEditorLayout(created.profileVersionId, editorLayout())
      } catch (error) {
        await loadVersions(profileKey, created.profileVersionId)
        setFailure(`v${created.profileVersion} DRAFT는 저장됐지만 Editor Layout 저장에 실패했습니다. ${describeFailure(error)}`)
        setStatus(`v${created.profileVersion} DRAFT Snapshot을 저장했고 자동 배치로 표시합니다.`)
        return
      }
      if (await loadVersions(profileKey, created.profileVersionId)) {
        setNotice(`v${created.profileVersion} DRAFT를 저장하고 다시 조회했습니다.`)
      }
    } catch (error) {
      setFailure(describeFailure(error))
    } finally {
      setSaving(false)
    }
  }

  async function loadDefaultTemplate() {
    if (!window.confirm(`${profileKey} 기본 템플릿을 편집 화면에 불러올까요? 현재 저장 Version은 변경되지 않습니다.`)) return
    setSaving(true)
    setStatus('')
    setFailure(null)
    setNotice(null)
    try {
      const template = await api.getDefaultTemplate(profileKey)
      applySnapshot(template.snapshot, null)
      setNotice(`${profileKey} 기본 템플릿을 불러왔습니다. 변경 후 새 DRAFT로 저장할 수 있습니다.`)
    } catch (error) {
      setFailure(describeFailure(error))
    } finally {
      setSaving(false)
    }
  }

  async function saveDefaultTemplate() {
    if (!supported || nodes.length === 0) return
    if (!window.confirm(`현재 ${profileKey} 구성을 기본 템플릿으로 저장할까요? 기존 DRAFT와 ACTIVE는 변경되지 않습니다.`)) return
    setSaving(true)
    setStatus('')
    setFailure(null)
    setNotice(null)
    try {
      await api.saveDefaultTemplate(profileKey, authoringSnapshot())
      setNotice(`현재 ${profileKey} 구성을 기본 템플릿으로 저장했습니다.`)
    } catch (error) {
      setFailure(describeFailure(error))
    } finally {
      setSaving(false)
    }
  }

  async function activateSelected() {
    if (!selectedVersion || selectedVersion.status !== 'DRAFT') return
    setSaving(true)
    setStatus('')
    setFailure(null)
    setNotice(null)
    try {
      const activated = await api.activate(selectedVersion.profileVersionId)
      if (await loadVersions(profileKey, activated.profileVersionId)) {
        setNotice(`v${activated.profileVersion}을 ACTIVE로 전환하고 다시 조회했습니다.`)
      }
    } catch (error) {
      setFailure(describeFailure(error))
    } finally {
      setSaving(false)
    }
  }

  function addNode(definition: HandlerDefinition) {
    if (!supported || loading || saving) return
    if (nodes.length >= config.maxNodes) {
      setStatus(`현재 Snapshot의 maxNodes ${config.maxNodes}개를 초과할 수 없습니다.`)
      return
    }
    if (definition.locked && nodes.some((node) => node.type === definition.type)) return
    const id = uniqueNodeId(definition.key.split('.').at(-1) ?? definition.type, nodes)
    const furthestColumn = Math.max(CANVAS_PADDING, ...nodes.map((item) => item.x))
    const columnNodes = nodes.filter((item) => item.x === furthestColumn).length
    const node: WorkflowNode = {
      id,
      type: definition.type,
      handlerKey: definition.key,
      resultPorts: [...definition.resultPorts],
      config: { ...definition.config },
      x: furthestColumn + LAYER_GAP_X,
      y: CANVAS_PADDING + columnNodes * LANE_GAP_Y,
    }
    setNodes((current) => [...current, node])
    if (node.type === 'agent') {
      setModelBindings((current) => ({
        ...current,
        [node.id]: { primary: defaultBinding(profileKey, node.handlerKey), fallback: [] },
      }))
    }
    setSelectedId(node.id)
    setConnectPort(node.resultPorts[0] ?? '')
    setConnectFrom(null)
    setNotice(null)
    setStatus(`${definition.label} Node를 추가했습니다.`)
  }

  function selectNode(id: string) {
    if (ignoreClick.current === id) {
      ignoreClick.current = null
      return
    }
    const target = nodes.find((node) => node.id === id)
    if (!target) return
    if (connectFrom) {
      const source = nodes.find((node) => node.id === connectFrom.nodeId)
      if (!source || source.id === target.id) {
        setStatus('같은 Node에는 연결할 수 없습니다.')
        return
      }
      if (target.type === 'start') {
        setStatus('Start Node는 연결 대상이 될 수 없습니다.')
        return
      }
      if (connectFrom.resultPort === 'failed'
        && ['common.guardrail', 'common.check'].includes(source.handlerKey)
        && target.type !== 'end') {
        setStatus('Guardrail·공통 Check의 failed Port는 End Node에만 연결할 수 있습니다.')
        return
      }
      setEdges((current) => [...current, { from: source.id, resultPort: connectFrom.resultPort, to: target.id }])
      setConnectFrom(null)
      setSelectedId(target.id)
      setConnectPort(target.resultPorts[0] ?? '')
      setStatus(`${source.id}.${connectFrom.resultPort} → ${target.id} 연결을 추가했습니다.`)
      return
    }
    setSelectedId(target.id)
    setConnectPort(target.resultPorts[0] ?? '')
    setStatus(`${target.id} Node를 선택했습니다.`)
  }

  function updateSelectedConfig(patch: Record<string, unknown>) {
    if (!selected) return
    setNodes((current) => current.map((node) => node.id === selected.id
      ? { ...node, config: { ...node.config, ...patch } }
      : node))
  }

  function updatePrimaryBinding(primary: string) {
    if (!selected || selected.type !== 'agent') return
    setModelBindings((current) => {
      const binding = current[selected.id] ?? { primary, fallback: [] }
      return { ...current, [selected.id]: { primary, fallback: binding.fallback.filter((item) => item !== primary) } }
    })
  }

  function toggleFallback(bindingKey: string) {
    if (!selected || selected.type !== 'agent') return
    setModelBindings((current) => {
      const binding = current[selected.id]
      if (!binding || binding.primary === bindingKey) return current
      return {
        ...current,
        [selected.id]: {
          ...binding,
          fallback: binding.fallback.includes(bindingKey)
            ? binding.fallback.filter((item) => item !== bindingKey)
            : [...binding.fallback, bindingKey],
        },
      }
    })
  }

  function toggleTool(tool: string) {
    setAllowedTools((current) => current.includes(tool)
      ? current.filter((item) => item !== tool)
      : [...current, tool])
  }

  function deleteSelected() {
    if (!selected || selectedDefinition?.locked) return
    const remaining = nodes.filter((node) => node.id !== selected.id)
    setNodes(remaining)
    setEdges((current) => current.filter((edge) => edge.from !== selected.id && edge.to !== selected.id))
    setModelBindings((current) => Object.fromEntries(Object.entries(current).filter(([nodeId]) => nodeId !== selected.id)))
    const nextSelected = remaining[0] ?? null
    setSelectedId(nextSelected?.id ?? '')
    setConnectPort(nextSelected?.resultPorts[0] ?? '')
    setConnectFrom(null)
    setStatus(`${selected.id} Node를 삭제했습니다.`)
  }

  function beginConnect() {
    if (!selected || !connectPort) return
    if (edges.some((edge) => edge.from === selected.id && edge.resultPort === connectPort)) {
      setStatus(`${selected.id}.${connectPort} Port는 이미 연결되어 있습니다. 기존 연결을 먼저 해제하세요.`)
      return
    }
    setConnectFrom({ nodeId: selected.id, resultPort: connectPort })
    setStatus(`${selected.id}.${connectPort}에서 연결할 대상 Node를 선택하세요.`)
  }

  function disconnect(edge: ProfileSnapshotEdge) {
    setEdges((current) => current.filter((item) => item !== edge))
    setConnectFrom(null)
    setStatus(`${edge.from}.${edge.resultPort} → ${edge.to} 연결을 해제했습니다.`)
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, node: WorkflowNode) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { id: node.id, pointerX: event.clientX, pointerY: event.clientY, x: node.x, y: node.y, moved: false }
    setSelectedId(node.id)
    setConnectPort(node.resultPorts[0] ?? '')
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const active = drag.current
    if (!active) return
    const deltaX = (event.clientX - active.pointerX) / canvasZoom
    const deltaY = (event.clientY - active.pointerY) / canvasZoom
    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) active.moved = true
    const maxX = Math.max(CANVAS_PADDING, canvas.width - NODE_WIDTH - CANVAS_PADDING + LAYER_GAP_X)
    const maxY = Math.max(CANVAS_PADDING, canvas.nodeAreaHeight - NODE_HEIGHT - CANVAS_PADDING + LANE_GAP_Y)
    setNodes((current) => current.map((node) => node.id === active.id
      ? { ...node, x: Math.max(CANVAS_PADDING, Math.min(maxX, active.x + deltaX)), y: Math.max(CANVAS_PADDING, Math.min(maxY, active.y + deltaY)) }
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
      setStatus(`${node.id} Node 위치와 Snapshot 순서를 변경했습니다.`)
    }
  }

  function autoArrange() {
    setNodes(layoutSnapshotNodes(nodes, edges))
    setStatus('Node·Edge 구조를 기준으로 자동 배치했습니다. 위치는 새 DRAFT 저장 전까지 로컬에만 유지됩니다.')
  }

  function startCanvasPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    const viewport = canvasViewport.current
    if (!viewport) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pan.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    }
    setPanning(true)
  }

  function moveCanvasPan(event: ReactPointerEvent<HTMLDivElement>) {
    const active = pan.current
    const viewport = canvasViewport.current
    if (!active || !viewport || active.pointerId !== event.pointerId) return
    viewport.scrollLeft = active.scrollLeft - (event.clientX - active.pointerX)
    viewport.scrollTop = active.scrollTop - (event.clientY - active.pointerY)
  }

  function endCanvasPan(event: ReactPointerEvent<HTMLDivElement>) {
    const active = pan.current
    if (!active || active.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)
    pan.current = null
    setPanning(false)
  }

  function zoomCanvas(event: WheelEvent) {
    if (event.deltaY === 0) return
    event.preventDefault()
    const viewport = canvasViewport.current
    if (!viewport) return
    const nextZoom = Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, Number((canvasZoom + (event.deltaY < 0 ? CANVAS_ZOOM_STEP : -CANVAS_ZOOM_STEP)).toFixed(1))))
    if (nextZoom === canvasZoom) return
    const viewportRect = viewport.getBoundingClientRect()
    const pointerX = event.clientX - viewportRect.left
    const pointerY = event.clientY - viewportRect.top
    const canvasX = (viewport.scrollLeft + pointerX) / canvasZoom
    const canvasY = (viewport.scrollTop + pointerY) / canvasZoom
    setCanvasZoom(nextZoom)
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, canvasX * nextZoom - pointerX)
      viewport.scrollTop = Math.max(0, canvasY * nextZoom - pointerY)
    })
  }

  const relatedEdges = selected ? edges.filter((edge) => edge.from === selected.id || edge.to === selected.id) : []
  const selectedBinding = selected?.type === 'agent' ? modelBindings[selected.id] : null

  return <>
    <WorkflowStatusToast message={notice ?? status} />
    <section id="agent-settings-panel-workflow" role="tabpanel" aria-labelledby="agent-settings-tab-workflow">
    <Callout tone="ok" icon="shield-check">
      Profile별 기본 템플릿 또는 저장된 Snapshot을 편집해 새 불변 DRAFT로 저장합니다. 활성화 검증은 Backend Validator가 최종 강제합니다.
    </Callout>

    <section className={`${panel} mt-3 p-4`} aria-label="Workflow Profile Version">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1 text-[0.71875rem] font-semibold text-body">기능 Profile
          <select aria-label="Workflow Profile" className={control} value={profileKey} disabled={saving} onChange={(event) => setProfileKey(event.target.value as ProfileKey)}>
            <option value="LLM_OPS">LLM_OPS · LLM Ops</option>
            <option value="NATURAL_CMS">NATURAL_CMS · Natural CMS</option>
          </select>
        </label>
        <label className="min-w-56 flex-[2] text-[0.71875rem] font-semibold text-body">저장된 Version
          <select
            aria-label="저장된 Workflow Version"
            className={control}
            value={selectedVersionId ?? ''}
            disabled={loading || saving || versions.length === 0}
            onChange={(event) => chooseVersion(event.target.value)}
          >
            {selectedVersionId === null && <option value="">기본 템플릿 편집 중</option>}
            {versions.map((version) => <option key={version.profileVersionId} value={version.profileVersionId}>v{version.profileVersion} · {version.status}</option>)}
          </select>
        </label>
        <Badge tone={selectedVersion?.status === 'ACTIVE' ? 'ok' : selectedVersion?.status === 'DRAFT' ? 'wait' : 'idle'} dot={false}>
          {loading ? '조회 중' : selectedVersion?.status ?? '기본 템플릿'}
        </Badge>
      </div>
      {failure && <div role="alert" className="mt-3 rounded border border-[#ead2d2] bg-fail-bg px-3 py-2 text-[0.71875rem] text-fail-fg">{failure}</div>}
      {!supported && nodes.length > 0 && <div role="alert" className="mt-3 rounded border border-[#ead2d2] bg-fail-bg px-3 py-2 text-[0.71875rem] text-fail-fg">현재 UI 허용 목록에 없는 Handler·Model Binding·Tool이 포함되어 편집과 저장을 중단했습니다.</div>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} style={{ backgroundColor: '#e8f4fa', color: '#245b78', borderColor: '#9fc7dc' }} disabled={loading || saving || nodes.length === 0} onClick={autoArrange}>자동 배치</button>
        <button type="button" className={secondaryButton} style={{ backgroundColor: '#f4effb', color: '#684b86', borderColor: '#cdb9df' }} disabled={loading || saving} onClick={() => void loadDefaultTemplate()}>기본 템플릿 불러오기</button>
        <button type="button" className={secondaryButton} style={{ backgroundColor: '#fff4e8', color: '#8a5a24', borderColor: '#e5c59e' }} disabled={loading || saving || !supported || nodes.length === 0} onClick={() => void saveDefaultTemplate()}>기본 템플릿 저장</button>
        <button type="button" className={primaryButton} style={{ color: '#fff' }} disabled={loading || saving || !supported || nodes.length === 0} onClick={() => void saveDraft()}>새 DRAFT 저장</button>
        <button type="button" className={secondaryButton} style={{ backgroundColor: '#e9f6ee', color: '#246b45', borderColor: '#a7d5b9' }} disabled={saving || selectedVersion?.status !== 'DRAFT'} onClick={() => void activateSelected()}>선택 DRAFT 활성화</button>
        <button type="button" className={secondaryButton} style={{ backgroundColor: '#f0f2f5', color: '#435264', borderColor: '#c6cdd6' }} disabled={loading || saving} onClick={() => void loadVersions(profileKey, selectedVersionId ?? undefined)}>다시 조회</button>
      </div>
    </section>

    <div className={`${panel} mt-3 grid h-[48rem] overflow-hidden xl:grid-cols-[20rem_minmax(0,1fr)]`}>
      <div className="order-2 flex min-h-0 min-w-0 flex-col bg-[#f8fafc] xl:order-2">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-white px-4 py-3">
          <b className="text-[0.8125rem] font-semibold">{profileKey} Snapshot</b>
          <Tag>등록 Handler</Tag><Tag>Version API</Tag>
          <span className="ml-auto text-[0.6875rem] text-muted-2">Node {nodes.length} · Edge {edges.length}</span>
        </div>
        <div ref={canvasViewport} className={`relative m-4 min-h-0 flex-1 overflow-auto rounded-md border border-[#343c46] bg-[#20262e] ${panning ? 'cursor-grabbing' : 'cursor-grab'}`} aria-label="Node 편집 Canvas" data-canvas-viewport data-canvas-width={canvas.width} data-canvas-height={canvas.height} data-canvas-zoom={canvasZoom}>
          <div style={{ width: canvas.width * canvasZoom, height: canvas.height * canvasZoom }}>
            <div className="relative bg-[#20262e] bg-[radial-gradient(circle,#596472_1px,transparent_1px)] [background-size:20px_20px]" data-canvas-content style={{ width: canvas.width, height: canvas.height, transform: `scale(${canvasZoom})`, transformOrigin: 'top left' }} onPointerDown={startCanvasPan} onPointerMove={moveCanvasPan} onPointerUp={endCanvasPan} onPointerCancel={endCanvasPan}>
            <div className="pointer-events-none absolute right-3 top-3 z-20 flex items-center gap-3 rounded-md border border-white/10 bg-[#151a20]/90 px-3 py-2 text-[0.625rem] text-[#cbd5df] shadow-lg">
              <span>Edge별 좌·우 Port 자동 배치</span>
              <span className="h-3 border-l border-white/15" aria-hidden="true" />
              <span>Retry·Reject 하단 Routing</span>
              <span className="h-3 border-l border-white/15" aria-hidden="true" />
              <span aria-label="Canvas 확대 비율">{Math.round(canvasZoom * 100)}%</span>
            </div>
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${canvas.width} ${canvas.height}`} preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <marker id="workflow-edge-arrow" viewBox="0 0 7 7" refX="6" refY="3.5" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M 0 0 L 7 3.5 L 0 7 z" fill="#8f9aa8" />
                </marker>
                <marker id="workflow-edge-arrow-active" viewBox="0 0 7 7" refX="6" refY="3.5" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M 0 0 L 7 3.5 L 0 7 z" fill="#60a5fa" />
                </marker>
              </defs>
              {edges.map((edge, edgeIndex) => {
                const from = nodes.find((node) => node.id === edge.from)
                const to = nodes.find((node) => node.id === edge.to)
                if (!from || !to) return null
                const { reverse, sourcePort, targetPort } = resolveEdgePorts(edge, nodes, edges)
                const direction = sourcePort === 'right' ? 1 : -1
                const x1 = sourcePort === 'right' ? from.x + NODE_WIDTH : from.x
                const y1 = from.y + NODE_PORT_Y
                const x2 = targetPort === 'right' ? to.x + NODE_WIDTH : to.x
                const y2 = to.y + NODE_PORT_Y
                const bend = Math.max(42, Math.abs(x2 - x1) * 0.45)
                const arrivalTilt = Math.max(-96, Math.min(96, (y1 - y2) * 0.24))
                const detour = isDetourEdge(edge, nodes)
                const detourIndex = edges.slice(0, edgeIndex).filter((item) => isDetourEdge(item, nodes)).length
                const detourY = Math.min(canvas.height - CANVAS_PADDING / 2, Math.max(from.y + NODE_HEIGHT, to.y + NODE_HEIGHT) + CANVAS_PADDING + detourIndex * DETOUR_LANE_GAP)
                const detourRight = Math.min(canvas.width - CANVAS_PADDING / 2, x1 + 68)
                const detourLeft = Math.max(CANVAS_PADDING / 2, x2 - 68)
                const path = reverse
                  ? `M ${x1} ${y1} C ${x1 + direction * bend} ${y1}, ${x2 + direction * bend} ${y2 + arrivalTilt}, ${x2} ${y2}`
                  : detour
                  ? `M ${x1} ${y1} C ${x1 + 34} ${y1}, ${x1 + 34} ${detourY}, ${detourRight} ${detourY} L ${detourLeft} ${detourY} C ${x2 - 34} ${detourY}, ${x2 - 34} ${y2}, ${x2} ${y2}`
                  : `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
                const active = selectedId === edge.from || selectedId === edge.to
                return <path
                  key={`${edge.from}-${edge.resultPort}-${edge.to}`}
                  d={path}
                  data-edge-route={detour ? 'detour' : 'direct'}
                  data-edge-lane={detour ? detourIndex : undefined}
                  data-edge-from={edge.from}
                  data-edge-to={edge.to}
                  data-edge-source-port={sourcePort}
                  data-edge-target-port={targetPort}
                  data-edge-active={active ? 'true' : 'false'}
                  fill="none"
                  stroke={active ? '#60a5fa' : '#8f9aa8'}
                  strokeWidth={active ? 2.5 : 1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={active ? 1 : 0.82}
                  markerEnd={active ? 'url(#workflow-edge-arrow-active)' : 'url(#workflow-edge-arrow)'}
                />
              })}
            </svg>

            {nodes.map((node, index) => {
              const info = nodeTypes[node.type]
              const definition = definitionFor(profileKey, node.handlerKey)
              const active = selectedId === node.id
              const source = connectFrom?.nodeId === node.id
              return <article
                key={node.id}
                aria-label={`${node.id} Node`}
                aria-current={active ? 'true' : undefined}
                data-node-selected={active ? 'true' : 'false'}
                data-node-x={node.x}
                data-node-y={node.y}
                className={`absolute z-10 rounded-md border bg-white p-[0.625rem] shadow-[0_8px_22px_#070a0e59] transition-[border-color,box-shadow,transform] duration-150 ${active ? 'z-20 scale-[1.035] border-2 border-[#2f8de4] shadow-[0_0_0_4px_rgba(96,165,250,.28),0_16px_34px_rgba(7,10,14,.52)]' : source ? 'border-wait-dot ring-2 ring-wait-bg' : 'border-[#cbd3dc]'}`}
                style={{
                  left: node.x,
                  top: node.y,
                  width: NODE_WIDTH,
                  minHeight: NODE_HEIGHT,
                  ...(active ? {
                    transform: 'scale(1.035)',
                    borderColor: '#2f8de4',
                    borderWidth: 2,
                    boxShadow: '0 0 0 4px rgba(96, 165, 250, .28), 0 16px 34px rgba(7, 10, 14, .52)',
                  } : {}),
                }}
                onClick={() => selectNode(node.id)}
              >
                {active && <span className="absolute -top-3 right-2 rounded-full border border-[#8bc5f5] bg-[#eaf5ff] px-2 py-0.5 text-[0.5625rem] font-bold text-[#1f6fab] shadow-sm" aria-hidden="true">선택됨</span>}
                <span data-node-port="left" className={`absolute -left-[0.3125rem] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 bg-white shadow-[0_0_0_2px_#20262e] ${source ? 'border-[#f0a34a]' : active ? 'border-[#60a5fa]' : 'border-[#778392]'}`} aria-hidden="true" />
                <span data-node-port="right" className={`absolute -right-[0.3125rem] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 bg-white shadow-[0_0_0_2px_#20262e] ${source ? 'border-[#f0a34a]' : active ? 'border-[#60a5fa]' : 'border-[#778392]'}`} aria-hidden="true" />
                <button
                  type="button"
                  aria-label={`${node.id} Node 이동`}
                  className="flex w-full cursor-grab touch-none items-center gap-2 bg-transparent p-0 text-left active:cursor-grabbing"
                  onPointerDown={(event) => startDrag(event, node)}
                  onPointerMove={moveDrag}
                  onPointerUp={(event) => endDrag(event, node)}
                  onPointerCancel={(event) => endDrag(event, node)}
                >
                  <span className={`grid h-6 w-6 place-items-center rounded ${info.skin}`}><Icon name={info.icon} size={13} /></span>
                  <span className="min-w-0 flex-1 truncate text-[0.75rem] font-semibold">{definition?.label ?? node.handlerKey}</span>
                </button>
                <div className="mt-2 text-[0.625rem] text-muted-2"><code className="block truncate">{node.id}</code><span>{info.meta} · 순서 {index + 1}</span></div>
              </article>
            })}
            </div>
          </div>
        </div>
      </div>

      <aside className="order-1 min-h-0 overflow-y-auto border-t border-line-soft bg-white p-4 xl:order-1 xl:border-r xl:border-t-0" aria-label="Workflow control dock">
        <section aria-label="Snapshot 설정">
          <b className="text-[0.84375rem] font-semibold">Snapshot 설정</b>
          <label className="mt-3 block text-[0.71875rem] font-semibold text-body">최대 Node 수 (maxNodes)
            <input
              type="number"
              min={Math.max(1, nodes.length)}
              step={1}
              aria-label="최대 Node 수 (maxNodes)"
              className={control}
              value={config.maxNodes}
              disabled={loading || saving || !supported}
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10)
                if (Number.isInteger(value)) {
                  setConfig((current) => ({ ...current, maxNodes: Math.max(nodes.length, value) }))
                }
              }}
            />
          </label>
          <p className="mt-2 text-[0.6875rem] leading-5 text-muted-2">현재 Node {nodes.length}개 · 새 DRAFT 저장 시 적용됩니다.</p>
        </section>

        <b className="mt-4 block border-t border-row-line pt-4 text-[0.84375rem] font-semibold">Node 설정</b>
        {!selected && <p className="mt-3 text-xs text-muted-2">Node를 선택하세요.</p>}
        {selected && <div className="mt-3">
          <label className="block text-[0.71875rem] font-semibold text-body">Node ID
            <input aria-label="선택 Node ID" className={`${control} cursor-not-allowed`} style={{ backgroundColor: '#f1f3f5', color: '#3f4a56', borderColor: '#d5dbe2' }} value={selected.id} readOnly />
          </label>
          <label className="mt-3 block text-[0.71875rem] font-semibold text-body">등록 Handler
            <input aria-label="선택 Handler" className={`${control} cursor-not-allowed`} style={{ backgroundColor: '#f1f3f5', color: '#3f4a56', borderColor: '#d5dbe2' }} value={selected.handlerKey} readOnly />
          </label>

          {selected.type === 'agent' && selectedBinding && <div className="mt-3 border-t border-row-line pt-3">
            <label className="block text-[0.71875rem] font-semibold text-body">주 모델 (Primary Model)
              <select aria-label="선택 주 모델" className={control} value={selectedBinding.primary} onChange={(event) => updatePrimaryBinding(event.target.value)}>
                {modelBindingCatalog[profileKey].map((binding) => <option key={binding} value={binding}>{modelBindingLabel(binding)}</option>)}
              </select>
              <small className="mt-1 block text-[0.625rem] font-normal leading-4 text-muted-2">괄호 안 Binding Key를 Snapshot에 저장하고 Backend가 실제 Provider·Model로 해석합니다.</small>
            </label>
            <fieldset className="mt-3">
              <legend className="text-[0.71875rem] font-semibold text-body">대체 모델 (Fallback Model)</legend>
              <p className="mt-1 text-[0.625rem] leading-4 text-muted-2">주 모델의 미설정·사용량 제한·시간 초과·Provider 장애 등 일시적 오류에 사용할 후보입니다.</p>
              <div className="mt-2 space-y-2">
                {modelBindingCatalog[profileKey].filter((binding) => binding !== selectedBinding.primary).map((binding) => <label key={binding} className="flex items-start gap-2 text-[0.65625rem] text-body">
                  <input type="checkbox" aria-label={`Fallback ${binding}`} checked={selectedBinding.fallback.includes(binding)} onChange={() => toggleFallback(binding)} />
                  <span className="break-all">{modelBindingLabel(binding)}</span>
                </label>)}
              </div>
            </fieldset>
          </div>}

          {selected.handlerKey === 'coding.approval' && <div className="mt-3 border-t border-row-line pt-3">
            <label className="block text-[0.71875rem] font-semibold text-body">승인 Stage
              <select aria-label="Coding 승인 Stage" className={control} value={String(selected.config.stage)} onChange={(event) => updateSelectedConfig({ stage: event.target.value })}>
                {['SCOPE', 'GITHUB', 'CMS', 'DEPLOY'].map((stage) => <option key={stage}>{stage}</option>)}
              </select>
            </label>
            <ApprovalRole value={String(selected.config.requiredRole)} onChange={(requiredRole) => updateSelectedConfig({ requiredRole })} />
          </div>}

          {selected.handlerKey === 'coding.preview_approval' && <div className="mt-3 border-t border-row-line pt-3">
            <Badge tone="ok" dot={false}>CANDIDATE Approval</Badge>
            <ApprovalRole value={String(selected.config.requiredRole)} onChange={(requiredRole) => updateSelectedConfig({ requiredRole })} />
          </div>}

          {selected.handlerKey === 'coding.rework_gate' && <label className="mt-3 block border-t border-row-line pt-3 text-[0.71875rem] font-semibold text-body">최대 재작업 Round
            <input
              type="number"
              min={1}
              aria-label="최대 재작업 Round"
              className={control}
              value={Number(selected.config.maxReworkRounds)}
              onChange={(event) => updateSelectedConfig({ maxReworkRounds: Math.max(1, Number(event.target.value) || 1) })}
            />
          </label>}

          {(selected.type === 'approval' || selected.type === 'check') && <div className="mt-3"><Badge tone="ok" dot={false}>production Handler 연결</Badge></div>}
          {selected.type === 'guardrail' && <div className="mt-3 text-[0.6875rem] leading-5 text-muted-2"><Badge tone="idle" dot={false}>Snapshot 잠금 계약</Badge><p className="mt-2">Guardrail은 삭제하거나 비활성화할 수 없습니다.</p></div>}

          {selected.resultPorts.length > 0 && <div className="mt-4 border-t border-row-line pt-3">
            <label className="block text-[0.71875rem] font-semibold text-body">연결 Result Port
              <select aria-label="연결 Result Port" className={control} value={connectPort} onChange={(event) => setConnectPort(event.target.value)}>
                {selected.resultPorts.map((port) => <option key={port}>{port}</option>)}
              </select>
            </label>
            <button type="button" className={`${connectFrom?.nodeId === selected.id ? secondaryButton : primaryButton} mt-2 w-full justify-center`} style={connectFrom?.nodeId === selected.id ? undefined : { color: '#fff' }} onClick={() => {
              if (connectFrom?.nodeId === selected.id) {
                setConnectFrom(null)
                setStatus('Node 연결 선택을 취소했습니다.')
              } else beginConnect()
            }}>{connectFrom?.nodeId === selected.id ? '연결 선택 취소' : '이 Port에서 연결'}</button>
          </div>}

          <button
            type="button"
            className={`${dangerButton} mt-3 w-full justify-center`}
            disabled={selectedDefinition?.locked}
            title={selectedDefinition?.locked ? 'Start·Guardrail·End 필수 Node는 삭제할 수 없습니다.' : undefined}
            onClick={deleteSelected}
          >Node 삭제</button>

          <section className="mt-4 border-t border-row-line pt-3" aria-label="선택 Node Edge">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded text-left"
              aria-expanded={edgeListOpen}
              aria-controls="selected-node-edge-panel"
              onClick={() => setEdgeListOpen((current) => !current)}
            >
              <span className="text-[0.71875rem] font-semibold text-body">Edge <span className="font-normal text-muted-2">({relatedEdges.length})</span></span>
              <span className="text-[0.6875rem] font-semibold text-muted">{edgeListOpen ? '접기' : '펼치기'}</span>
            </button>
            <div id="selected-node-edge-panel" className={edgeListOpen ? 'mt-2' : 'hidden'}>
              {relatedEdges.length === 0 && <p className="text-[0.6875rem] text-muted-2">연결 없음</p>}
              <div className="space-y-2">
              {relatedEdges.map((edge) => {
                return <div key={`${edge.from}-${edge.resultPort}-${edge.to}`} className="flex items-center gap-2 rounded border border-line-soft bg-sub px-2 py-[0.4375rem] text-[0.6875rem]">
                  <span className="min-w-0 flex-1 truncate">{`${edge.from}.${edge.resultPort} → ${edge.to}`}</span>
                  <button type="button" className="font-semibold text-fail-fg" aria-label={`${edge.from}.${edge.resultPort}에서 ${edge.to} 연결 해제`} onClick={() => disconnect(edge)}>해제</button>
                </div>
              })}
              </div>
            </div>
          </section>
        </div>}

        <section className="mt-5 border-t border-row-line pt-4" aria-label="Node Palette">
          <button
            type="button"
            className="flex w-full items-start justify-between gap-3 rounded text-left"
            aria-expanded={handlerPaletteOpen}
            aria-controls="handler-palette-panel"
            onClick={() => setHandlerPaletteOpen((current) => !current)}
          >
            <span><b className="block text-[0.84375rem] font-semibold">등록 Handler Palette</b><small className="mt-1 block text-[0.6875rem] text-muted-2">Backend production 계약에 등록된 Node만 추가</small></span>
            <span className="mt-1 text-[0.6875rem] font-semibold text-muted">{handlerPaletteOpen ? '접기' : '펼치기'}</span>
          </button>
          <div id="handler-palette-panel" className={handlerPaletteOpen ? 'mt-3 grid gap-2' : 'hidden'}>
            {handlerCatalog[profileKey].map((definition) => {
              const info = nodeTypes[definition.type]
              const exists = definition.locked && nodes.some((node) => node.type === definition.type)
              return <button
                key={definition.key}
                type="button"
                className="flex items-center gap-2 rounded-md border border-btn-line bg-white px-3 py-[0.625rem] text-left text-xs font-semibold enabled:hover:bg-page disabled:opacity-45"
                disabled={exists || loading || saving || !supported}
                onClick={() => addNode(definition)}
              >
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded ${info.skin}`}><Icon name={info.icon} size={13} /></span>
                <span className="min-w-0"><span className="block truncate">{definition.label}</span><code className="block truncate text-[0.5625rem] font-normal text-muted-2">{definition.key}</code></span>
              </button>
            })}
          </div>
        </section>

        <section className="mt-4 border-t border-row-line pt-4">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-expanded={toolPolicyOpen}
            aria-controls="profile-tool-policy-panel"
            onClick={() => setToolPolicyOpen((current) => !current)}
          >
            <span className="text-[0.71875rem] font-semibold text-body">Profile 허용 도구 (Tool)</span>
            <span className="text-[0.6875rem] font-semibold text-muted">{toolPolicyOpen ? '접기' : '펼치기'}</span>
          </button>
          <fieldset id="profile-tool-policy-panel" className={toolPolicyOpen ? 'mt-2 space-y-2' : 'hidden'} disabled={loading || saving || !supported}>
            <legend className="sr-only">Profile 허용 도구 (Tool)</legend>
            <p className="text-[0.625rem] leading-4 text-muted-2">선택한 도구만 이 Profile에서 사용할 수 있으며 Snapshot의 toolPolicy에 저장됩니다.</p>
            {toolCatalog[profileKey].map((tool) => {
              const detail = toolDetails[tool]
              return <label key={tool} className="flex items-start gap-2 text-[0.65625rem] text-body">
                <input className="mt-0.5" type="checkbox" aria-label={`허용 Tool ${tool}`} checked={allowedTools.includes(tool)} onChange={() => toggleTool(tool)} />
                <span className="min-w-0">
                  <span className="block font-semibold">{detail?.label ?? tool} <code className="font-normal">({tool})</code></span>
                  <small className="mt-0.5 block text-[0.625rem] leading-4 text-muted-2">{detail?.description ?? '이 Profile에서 사용할 수 있는 등록 Tool입니다.'}</small>
                </span>
              </label>
            })}
          </fieldset>
        </section>
      </aside>
    </div>
    </section>
  </>
}

function WorkflowStatusToast({ message }: { message: string }) {
  return message ? <div className="pointer-events-none fixed inset-0 z-[100] grid place-items-center p-5" aria-live="polite" aria-atomic="true">
    <div key={message} className="cms-success-toast flex max-w-[32.5rem] items-center gap-3 rounded-lg bg-[#16293c] px-6 py-5 text-sm font-semibold text-white shadow-[0_24px_70px_rgba(22,41,60,.35)]" role="status">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-base text-[#16293c]" aria-hidden="true">✓</span>
      <span>{message}</span>
    </div>
  </div> : null
}

function ApprovalRole({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="mt-3 block text-[0.71875rem] font-semibold text-body">필수 역할
    <select aria-label="승인 필수 역할" className={control} value={value} onChange={(event) => onChange(event.target.value)}>
      <option>GENERAL_ADMIN</option>
      <option>SUPER_ADMIN</option>
    </select>
  </label>
}

function modelBindingLabel(bindingKey: string) {
  const detail = modelBindingDetails[bindingKey]
  return detail ? `${detail.provider} · ${detail.model} (${bindingKey})` : bindingKey
}

function definitionFor(profileKey: ProfileKey, handlerKey: string) {
  return handlerCatalog[profileKey].find((definition) => definition.key === handlerKey) ?? null
}

function matchesDefinition(profileKey: ProfileKey, node: ProfileSnapshotNode) {
  const definition = definitionFor(profileKey, node.handlerKey)
  return definition !== null
    && definition.type === node.type
    && definition.resultPorts.length === node.resultPorts.length
    && definition.resultPorts.every((port) => node.resultPorts.includes(port))
}

function defaultBinding(profileKey: ProfileKey, handlerKey: string) {
  if (handlerKey === 'coding.code') return 'llm-ops-code'
  if (handlerKey === 'coding.review') return 'llm-ops-review'
  if (handlerKey === 'cms.preview') return 'natural-cms-command'
  return modelBindingCatalog[profileKey][0]
}

function uniqueNodeId(base: string, nodes: WorkflowNode[]) {
  if (!nodes.some((node) => node.id === base)) return base
  let suffix = 2
  while (nodes.some((node) => node.id === `${base}_${suffix}`)) suffix += 1
  return `${base}_${suffix}`
}

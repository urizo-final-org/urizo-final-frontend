import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { describeFailure, ProductApiError } from '../../shared/api/error'
import { Icon } from '../../shared/ui/icons'
import {
  Badge, Callout, NoticePanel, Tag, control, dangerButton, panel, primaryButton, secondaryButton,
} from '../../shared/ui/primitives'
import type {
  ModelCatalog, ModelCatalogApiClient, ModelCatalogModel, ProfileAuthoringSnapshot, ProfileDefaultTemplateApiClient, ProfileEditorLayoutApiClient, ProfileKey, ProfileModelBinding, ProfileModelSelection, ProfileNodeType, ProfileSnapshotConfig, ProfileToolBindings, ToolBindingMode,
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
  capabilityLaneTop: number
}

type EdgePortSide = 'left' | 'right'
type ToolLayout = 'orbit' | 'dock'

interface HandlerDefinition {
  key: string
  type: ProfileNodeType
  label: string
  resultPorts: string[]
  config: Record<string, unknown>
  locked?: true
}

interface ToolCapabilityBinding {
  nodeId: string
  tool: string
  mode: ToolBindingMode
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

const defaultModel = {
  selectionId: 'google-genai-gemini-3-6-flash',
  selection: {
    provider: 'GOOGLE_GENAI' as const,
    model: 'gemini-3.6-flash',
    inference: { reasoningIntensity: 'MEDIUM' },
  },
}

const legacyModelSelections: Record<string, ProfileModelSelection> = {
  'llm-ops-analyze': { provider: 'OPENAI', model: 'gpt-5.4-nano', inference: { reasoningIntensity: 'NONE' } },
  'llm-ops-code': { provider: 'OPENAI', model: 'gpt-5.4-nano', inference: { reasoningIntensity: 'NONE' } },
  'llm-ops-review': { provider: 'GOOGLE_GENAI', model: 'gemini-3.5-flash-lite', inference: { reasoningIntensity: 'MINIMAL' } },
  'llm-ops-claude': { provider: 'ANTHROPIC', model: 'claude-haiku-4-5-20251001', inference: { reasoningIntensity: 'NONE' } },
  'natural-cms-analyze': { provider: 'OPENAI', model: 'gpt-5.4-nano', inference: { reasoningIntensity: 'NONE' } },
  'natural-cms-command': { provider: 'GOOGLE_GENAI', model: 'gemini-3.5-flash-lite', inference: { reasoningIntensity: 'MINIMAL' } },
  'natural-cms-claude': { provider: 'ANTHROPIC', model: 'claude-haiku-4-5-20251001', inference: { reasoningIntensity: 'NONE' } },
}

function defaultModelBinding(): ProfileModelBinding {
  return {
    primary: defaultModel.selectionId,
    fallback: [],
    selections: { [defaultModel.selectionId]: { ...defaultModel.selection, inference: { ...defaultModel.selection.inference } } },
  }
}

// Legacy snapshots have only profile-wide allowedTools. These Backend fixture defaults
// hydrate the new per-node contract without changing nodes, edges, or model bindings.
const defaultToolBindingsByHandler: Record<ProfileKey, Record<string, Record<string, ToolBindingMode>>> = {
  LLM_OPS: {
    'coding.code': {
      read_file: 'MODEL_OPTIONAL', search_code: 'MODEL_OPTIONAL', read_diff: 'MODEL_OPTIONAL', apply_patch: 'MODEL_OPTIONAL',
      run_check: 'MODEL_OPTIONAL', check_package_allowlist: 'MODEL_OPTIONAL', scan_changed_files: 'MODEL_OPTIONAL',
    },
    'coding.review': {
      read_file: 'MODEL_OPTIONAL', search_code: 'MODEL_OPTIONAL', read_diff: 'MODEL_OPTIONAL', run_check: 'MODEL_OPTIONAL',
      check_package_allowlist: 'MODEL_OPTIONAL', scan_changed_files: 'MODEL_OPTIONAL',
    },
    'coding.preview': {
      read_diff: 'SYSTEM_REQUIRED', run_check: 'SYSTEM_REQUIRED', check_package_allowlist: 'SYSTEM_REQUIRED', scan_changed_files: 'SYSTEM_REQUIRED',
    },
  },
  NATURAL_CMS: {
    'cms.preview': { validate_cms_command: 'MODEL_REQUIRED', resolve_cms_target: 'SYSTEM_REQUIRED', create_cms_preview: 'SYSTEM_REQUIRED' },
    'cms.discard': { discard_cms_preview: 'SYSTEM_REQUIRED' },
    'cms.apply': { revalidate_cms_preview: 'SYSTEM_REQUIRED', apply_cms_preview: 'SYSTEM_REQUIRED' },
  },
}

const TOOL_LAYOUT_KEY = 'axms-workflow-tool-layout'
const NODE_WIDTH = 160
const NODE_HEIGHT = 88
const NODE_PORT_Y = 42
const CANVAS_PADDING = 48
const LAYER_GAP_X = 244
const LANE_GAP_Y = 160
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

function cloneToolBindings(bindings: ProfileToolBindings): ProfileToolBindings {
  return Object.fromEntries(Object.entries(bindings).map(([nodeId, tools]) => [nodeId, { ...tools }]))
}

function hydrateToolBindings(profileKey: ProfileKey, nodes: ProfileSnapshotNode[], bindings: ProfileToolBindings | undefined): ProfileToolBindings {
  if (bindings !== undefined) return cloneToolBindings(bindings)
  return Object.fromEntries(nodes.flatMap((node) => {
    const defaults = defaultToolBindingsByHandler[profileKey][node.handlerKey]
    return defaults ? [[node.id, { ...defaults }]] : []
  }))
}

function capabilityBindings(nodes: WorkflowNode[], toolBindings: ProfileToolBindings): ToolCapabilityBinding[] {
  return nodes.flatMap((node) => Object.entries(toolBindings[node.id] ?? {}).map(([tool, mode]) => ({ nodeId: node.id, tool, mode })))
}

function nodeRole(node: ProfileSnapshotNode) {
  return node.type === 'agent' ? 'handler' as const : 'runner' as const
}

function nodeDisplayName(profileKey: ProfileKey, node: ProfileSnapshotNode) {
  if (node.type === 'start') return '시작'
  if (node.type === 'end') return '종료'
  if (node.type === 'guardrail') return '잠금 가드레일'
  if (node.handlerKey === 'coding.approval') return `${String(node.config.stage ?? '작업')} 승인`
  if (node.handlerKey === 'coding.preview_approval') return '변경 후보 승인'
  if (node.handlerKey === 'coding.preview') return '변경 미리보기'
  return definitionFor(profileKey, node.handlerKey)?.label ?? node.handlerKey
}

const resultPortLabels: Record<string, string> = {
  next: '다음', passed: '통과', failed: '실패', feasible: '진행 가능', infeasible: '진행 불가',
  approved: '승인', rejected: '거절', completed: '완료', changes_requested: '수정 요청', retry: '재시도',
  handover: '인계', ready: '준비 완료', requested: '요청 완료', recorded: '기록 완료', merged: '병합 완료',
  not_merged: '미병합', blocked: '차단', discarded: '폐기', applied: '반영 완료',
}

function resultPortLabel(port: string) {
  return resultPortLabels[port] ?? port.replaceAll('_', ' ')
}

function orbitalToolPosition(source: WorkflowNode, index: number, count: number) {
  const angle = count === 1 ? Math.PI / 2 : Math.PI * (0.12 + (0.76 * index) / (count - 1))
  return {
    x: source.x + NODE_WIDTH / 2 + Math.cos(angle) * 92 - 22,
    y: source.y + NODE_HEIGHT / 2 + Math.sin(angle) * 82 - 22,
  }
}

function adjacencyFor(nodes: WorkflowNode[], edges: ProfileSnapshotEdge[], excludedNodeId?: string) {
  const adjacency = new Map(nodes.filter((node) => node.id !== excludedNodeId).map((node) => [node.id, new Set<string>()]))
  for (const edge of edges) {
    if (edge.from === excludedNodeId || edge.to === excludedNodeId || !adjacency.has(edge.from) || !adjacency.has(edge.to)) continue
    adjacency.get(edge.from)?.add(edge.to)
  }
  return adjacency
}

function reachableFrom(startId: string, adjacency: Map<string, Set<string>>) {
  const reached = new Set<string>()
  const queue = [startId]
  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (reached.has(nodeId) || !adjacency.has(nodeId)) continue
    reached.add(nodeId)
    for (const next of adjacency.get(nodeId) ?? []) if (!reached.has(next)) queue.push(next)
  }
  return reached
}

function dominates(startId: string, requiredId: string, protectedId: string, nodes: WorkflowNode[], edges: ProfileSnapshotEdge[]) {
  return !reachableFrom(startId, adjacencyFor(nodes, edges, requiredId)).has(protectedId)
}

function portLeadsTo(sourceId: string, port: string, targetId: string, nodes: WorkflowNode[], edges: ProfileSnapshotEdge[]) {
  const route = edges.find((edge) => edge.from === sourceId && edge.resultPort === port)?.to
  return route !== undefined && reachableFrom(route, adjacencyFor(nodes, edges, sourceId)).has(targetId)
}

function portCannotBypass(sourceId: string, port: string, protectedId: string, nodes: WorkflowNode[], edges: ProfileSnapshotEdge[]) {
  const route = edges.find((edge) => edge.from === sourceId && edge.resultPort === port)?.to
  return route !== undefined && !reachableFrom(route, adjacencyFor(nodes, edges, sourceId)).has(protectedId)
}

interface RequiredSelector {
  key: string
  handlerKey: string
  stage?: string
}

function profileToolPolicyViolations(profileKey: ProfileKey, nodes: WorkflowNode[], edges: ProfileSnapshotEdge[], toolBindings: ProfileToolBindings, allowedTools: string[]) {
  const violations: string[] = []
  const allowed = new Set(allowedTools)
  const bindings = capabilityBindings(nodes, toolBindings)
  for (const binding of bindings) if (!allowed.has(binding.tool)) violations.push(`${binding.nodeId}.${binding.tool} binding이 Profile allowedTools 상한 밖입니다.`)
  for (const node of nodes) {
    const defaults = defaultToolBindingsByHandler[profileKey][node.handlerKey]
    if (!defaults) continue
    for (const [tool, mode] of Object.entries(defaults)) {
      if (mode !== 'MODEL_OPTIONAL' && toolBindings[node.id]?.[tool] !== mode) {
        violations.push(`${node.id}.${tool} ${mode} binding이 필요합니다.`)
      }
    }
  }
  const selectors: RequiredSelector[] = profileKey === 'LLM_OPS'
    ? [
        { key: 'analyze', handlerKey: 'coding.analyze' }, { key: 'scope', handlerKey: 'coding.approval', stage: 'SCOPE' },
        { key: 'code', handlerKey: 'coding.code' }, { key: 'review', handlerKey: 'coding.review' }, { key: 'preview', handlerKey: 'coding.preview' },
        { key: 'candidate', handlerKey: 'coding.preview_approval', stage: 'CANDIDATE' }, { key: 'prRequest', handlerKey: 'coding.pr_request' },
        { key: 'github', handlerKey: 'coding.approval', stage: 'GITHUB' }, { key: 'prComplete', handlerKey: 'coding.pr_complete' },
        { key: 'deployRequest', handlerKey: 'coding.deploy_request' }, { key: 'deployApproval', handlerKey: 'coding.approval', stage: 'DEPLOY' },
        { key: 'mergeCheck', handlerKey: 'coding.dev_merge_check' }, { key: 'deploy', handlerKey: 'coding.deploy' },
      ]
    : [
        { key: 'analyze', handlerKey: 'cms.analyze' }, { key: 'preview', handlerKey: 'cms.preview' },
        { key: 'approval', handlerKey: 'cms.approval', stage: 'PREVIEW' }, { key: 'apply', handlerKey: 'cms.apply' }, { key: 'discard', handlerKey: 'cms.discard' },
      ]
  const selected = new Map<string, WorkflowNode>()
  for (const selector of selectors) {
    const matches = nodes.filter((node) => node.handlerKey === selector.handlerKey && (selector.stage === undefined || node.config.stage === selector.stage))
    if (matches.length !== 1) violations.push(`${selector.handlerKey}${selector.stage ? ` ${selector.stage}` : ''} 필수 business stage가 ${matches.length === 0 ? '없습니다' : '중복되었습니다'}.`)
    else selected.set(selector.key, matches[0])
  }
  if (profileKey === 'LLM_OPS' && nodes.filter((node) => node.handlerKey === 'coding.approval').length !== 3) violations.push('coding.approval 위험 Handler가 중복되었거나 필수 stage가 없습니다.')
  const start = nodes.find((node) => node.type === 'start')
  const requires = (...keys: string[]) => keys.every((key) => selected.has(key))
  if (start && profileKey === 'LLM_OPS' && requires('analyze', 'scope', 'code', 'review', 'preview', 'candidate', 'prRequest', 'github', 'prComplete', 'deployRequest', 'deployApproval', 'mergeCheck', 'deploy')) {
    const ordered = ['analyze', 'scope', 'code', 'review', 'preview', 'candidate', 'prRequest', 'github', 'prComplete', 'deployRequest', 'deployApproval', 'mergeCheck', 'deploy'].map((key) => selected.get(key)!)
    for (let index = 1; index < ordered.length; index += 1) if (!dominates(start.id, ordered[index - 1].id, ordered[index].id, nodes, edges)) violations.push(`${ordered[index - 1].handlerKey} Approval/Stage를 우회해 ${ordered[index].handlerKey}에 도달할 수 있습니다.`)
    if (!portLeadsTo(selected.get('scope')!.id, 'approved', selected.get('code')!.id, nodes, edges)) violations.push('SCOPE Approval approved 결과가 coding.code로 이어지지 않습니다.')
    if (!portLeadsTo(selected.get('candidate')!.id, 'approved', selected.get('prRequest')!.id, nodes, edges)) violations.push('CANDIDATE Approval approved 결과가 coding.pr_request로 이어지지 않습니다.')
    if (!portCannotBypass(selected.get('candidate')!.id, 'rejected', selected.get('prRequest')!.id, nodes, edges)) violations.push('CANDIDATE Approval rejected 결과가 coding.pr_request를 우회하지 않습니다.')
    if (!portLeadsTo(selected.get('github')!.id, 'approved', selected.get('prComplete')!.id, nodes, edges)) violations.push('GITHUB Approval approved 결과가 coding.pr_complete로 이어지지 않습니다.')
    if (!portLeadsTo(selected.get('deployApproval')!.id, 'approved', selected.get('mergeCheck')!.id, nodes, edges)) violations.push('DEPLOY Approval approved 결과가 coding.dev_merge_check로 이어지지 않습니다.')
  }
  if (start && profileKey === 'NATURAL_CMS' && requires('analyze', 'preview', 'approval', 'apply', 'discard')) {
    const analyze = selected.get('analyze')!
    const preview = selected.get('preview')!
    const approval = selected.get('approval')!
    const apply = selected.get('apply')!
    const discard = selected.get('discard')!
    if (!dominates(start.id, analyze.id, preview.id, nodes, edges) || !dominates(start.id, preview.id, approval.id, nodes, edges)) violations.push('CMS analyze → preview → approval 필수 stage를 우회할 수 있습니다.')
    if (!dominates(start.id, approval.id, apply.id, nodes, edges) || !dominates(start.id, approval.id, discard.id, nodes, edges)) violations.push('CMS Approval을 우회해 apply 또는 discard에 도달할 수 있습니다.')
    if (!portLeadsTo(approval.id, 'approved', apply.id, nodes, edges)) violations.push('CMS Approval approved 결과가 cms.apply로 이어지지 않습니다.')
    if (!portCannotBypass(approval.id, 'approved', discard.id, nodes, edges)) violations.push('CMS Approval approved 결과가 cms.discard를 우회하지 않습니다.')
    if (!portLeadsTo(approval.id, 'rejected', discard.id, nodes, edges)) violations.push('CMS Approval rejected 결과가 cms.discard로 이어지지 않습니다.')
    if (!portCannotBypass(approval.id, 'rejected', apply.id, nodes, edges)) violations.push('CMS Approval rejected 결과가 cms.apply를 우회하지 않습니다.')
  }
  return Array.from(new Set(violations))
}

function canvasDimensions(nodes: WorkflowNode[], edges: ProfileSnapshotEdge[], capabilityCount: number): CanvasDimensions {
  const farthestRight = Math.max(0, ...nodes.map((node) => node.x + NODE_WIDTH))
  const farthestBottom = Math.max(0, ...nodes.map((node) => node.y + NODE_HEIGHT))
  const detourCount = edges.filter((edge) => isDetourEdge(edge, nodes)).length
  const toolRoom = capabilityCount > 0 ? 190 : CANVAS_PADDING
  const nodeAreaHeight = Math.max(MIN_NODE_AREA_HEIGHT, farthestBottom + toolRoom)
  const capabilityLaneTop = nodeAreaHeight
  return {
    width: Math.max(MIN_CANVAS_WIDTH, farthestRight + CANVAS_PADDING),
    height: nodeAreaHeight + CANVAS_PADDING + Math.max(1, detourCount) * DETOUR_LANE_GAP,
    nodeAreaHeight,
    capabilityLaneTop,
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
      analyze: defaultModelBinding(),
      code: defaultModelBinding(),
      review: defaultModelBinding(),
    },
    toolBindings: {
      code: { ...defaultToolBindingsByHandler.LLM_OPS['coding.code'] },
      review: { ...defaultToolBindingsByHandler.LLM_OPS['coding.review'] },
      preview: { ...defaultToolBindingsByHandler.LLM_OPS['coding.preview'] },
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
      analyze: defaultModelBinding(),
      preview: defaultModelBinding(),
    },
    toolBindings: {
      preview: { ...defaultToolBindingsByHandler.NATURAL_CMS['cms.preview'] },
      discard: { ...defaultToolBindingsByHandler.NATURAL_CMS['cms.discard'] },
      apply: { ...defaultToolBindingsByHandler.NATURAL_CMS['cms.apply'] },
    },
    toolPolicy: { allowedTools: [...toolCatalog.NATURAL_CMS] },
    guardrailProfileKey: 'central.default',
  },
}

export default function WorkflowPanel({ api }: { api: ProfileVersionApiClient & ProfileEditorLayoutApiClient & ProfileDefaultTemplateApiClient & ModelCatalogApiClient }) {
  const [profileKey, setProfileKey] = useState<ProfileKey>('LLM_OPS')
  const [versions, setVersions] = useState<ProfileVersion[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [nodes, setNodes] = useState<WorkflowNode[]>([])
  const [edges, setEdges] = useState<ProfileSnapshotEdge[]>([])
  const [config, setConfig] = useState<ProfileSnapshotConfig>(starterSnapshots.LLM_OPS.config)
  const [modelBindings, setModelBindings] = useState<Record<string, ProfileModelBinding>>({})
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog | null>(null)
  const [toolBindings, setToolBindings] = useState<ProfileToolBindings>({})
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
  const [confirmationAction, setConfirmationAction] = useState<'load' | 'save' | 'restore' | 'draft' | null>(null)
  const [handlerPaletteOpen, setHandlerPaletteOpen] = useState(false)
  const [edgeListOpen, setEdgeListOpen] = useState(true)
  const [canvasZoom, setCanvasZoom] = useState(1)
  const [toolLayout, setToolLayout] = useState<ToolLayout>(() => {
    try { return window.localStorage.getItem(TOOL_LAYOUT_KEY) === 'dock' ? 'dock' : 'orbit' }
    catch { return 'orbit' }
  })
  const versionRequest = useRef(0)
  const catalogRequest = useRef(0)
  const canvasViewport = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; pointerX: number; pointerY: number; x: number; y: number; moved: boolean } | null>(null)
  const pan = useRef<{ pointerId: number; pointerX: number; pointerY: number; scrollLeft: number; scrollTop: number } | null>(null)
  const ignoreClick = useRef<string | null>(null)
  const [panning, setPanning] = useState(false)

  const selected = nodes.find((node) => node.id === selectedId) ?? null
  const selectedDefinition = selected ? definitionFor(profileKey, selected.handlerKey) : null
  const selectedLocked = selectedDefinition?.locked === true
  const selectedVersion = versions.find((version) => version.profileVersionId === selectedVersionId) ?? null
  const capabilityLaneBindings = capabilityBindings(nodes, toolBindings)
  const saveViolations = profileToolPolicyViolations(profileKey, nodes, edges, toolBindings, allowedTools)
  const canvas = canvasDimensions(nodes, edges, capabilityLaneBindings.length)
  const catalogModels = modelCatalog?.models ?? []
  const normalizedModelBindings = normalizeModelBindings(nodes, modelBindings, catalogModels)
  const supported = nodes.every((node) => matchesDefinition(profileKey, node))
    && allowedTools.every((tool) => toolCatalog[profileKey].includes(tool))
    && capabilityLaneBindings.every((binding) => toolCatalog[profileKey].includes(binding.tool))
    && normalizedModelBindings !== null

  useEffect(() => {
    void loadVersions(profileKey)
    void loadModelCatalog(profileKey)
    return () => { versionRequest.current += 1; catalogRequest.current += 1 }
  }, [api, profileKey])

  async function loadModelCatalog(key: ProfileKey) {
    const request = ++catalogRequest.current
    try {
      const catalog = await api.listModelCatalog(key)
      if (request === catalogRequest.current && catalog.profileKey === key) setModelCatalog(catalog)
    } catch (error) {
      if (request !== catalogRequest.current) return
      setModelCatalog(null)
      setFailure(describeFailure(error))
    }
  }

  function targetFor(binding: ProfileModelBinding, selectionId: string) {
    return catalogModels.find((model) => model.selectionId === selectionId) ?? binding.selections?.[selectionId]
  }

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
    try { window.localStorage.setItem(TOOL_LAYOUT_KEY, toolLayout) } catch { /* storage may be disabled */ }
  }, [toolLayout])

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
      cloneBinding(binding),
    ])))
    setToolBindings(hydrateToolBindings(profileKey, snapshot.nodes, snapshot.toolBindings))
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
    const agentBindings = normalizeModelBindings(nodes, modelBindings, catalogModels)
    if (agentBindings === null) throw new Error('Agent model selection metadata is incomplete.')
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
      toolBindings: cloneToolBindings(toolBindings),
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
    if (definition.type === 'agent' && catalogModels.length === 0) {
      setStatus('Agent Node를 추가하려면 검증 Credential의 Model Catalog가 필요합니다.')
      return
    }
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
      const initialModel = catalogModels.find((model) => model.selectionId === defaultModel.selectionId)
        ?? catalogModels[0]
      setModelBindings((current) => ({
        ...current,
        [node.id]: withSelection({ primary: initialModel.selectionId, fallback: [] }, initialModel),
      }))
    }
    const defaults = defaultToolBindingsByHandler[profileKey][node.handlerKey]
    if (defaults) setToolBindings({ ...toolBindings, [node.id]: { ...defaults } })
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

  function updatePrimaryBinding(model: ModelCatalogModel) {
    if (!selected || selected.type !== 'agent') return
    setModelBindings((current) => {
      const binding = current[selected.id] ?? { primary: model.selectionId, fallback: [] }
      if (binding.fallback.some((item) => sameTarget(targetFor(binding, item), model))) {
        setStatus('주 모델과 같은 Provider·Model은 Fallback으로 둘 수 없습니다.')
        return current
      }
      return {
        ...current,
        [selected.id]: withSelection({ ...binding, primary: model.selectionId, fallback: binding.fallback.filter((item) => item !== model.selectionId) }, model),
      }
    })
  }

  function toggleFallback(model: ModelCatalogModel) {
    if (!selected || selected.type !== 'agent') return
    setModelBindings((current) => {
      const binding = current[selected.id]
      if (!binding || binding.primary === model.selectionId) return current
      const enabled = binding.fallback.includes(model.selectionId)
      if (!enabled && (sameTarget(targetFor(binding, binding.primary), model)
        || binding.fallback.some((item) => sameTarget(targetFor(binding, item), model)))) {
        setStatus('동일한 Provider·Model은 Primary 또는 Fallback에 중복할 수 없습니다.')
        return current
      }
      return {
        ...current,
        [selected.id]: {
          ...binding,
          fallback: enabled
            ? binding.fallback.filter((item) => item !== model.selectionId)
            : [...binding.fallback, model.selectionId],
          ...(enabled ? {} : { selections: withSelection(binding, model).selections }),
        },
      }
    })
  }

  function updateInference(selectionId: string, model: ModelCatalogModel, patch: Partial<ProfileModelSelection['inference']>) {
    if (!selected || selected.type !== 'agent') return
    setModelBindings((current) => {
      const binding = current[selected.id]
      if (!binding) return current
      const currentSelection = binding.selections?.[selectionId]
      const selection: ProfileModelSelection = {
        ...(currentSelection ?? {}), provider: model.provider, model: model.model,
        inference: { ...inferenceFor(model, currentSelection?.inference), ...patch },
      }
      return { ...current, [selected.id]: { ...binding, selections: { ...binding.selections, [selectionId]: selection } } }
    })
  }

  function toggleOptionalToolBinding(tool: string) {
    if (!selected) return
    const mode = defaultToolBindingsByHandler[profileKey][selected.handlerKey]?.[tool]
    if (mode !== 'MODEL_OPTIONAL') return
    if (toolBindings[selected.id]?.[tool] !== 'MODEL_OPTIONAL' && !allowedTools.includes(tool)) {
      setStatus(`${tool}은(는) Profile allowedTools 상한에 없어 연결할 수 없습니다.`)
      return
    }
    const next = cloneToolBindings(toolBindings)
    const selectedBindings = { ...(next[selected.id] ?? {}) }
    if (selectedBindings[tool] === 'MODEL_OPTIONAL') delete selectedBindings[tool]
    else selectedBindings[tool] = 'MODEL_OPTIONAL'
    if (Object.keys(selectedBindings).length === 0) delete next[selected.id]
    else next[selected.id] = selectedBindings
    setToolBindings(next)
  }

  function deleteSelected() {
    if (!selected || selectedDefinition?.locked) return
    const remaining = nodes.filter((node) => node.id !== selected.id)
    setNodes(remaining)
    setEdges((current) => current.filter((edge) => edge.from !== selected.id && edge.to !== selected.id))
    setModelBindings((current) => Object.fromEntries(Object.entries(current).filter(([nodeId]) => nodeId !== selected.id)))
    setToolBindings(Object.fromEntries(Object.entries(toolBindings).filter(([nodeId]) => nodeId !== selected.id)))
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
  const selectedToolDefaults = selected ? defaultToolBindingsByHandler[profileKey][selected.handlerKey] ?? {} : {}

  return <>
    <WorkflowStatusToast message={notice ?? status} />
    {confirmationAction && <WorkflowConfirmationDialog
      action={confirmationAction}
      profileKey={profileKey}
      restoreDescription={selectedVersion
        ? `선택한 v${selectedVersion.profileVersion} 저장본을 다시 불러옵니다. 저장된 버전 자체는 변경되지 않습니다.`
        : versions.length > 0
          ? '기본 템플릿 편집을 종료하고 최신 저장 버전을 불러옵니다. 저장된 버전 자체는 변경되지 않습니다.'
          : '저장된 버전이 없어 기본 템플릿을 다시 불러옵니다. 기본 템플릿 자체는 변경되지 않습니다.'}
      violations={confirmationAction === 'save' || confirmationAction === 'draft' ? saveViolations : []}
      onCancel={() => setConfirmationAction(null)}
      onConfirm={() => {
        if (saveViolations.length > 0 && (confirmationAction === 'save' || confirmationAction === 'draft')) return
        setConfirmationAction(null)
        if (confirmationAction === 'load') void loadDefaultTemplate()
        else if (confirmationAction === 'save') void saveDefaultTemplate()
        else if (confirmationAction === 'draft') void saveDraft()
        else void loadVersions(profileKey, selectedVersionId ?? undefined)
      }}
    />}
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
      {failure && <NoticePanel className="mt-3" tone="danger" icon="triangle-alert" title="Workflow를 불러오지 못했습니다" role="alert">{failure}</NoticePanel>}
      {!supported && nodes.length > 0 && <NoticePanel className="mt-3" tone="danger" icon="triangle-alert" title="편집할 수 없는 구성이 포함되어 있습니다" role="alert">현재 UI 허용 목록에 없는 Handler·Model Binding·Tool이 포함되어 편집과 저장을 중단했습니다.</NoticePanel>}
      <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-line-soft pt-3" role="group" aria-label="Workflow 작업">
        <div className="flex flex-col gap-1.5" role="group" aria-label="템플릿 배치">
          <span className="text-[0.6875rem] font-medium text-muted">템플릿 배치</span>
          <button type="button" className={`${secondaryButton} whitespace-nowrap`} style={{ backgroundColor: '#e8f4fa', color: '#245b78', borderColor: '#9fc7dc' }} disabled={loading || saving || nodes.length === 0} onClick={autoArrange}>자동 배치</button>
        </div>
        <div className="flex flex-col gap-1.5" role="group" aria-label="기본 템플릿 작업">
          <span className="text-[0.6875rem] font-medium text-muted">기본 템플릿</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${secondaryButton} whitespace-nowrap`} style={{ backgroundColor: '#f4effb', color: '#684b86', borderColor: '#cdb9df' }} disabled={loading || saving} onClick={() => { setStatus(''); setNotice(null); setConfirmationAction('load') }}>기본 템플릿 불러오기</button>
            <button type="button" className={`${secondaryButton} whitespace-nowrap`} style={{ backgroundColor: '#f4effb', color: '#684b86', borderColor: '#cdb9df' }} disabled={loading || saving || !supported || nodes.length === 0} onClick={() => { setStatus(''); setNotice(null); setConfirmationAction('save') }}>기본 템플릿 저장</button>
          </div>
        </div>
        <div className="flex flex-col gap-1.5" role="group" aria-label="버전 저장 및 활성화">
          <span className="text-[0.6875rem] font-medium text-muted">저장·활성화</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${primaryButton} whitespace-nowrap`} style={{ color: '#fff' }} disabled={loading || saving || !supported || nodes.length === 0} onClick={() => { setStatus(''); setNotice(null); setConfirmationAction('draft') }}>새 DRAFT 저장</button>
            <button type="button" className={`${secondaryButton} whitespace-nowrap`} style={{ backgroundColor: '#e9f6ee', color: '#246b45', borderColor: '#a7d5b9' }} disabled={saving || selectedVersion?.status !== 'DRAFT'} onClick={() => void activateSelected()}>선택 DRAFT 활성화</button>
          </div>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1.5" role="group" aria-label="편집 취소">
          <span className="text-[0.6875rem] font-medium text-muted">편집 취소</span>
          <button type="button" className={`${secondaryButton} whitespace-nowrap`} style={{ backgroundColor: '#f0f2f5', color: '#435264', borderColor: '#c6cdd6' }} disabled={loading || saving} onClick={() => { setStatus(''); setNotice(null); setConfirmationAction('restore') }}>
            <span aria-hidden="true" className="text-base leading-none">↺</span>저장본으로 되돌리기
          </button>
        </div>
      </div>
    </section>

    <div className={`${panel} mt-3 grid h-[48rem] overflow-hidden xl:grid-cols-[20rem_minmax(0,1fr)]`}>
      <div className="order-2 flex min-h-0 min-w-0 flex-col bg-[#f8fafc] xl:order-2">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-field px-4 py-3">
          <b className="text-[0.8125rem] font-semibold">{profileKey} Snapshot</b>
          <Tag>등록 Handler</Tag><Tag>Version API</Tag>
          <div className="ml-auto flex items-center gap-2" role="group" aria-label="MCP Tool 표시 방식">
            <span className="text-[0.625rem] text-muted-2">MCP Tool</span>
            {(['orbit', 'dock'] as ToolLayout[]).map((layout) => <button
              key={layout}
              type="button"
              className={`rounded px-2 py-1 text-[0.625rem] font-semibold ${toolLayout === layout ? 'bg-primary text-white' : 'border border-btn-line bg-field text-muted'}`}
              aria-pressed={toolLayout === layout}
              onClick={() => setToolLayout(layout)}
            >{layout === 'orbit' ? '연결형' : '도킹형'}</button>)}
          </div>
          <span className="text-[0.6875rem] text-muted-2">Node {nodes.length} · Edge {edges.length}</span>
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
              {toolLayout === 'orbit' && capabilityLaneBindings.map((binding) => {
                const source = nodes.find((node) => node.id === binding.nodeId)
                if (!source) return null
                const ownerBindings = capabilityLaneBindings.filter((item) => item.nodeId === binding.nodeId)
                const toolIndex = ownerBindings.findIndex((item) => item.tool === binding.tool)
                const toolPosition = orbitalToolPosition(source, toolIndex, ownerBindings.length)
                const x1 = source.x + NODE_WIDTH / 2
                const y1 = source.y + NODE_HEIGHT
                const x2 = toolPosition.x + 22
                const y2 = toolPosition.y + 22
                const active = selectedId === source.id
                return <path
                  key={`${binding.nodeId}:${binding.tool}:${binding.mode}`}
                  d={`M ${x1} ${y1} C ${x1} ${y1 + 28}, ${x2} ${y2 - 28}, ${x2} ${y2}`}
                  data-capability-edge="true"
                  data-capability-from={source.id}
                  data-capability-tool={binding.tool}
                  data-capability-requirement={binding.mode}
                  data-capability-layout="orbit"
                  fill="none"
                  stroke={active ? '#65c6ca' : '#7b8794'}
                  strokeWidth={active ? 2 : 1.25}
                  strokeDasharray="4 5"
                  strokeLinecap="round"
                  opacity={active ? 1 : 0.7}
                />
              })}
            </svg>

            {nodes.map((node) => {
              const info = nodeTypes[node.type]
              const definition = definitionFor(profileKey, node.handlerKey)
              const locked = definition?.locked === true
              const role = nodeRole(node)
              const active = selectedId === node.id
              const source = connectFrom?.nodeId === node.id
              return <article
                key={node.id}
                aria-label={`${node.id} Node`}
                aria-current={active ? 'true' : undefined}
                data-business-node="true"
                data-node-selected={active ? 'true' : 'false'}
                data-locked={locked ? 'true' : 'false'}
                data-node-x={node.x}
                data-node-y={node.y}
                className={`workflow-node-card absolute z-10 rounded-lg border bg-field p-[0.625rem] shadow-[0_8px_22px_#070a0e59] transition-[border-color,box-shadow,transform] duration-150 ${active ? 'z-20 scale-[1.035] border-2 border-[#2f8de4] shadow-[0_0_0_4px_rgba(96,165,250,.28),0_16px_34px_rgba(7,10,14,.52)]' : source ? 'border-wait-dot ring-2 ring-wait-bg' : 'border-[#cbd3dc]'}`}
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
                {locked && <span className="absolute right-2 top-2 z-10 grid h-5 w-5 place-items-center rounded-full bg-[#eeeae4] text-[#6f655b]" aria-label="수정·삭제 잠금"><Icon name="lock" size={11} /></span>}
                <span data-node-port="left" className={`absolute -left-[0.3125rem] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 bg-white shadow-[0_0_0_2px_#20262e] ${source ? 'border-[#f0a34a]' : active ? 'border-[#60a5fa]' : 'border-[#778392]'}`} aria-hidden="true" />
                <span data-node-port="right" className={`absolute -right-[0.3125rem] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 bg-white shadow-[0_0_0_2px_#20262e] ${source ? 'border-[#f0a34a]' : active ? 'border-[#60a5fa]' : 'border-[#778392]'}`} aria-hidden="true" />
                <button
                  type="button"
                  aria-label={`${nodeDisplayName(profileKey, node)} Node 이동`}
                  className="flex w-full cursor-grab touch-none items-center gap-2 bg-transparent p-0 text-left active:cursor-grabbing"
                  onPointerDown={(event) => startDrag(event, node)}
                  onPointerMove={moveDrag}
                  onPointerUp={(event) => endDrag(event, node)}
                  onPointerCancel={(event) => endDrag(event, node)}
                >
                  <span className={`grid h-[2.125rem] w-[2.125rem] shrink-0 place-items-center rounded-[0.625rem] ${info.skin}`}><Icon name={info.icon} size={18} /></span>
                  <span className="min-w-0 flex-1 pr-4"><span className="block truncate text-[0.75rem] font-semibold">{nodeDisplayName(profileKey, node)}</span><span className="mt-0.5 block truncate text-[0.5625rem] font-normal text-muted-2">{info.meta}</span></span>
                </button>
                <span className="workflow-role-badge mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.5625rem] font-semibold" data-role={role}><Icon name={role === 'handler' ? 'code-2' : 'network'} size={10} />{role === 'handler' ? 'Handler' : 'Runner'}</span>
              </article>
            })}
            {toolLayout === 'orbit' && capabilityLaneBindings.map((binding) => {
              const source = nodes.find((node) => node.id === binding.nodeId)
              if (!source) return null
              const ownerBindings = capabilityLaneBindings.filter((item) => item.nodeId === binding.nodeId)
              const index = ownerBindings.findIndex((item) => item.tool === binding.tool)
              const position = orbitalToolPosition(source, index, ownerBindings.length)
              return <article
                key={`${binding.nodeId}:${binding.tool}`}
                aria-label={`${nodeDisplayName(profileKey, source)} MCP Tool ${toolDetails[binding.tool]?.label ?? binding.tool}`}
                title={`${binding.tool} · ${binding.mode}`}
                data-capability-tool-node={binding.tool}
                data-capability-owner={binding.nodeId}
                data-capability-layout="orbit"
                data-capability-requirement={binding.mode}
                data-capability-locked={binding.mode !== 'MODEL_OPTIONAL' ? 'true' : 'false'}
                className="workflow-tool-satellite absolute z-10 grid h-11 w-11 place-items-center rounded-full border shadow-[0_6px_16px_#070a0e4d]"
                style={{ left: position.x, top: position.y }}
              ><Icon name="plug" size={17} /><span className="absolute top-12 w-20 text-center text-[0.5rem] leading-tight text-[#c8d7e0]">{toolDetails[binding.tool]?.label ?? binding.tool}</span></article>
            })}
            {toolLayout === 'dock' && nodes.map((node) => {
              const bindings = capabilityLaneBindings.filter((binding) => binding.nodeId === node.id)
              if (bindings.length === 0) return null
              return <section
                key={`dock:${node.id}`}
                className="workflow-tool-dock absolute z-10 rounded-md border p-1.5 shadow-[0_5px_14px_#070a0e35]"
                style={{ left: node.x, top: node.y + NODE_HEIGHT + 8, width: NODE_WIDTH }}
                aria-label={`${nodeDisplayName(profileKey, node)} MCP Tool 도크`}
                data-capability-dock-owner={node.id}
              >
                <div className="flex flex-wrap gap-1">{bindings.map((binding) => <span
                  key={binding.tool}
                  title={`${binding.tool} · ${binding.mode}`}
                  data-capability-tool-node={binding.tool}
                  data-capability-owner={binding.nodeId}
                  data-capability-layout="dock"
                  data-capability-requirement={binding.mode}
                  className="inline-flex min-w-0 items-center gap-1 rounded bg-field/80 px-1.5 py-1 text-[0.5rem] font-semibold"
                ><Icon name="plug" size={9} /><span className="truncate">{toolDetails[binding.tool]?.label ?? binding.tool}</span></span>)}</div>
              </section>
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
          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3 rounded-lg border border-line-soft bg-sub p-3">
            <span className={`grid h-11 w-11 place-items-center rounded-xl ${nodeTypes[selected.type].skin}`}><Icon name={nodeTypes[selected.type].icon} size={21} /></span>
            <span className="min-w-0"><strong className="block truncate text-[0.8125rem]">{nodeDisplayName(profileKey, selected)}</strong><small className="mt-0.5 block text-[0.625rem] text-muted-2">{nodeRole(selected) === 'handler' ? 'Handler · 모델 실행 Node' : 'Runner · 워크플로 실행 Node'}</small></span>
          </div>
          {selectedLocked && <NoticePanel className="mt-3" tone="warning" icon="lock" title="보호된 시스템 Node입니다">이 Node는 수정하거나 삭제할 수 없습니다.</NoticePanel>}
          <label className="block text-[0.71875rem] font-semibold text-body">Node ID
            <input aria-label="선택 Node ID" className={`${control} cursor-not-allowed bg-sub text-body`} value={selected.id} readOnly />
          </label>
          <label className="mt-3 block text-[0.71875rem] font-semibold text-body">등록 Handler
            <input aria-label="선택 Handler" className={`${control} cursor-not-allowed bg-sub text-body`} value={selected.handlerKey} readOnly />
          </label>

          {selected.type === 'agent' && selectedBinding && <div className="mt-3 border-t border-row-line pt-3">
            <label className="block text-[0.71875rem] font-semibold text-body">주 모델 (Primary Model)
              <select aria-label="선택 주 모델" className={control} value={selectedBinding.primary} disabled={saving || catalogModels.length === 0} onChange={(event) => {
                const model = catalogModels.find((item) => item.selectionId === event.target.value)
                if (model) updatePrimaryBinding(model)
              }}>
                {!catalogModels.some((model) => model.selectionId === selectedBinding.primary) && <option value={selectedBinding.primary}>{modelBindingLabel(selectedBinding.primary, catalogModels, selectedBinding.selections)}</option>}
                {catalogModels.map((model) => <option key={model.selectionId} value={model.selectionId} disabled={selectedBinding.fallback.some((fallback) => sameTarget(targetFor(selectedBinding, fallback), model))}>{modelBindingLabel(model.selectionId, catalogModels, selectedBinding.selections)}</option>)}
              </select>
              <small className="mt-1 block text-[0.625rem] font-normal leading-4 text-muted-2">등록·검증된 Credential Provider의 Model만 선택할 수 있습니다. 기존 binding은 실제 Provider·Model을 확인할 수 있을 때 표시하며 새 저장값은 catalog selectionId로 정규화합니다.</small>
            </label>
            {catalogModels.find((model) => model.selectionId === selectedBinding.primary) && <InferenceSettingsControls
              selectionId={selectedBinding.primary}
              model={catalogModels.find((model) => model.selectionId === selectedBinding.primary)!}
              selection={selectedBinding.selections?.[selectedBinding.primary]}
              onChange={(patch) => updateInference(selectedBinding.primary, catalogModels.find((model) => model.selectionId === selectedBinding.primary)!, patch)}
            />}
            <fieldset className="mt-3">
              <legend className="text-[0.71875rem] font-semibold text-body">대체 모델 (Fallback Model)</legend>
              <p className="mt-1 text-[0.625rem] leading-4 text-muted-2">주 모델의 미설정·사용량 제한·시간 초과·Provider 장애 등 일시적 오류에 사용할 후보입니다.</p>
              <div className="mt-2 space-y-2">
                {selectedBinding.fallback.filter((binding) => !catalogModels.some((model) => model.selectionId === binding)).map((binding) => <p key={binding} className="text-[0.65625rem] text-muted-2">{modelBindingLabel(binding, catalogModels, selectedBinding.selections)}</p>)}
                {catalogModels.filter((model) => model.selectionId !== selectedBinding.primary).map((model) => {
                  const checked = selectedBinding.fallback.includes(model.selectionId)
                  const duplicate = !checked && (sameTarget(targetFor(selectedBinding, selectedBinding.primary), model)
                    || selectedBinding.fallback.some((binding) => sameTarget(targetFor(selectedBinding, binding), model)))
                  return <div key={model.selectionId}>
                    <label className="flex items-start gap-2 text-[0.65625rem] text-body">
                      <input type="checkbox" aria-label={`Fallback ${model.selectionId}`} checked={checked} disabled={saving || duplicate} onChange={() => toggleFallback(model)} />
                      <span className="break-all">{modelBindingLabel(model.selectionId, catalogModels, selectedBinding.selections)}</span>
                    </label>
                    {checked && <InferenceSettingsControls selectionId={model.selectionId} model={model} selection={selectedBinding.selections?.[model.selectionId]} onChange={(patch) => updateInference(model.selectionId, model, patch)} />}
                  </div>
                })}
                {catalogModels.length === 0 && <p className="text-[0.65625rem] text-muted-2">선택 가능한 검증 Credential Model이 없습니다.</p>}
              </div>
            </fieldset>
          </div>}

          {Object.keys(selectedToolDefaults).length > 0 && <section className="mt-3 border-t border-row-line pt-3" aria-label="선택 Node MCP Tool binding">
            <b className="text-[0.71875rem] font-semibold text-body">MCP Tool binding</b>
            <p className="mt-1 text-[0.625rem] leading-4 text-muted-2">연결은 Snapshot Edge가 아닙니다. MODEL_OPTIONAL만 이 Node에서 연결하거나 해제할 수 있습니다.</p>
            <div className="mt-2 space-y-2">
              {Object.entries(selectedToolDefaults).map(([tool, mode]) => {
                const bound = toolBindings[selected.id]?.[tool] === mode
                const locked = mode !== 'MODEL_OPTIONAL'
                return <label key={tool} className="flex items-start gap-2 text-[0.65625rem] text-body">
                  <input type="checkbox" aria-label={`Tool binding ${tool}`} checked={bound} disabled={locked || loading || saving || !supported} onChange={() => toggleOptionalToolBinding(tool)} />
                  <span className="min-w-0"><span className="block font-semibold">{toolDetails[tool]?.label ?? tool} <code className="font-normal">({tool})</code> <span className="rounded bg-sub px-1 py-0.5 text-[0.5625rem] text-muted-2">{mode}{locked ? ' · locked' : ''}</span></span></span>
                </label>
              })}
            </div>
          </section>}

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
          {selected.type === 'guardrail' && <div className="mt-3 text-[0.6875rem] leading-5 text-muted-2"><Badge tone="idle" dot={false}>Snapshot 잠금 계약</Badge></div>}

          {selected.resultPorts.length > 0 && <div className="mt-4 border-t border-row-line pt-3">
            <label className="block text-[0.71875rem] font-semibold text-body">연결 Result Port
              <select aria-label="연결 Result Port" className={control} value={connectPort} onChange={(event) => setConnectPort(event.target.value)}>
                {selected.resultPorts.map((port) => <option key={port} value={port}>{resultPortLabel(port)}</option>)}
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
                const sourceNode = nodes.find((node) => node.id === edge.from)
                const targetNode = nodes.find((node) => node.id === edge.to)
                const direction = selected.id === edge.to ? '입력' : '출력'
                return <div key={`${edge.from}-${edge.resultPort}-${edge.to}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-line-soft bg-sub px-2 py-2 text-[0.6875rem]">
                  <span className={`rounded-full px-1.5 py-0.5 text-[0.5625rem] font-semibold ${direction === '입력' ? 'bg-run-bg text-run-fg' : 'bg-ok-bg text-ok-fg'}`}>{direction}</span>
                  <span className="min-w-0 leading-4"><strong className="block truncate font-semibold">{sourceNode ? nodeDisplayName(profileKey, sourceNode) : edge.from} · {resultPortLabel(edge.resultPort)}</strong><span className="block truncate text-muted-2">→ {targetNode ? nodeDisplayName(profileKey, targetNode) : edge.to}</span></span>
                  <button type="button" className="font-semibold text-fail-fg" aria-label={`${edge.from}.${edge.resultPort}에서 ${edge.to} 연결 해제`} onClick={() => disconnect(edge)}>해제</button>
                </div>
              })}
              </div>
            </div>
          </section>
        </div>}

        <section className="mt-5 border-t border-row-line pt-4" aria-label="노드 추가">
          <button
            type="button"
            className="flex w-full items-start justify-between gap-3 rounded text-left"
            aria-expanded={handlerPaletteOpen}
            aria-controls="handler-palette-panel"
            onClick={() => setHandlerPaletteOpen((current) => !current)}
          >
            <span><b className="block text-[0.84375rem] font-semibold">노드 추가</b><small className="mt-1 block text-[0.6875rem] text-muted-2">사용할 노드 유형을 선택해 워크플로에 추가합니다.</small></span>
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

      </aside>
    </div>
    </section>
  </>
}

function WorkflowConfirmationDialog({ action, profileKey, restoreDescription, violations, onCancel, onConfirm }: {
  action: 'load' | 'save' | 'restore' | 'draft'
  profileKey: ProfileKey
  restoreDescription: string
  violations: string[]
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const content = {
    load: {
      title: '기본 템플릿 불러오기', icon: '↓', confirm: '불러오기',
      message: '기본 템플릿을 편집 화면에 불러올까요?',
      description: '저장하지 않은 편집 내용은 기본 템플릿으로 교체됩니다. 기존 저장 버전은 변경되지 않습니다.',
    },
    save: {
      title: '기본 템플릿 저장', icon: '✓', confirm: '저장하기',
      message: '현재 편집한 구성을 기본 템플릿으로 저장할까요?',
      description: '이 Profile의 기본 템플릿이 교체됩니다. 기존 DRAFT와 ACTIVE 버전은 변경되지 않습니다.',
    },
    draft: {
      title: '새 DRAFT 저장', icon: '✓', confirm: '저장하기',
      message: '현재 편집한 구성을 새 불변 DRAFT로 저장할까요?',
      description: 'Backend Validator가 최종 계약을 검사합니다. 아래 위반이 있으면 저장할 수 없습니다.',
    },
    restore: {
      title: '저장본으로 되돌리기', icon: '↺', confirm: '되돌리기',
      message: '저장하지 않은 변경사항을 버리고 저장본으로 되돌릴까요?',
      description: restoreDescription,
    },
  }[action]

  useEffect(() => {
    const dialog = dialogRef.current
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog?.showModal()
    cancelRef.current?.focus()
    return () => {
      dialog?.close()
      trigger?.focus()
    }
  }, [])

  return <dialog
    ref={dialogRef}
    aria-labelledby="template-confirmation-title"
    aria-describedby="template-confirmation-description"
    onCancel={(event) => { event.preventDefault(); onCancel() }}
    className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-[30rem] rounded-xl border border-white/10 bg-[#16293c] p-0 text-white shadow-[0_24px_70px_rgba(22,41,60,.35)] backdrop:bg-[#16293c]/50 backdrop:backdrop-blur-sm"
  >
    <div className="p-6 sm:p-7">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-xl font-semibold text-[#16293c]">{content.icon}</span>
        <div>
          <p className="mb-1 text-xs font-medium text-white/60">{profileKey}</p>
          <h2 id="template-confirmation-title" className="text-base font-semibold text-white">{content.title}</h2>
        </div>
      </div>
      <div id="template-confirmation-description" className="mt-5 text-sm leading-6 text-white/90">
        <p>{content.message}</p>
        <p className="mt-3 rounded-lg bg-white/5 px-4 py-3 text-xs leading-5 text-white/70">
          {content.description}
        </p>
        {violations.length > 0 && <div className="mt-3 rounded-lg border border-amber-200/30 bg-amber-100/10 px-4 py-3 text-xs leading-5 text-amber-50" aria-label="저장 전 정책 위반 목록">
          <b className="block">저장 전 정책 위반</b>
          <ul className="mt-1 list-disc pl-4">{violations.map((violation) => <li key={violation}>{violation}</li>)}</ul>
        </div>}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button ref={cancelRef} type="button" className={`${secondaryButton} hover:brightness-125`} style={{ backgroundColor: '#223a50', border: '1px solid #64748b', color: '#fff', outlineColor: '#65c6ca' }} onClick={onCancel}>취소</button>
        <button type="button" className={`${primaryButton} hover:brightness-110`} style={{ backgroundColor: '#65c6ca', color: '#16293c', outlineColor: '#65c6ca' }} disabled={violations.length > 0} onClick={onConfirm}>{content.confirm}</button>
      </div>
    </div>
  </dialog>
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

function cloneBinding(binding: ProfileModelBinding): ProfileModelBinding {
  return {
    ...binding,
    fallback: [...binding.fallback],
    ...(binding.selections === undefined ? {} : {
      selections: Object.fromEntries(Object.entries(binding.selections).map(([selectionId, selection]) => [selectionId, {
        ...selection,
        inference: { ...selection.inference },
      }])),
    }),
  }
}

function selectionIdFor(selection: Pick<ProfileModelSelection, 'provider' | 'model'>) {
  return `${selection.provider.toLowerCase().replaceAll('_', '-')}-${selection.model.replaceAll('.', '-')}`
}

function normalizeModelBindings(
  nodes: ProfileSnapshotNode[],
  bindings: Record<string, ProfileModelBinding>,
  catalog: ModelCatalogModel[],
): Record<string, ProfileModelBinding> | null {
  const normalized: Record<string, ProfileModelBinding> = {}
  for (const node of nodes.filter((candidate) => candidate.type === 'agent')) {
    const binding = bindings[node.id] ?? defaultModelBinding()
    if (typeof binding.primary !== 'string' || !Array.isArray(binding.fallback)) return null
    const used = [binding.primary, ...binding.fallback]
    const ids: string[] = []
    const selections: Record<string, ProfileModelSelection> = {}
    const targets = new Set<string>()
    for (const bindingKey of used) {
      if (typeof bindingKey !== 'string') return null
      const catalogModel = catalog.find((model) => model.selectionId === bindingKey)
        ?? catalog.find((model) => sameTarget(model, binding.selections?.[bindingKey] ?? legacyModelSelections[bindingKey]))
      const current = binding.selections?.[bindingKey] ?? legacyModelSelections[bindingKey]
      const selection = catalogModel === undefined
        ? current
        : { provider: catalogModel.provider, model: catalogModel.model, inference: inferenceFor(catalogModel, current?.inference) }
      if (selection === undefined || typeof selection.inference?.reasoningIntensity !== 'string') return null
      const normalizedId = catalogModel?.selectionId ?? selectionIdFor(selection)
      const target = `${selection.provider}:${selection.model}`
      if (ids.includes(normalizedId) || targets.has(target)) return null
      ids.push(normalizedId)
      targets.add(target)
      selections[normalizedId] = {
        provider: selection.provider,
        model: selection.model,
        inference: {
          reasoningIntensity: selection.inference.reasoningIntensity,
          ...(selection.inference.reasoningBudgetTokens === undefined ? {} : { reasoningBudgetTokens: selection.inference.reasoningBudgetTokens }),
        },
      }
    }
    normalized[node.id] = { primary: ids[0], fallback: ids.slice(1), selections }
  }
  return normalized
}

function inferenceFor(model: ModelCatalogModel, current?: ProfileModelSelection['inference']): ProfileModelSelection['inference'] {
  if (current !== undefined) return { ...current }
  return {
    reasoningIntensity: model.inference.default.reasoningIntensity,
    ...(model.inference.default.reasoningBudgetTokens === null ? {} : { reasoningBudgetTokens: model.inference.default.reasoningBudgetTokens }),
  }
}

function withSelection(binding: ProfileModelBinding, model: ModelCatalogModel): ProfileModelBinding {
  const existing = binding.selections?.[model.selectionId]
  return {
    ...binding,
    selections: {
      ...binding.selections,
      [model.selectionId]: {
        ...(existing ?? {}),
        provider: model.provider,
        model: model.model,
        inference: inferenceFor(model, existing?.inference),
      },
    },
  }
}

function sameTarget(left: { provider: string; model: string } | undefined, right: { provider: string; model: string } | undefined) {
  return left !== undefined && right !== undefined && left.provider === right.provider && left.model === right.model
}

function modelBindingLabel(bindingKey: string, catalog: ModelCatalogModel[], selections?: Record<string, ProfileModelSelection>) {
  const detail = catalog.find((model) => model.selectionId === bindingKey)
  const selection = detail ?? selections?.[bindingKey] ?? legacyModelSelections[bindingKey]
  return selection ? `${selection.provider} · ${selection.model} (${bindingKey})` : bindingKey
}

function InferenceSettingsControls({ selectionId, model, selection, onChange }: {
  selectionId: string
  model: ModelCatalogModel
  selection: ProfileModelSelection | undefined
  onChange: (patch: Partial<ProfileModelSelection['inference']>) => void
}) {
  const settings = inferenceFor(model, selection?.inference)
  const budget = model.inference.reasoningBudgetTokens
  const providerDefaultOnly = model.inference.reasoningIntensity.length === 1
    && model.inference.reasoningIntensity[0] === 'NONE' && budget === null
  return <div className="mt-2 rounded border border-row-line bg-page p-2 text-[0.65625rem] text-body">
    {providerDefaultOnly ? <p><b>추론 설정</b><span className="mt-1 block text-muted-2">Provider 기본 · 별도 옵션을 덮어쓰지 않습니다.</span></p> : <label className="block font-semibold">추론 강도
      <select aria-label={`추론 강도 ${selectionId}`} className={`${control} mt-1`} value={settings.reasoningIntensity} onChange={(event) => {
        const reasoningIntensity = event.target.value
        onChange({
          reasoningIntensity,
          ...(budget === null || reasoningIntensity === 'NONE'
            ? { reasoningBudgetTokens: undefined }
            : { reasoningBudgetTokens: settings.reasoningBudgetTokens ?? budget.min }),
        })
      }}>
        {model.inference.reasoningIntensity.map((intensity) => <option key={intensity} value={intensity}>{inferenceLabel(model, intensity)}</option>)}
      </select>
    </label>}
    {budget !== null && settings.reasoningIntensity !== 'NONE' && <label className="mt-2 block font-semibold">추론 예산 (tokens)
      <input aria-label={`추론 예산 ${selectionId}`} className={`${control} mt-1`} type="number" min={budget.min} max={budget.max} step={budget.multipleOf} value={settings.reasoningBudgetTokens ?? ''} onChange={(event) => {
        const value = Number.parseInt(event.target.value, 10)
        if (Number.isInteger(value)) onChange({ reasoningBudgetTokens: value })
      }} />
    </label>}
  </div>
}

function inferenceLabel(model: ModelCatalogModel, intensity: string) {
  if (intensity === 'NONE') return 'Provider 기본'
  if (model.provider === 'ANTHROPIC' && model.inference.reasoningBudgetTokens !== null) return '수동 추론'
  return intensity
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

export function profileToolRequirement(profileKey: ProfileKey, tool: string): ToolBindingMode {
  const bindings = Object.values(defaultToolBindingsByHandler[profileKey])
    .map((tools) => tools[tool])
    .filter((mode): mode is ToolBindingMode => mode !== undefined)
  if (bindings.includes('SYSTEM_REQUIRED')) return 'SYSTEM_REQUIRED'
  if (bindings.includes('MODEL_REQUIRED')) return 'MODEL_REQUIRED'
  return 'MODEL_OPTIONAL'
}

export function toolRequirementLabel(mode: ToolBindingMode) {
  if (mode === 'SYSTEM_REQUIRED') return '필수 · 시스템 실행'
  if (mode === 'MODEL_REQUIRED') return '필수 · 모델 호출'
  return '선택 · 모델 호출'
}

export { hydrateToolBindings, normalizeModelBindings, toolCatalog, toolDetails }

function uniqueNodeId(base: string, nodes: WorkflowNode[]) {
  if (!nodes.some((node) => node.id === base)) return base
  let suffix = 2
  while (nodes.some((node) => node.id === `${base}_${suffix}`)) suffix += 1
  return `${base}_${suffix}`
}

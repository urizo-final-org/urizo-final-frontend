import { type FormEvent, useId, useState } from 'react'
import type { CmsRouteId } from '../../../app/routes'
import { describeFailure } from '../../../shared/api/error'
import { Icon } from '../../../shared/ui/icons'
import { Badge, control, panel, primaryButton, secondaryButton, textarea } from '../../../shared/ui/primitives'
import AssistantPreviewModal from './AssistantPreviewModal'
import MenuRemovalNotice from './MenuRemovalNotice'
import MenuTreePreview from './MenuTreePreview'
import type { NaturalCmsApi, NaturalCmsJob } from './api'
import { hasChange, lineDiff } from './diff'
import { menuPreviewTree, menuRemoval, type AssistantMenu, type MenuCommand } from './menuTree'

/** 되묻기에 한 번에 보여줄 후보 최대 갯수. 더 많으면 목록에서 직접 고르게 한다. */
const MAX_CANDIDATES = 5

/** 한 필드의 변경 전후를 줄 단위로 보여준다. 바뀐 줄이 없으면 그대로임을 알린다. */
function FieldDiff({ before, after }: { before: string; after: string }) {
  const lines = lineDiff(before, after)
  if (!hasChange(lines)) {
    return <p className="m-0 rounded-[0.3125rem] border border-line-soft bg-sub px-[0.6875rem] py-[0.5rem] text-[0.75rem] text-muted-2">바뀌지 않습니다.</p>
  }
  return <div className="overflow-hidden rounded-[0.3125rem] border border-line-soft">
    {lines.map((line, index) => <div
      key={`${line.kind}-${index}`}
      className={`grid grid-cols-[1.25rem_1fr] gap-2 px-[0.6875rem] py-[0.1875rem] text-[0.8125rem] leading-[1.7] ${
        line.kind === 'added' ? 'bg-[#f0f8f3] text-[#2f6b4f]'
          : line.kind === 'removed' ? 'bg-[#fdf1f0] text-[#a3564f]'
            : 'text-body'}`}
    >
      <span aria-hidden="true" className="select-none text-center text-muted-3">
        {line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ''}
      </span>
      <span className="whitespace-pre-wrap break-words">{line.text || ' '}</span>
    </div>)}
  </div>
}

type AssistedRoute = Exclude<CmsRouteId, 'members'>

/**
 * 자연어 요청이 바꿀 대상. 화면에서 고른 항목을 그대로 전달한다.
 *
 * `fields`는 미리보기에서 변경 전으로 쓰는 현재 값이다. 화면이 이미 들고 있으므로
 * 다시 조회하지 않는다.
 */
export type CmsAssistantTarget = {
  type: 'MENU' | 'BOARD' | 'CONTENT' | 'TEMPLATE'
  id: string
  label: string
  fields: Record<string, string>
}

type AssistantProfile = {
  section: string
  title: string
  description: string
  capabilities: string[]
  excluded: string
  suggestions: string[]
}

const profiles: Record<AssistedRoute, AssistantProfile> = {
  menus: {
    section: '메뉴 관리',
    title: '메뉴 AI',
    description: '메뉴 구조와 연결 상태를 자연어로 정리해 보세요.',
    capabilities: ['메뉴 등록·수정·삭제', '상·하위 구조', '노출 순서', '콘텐츠·게시판 연결'],
    excluded: '컨텐츠 본문, 게시글, 템플릿은 변경하지 않아요.',
    suggestions: ['고객지원 아래에 자료실 메뉴를 만들어 줘', '비전을 맨 위로 올려 줘', '소개 메뉴에 회사 소개 컨텐츠를 연결해 줘'],
  },
  contents: {
    section: '컨텐츠 관리',
    title: '컨텐츠 AI',
    description: '정적 페이지의 제목과 본문 초안을 빠르게 다듬어 보세요.',
    capabilities: ['컨텐츠 등록·수정', '제목·본문 편집', '문단·목록 서식', '삭제 전 확인'],
    excluded: '메뉴 구조, 게시판·게시글, 템플릿은 변경하지 않아요.',
    suggestions: ['선택한 컨텐츠를 세 문단으로 정리해 줘', '제목을 더 명확하게 다듬어 줘', '새 안내 페이지 초안을 만들어 줘'],
  },
  boards: {
    section: '게시판 관리',
    title: '게시판 AI',
    description: '게시판과 게시글 작성 작업을 현재 화면 안에서 도와드려요.',
    capabilities: ['게시판 등록·수정', '게시글 작성·편집', '제목·본문 정리', '삭제 전 확인'],
    excluded: '메뉴 연결, 정적 컨텐츠, 템플릿은 변경하지 않아요.',
    suggestions: ['공지사항 게시판 설명을 작성해 줘', '선택한 게시글 제목을 다듬어 줘', '게시글 본문을 읽기 쉽게 정리해 줘'],
  },
  templates: {
    section: '템플릿 관리',
    title: '템플릿 AI',
    description: '사용자 사이트의 공통 디자인 설정을 자연어로 조정해 보세요.',
    capabilities: ['레이아웃 선택', '브랜드 색상', 'Header·Footer', '메인 이미지·문구·버튼'],
    excluded: '메뉴, 컨텐츠 본문, 게시판·게시글은 변경하지 않아요.',
    suggestions: ['대표 색상을 차분한 보라색으로 바꿔 줘', '메인 문구를 더 간결하게 다듬어 줘', 'Footer 문구를 전문적으로 정리해 줘'],
  },
}

/** 패널 상태 기계. 입력 → 분석 → 승인 대기 → 완료(또는 반려)로만 움직인다. */
type Phase =
  | { kind: 'input' }
  | { kind: 'asking'; requestText: string; candidates: CmsAssistantTarget[] }
  | { kind: 'analyzing' }
  | { kind: 'waiting'; job: NaturalCmsJob }
  | { kind: 'deciding'; job: NaturalCmsJob }
  | { kind: 'done'; job: NaturalCmsJob }
  | { kind: 'rejected'; job: NaturalCmsJob }
  | { kind: 'failed'; message: string }

/** 지금 자연어 변경이 가능한 리소스. 나머지 화면은 안내만 한다. */
const SUPPORTED: ReadonlySet<CmsAssistantTarget['type']> = new Set(['CONTENT', 'MENU'])

/** 자연어 변경을 받는 화면. 리소스별 작업이 끝난 화면부터 연다. */
const SUPPORTED_ROUTES: ReadonlySet<AssistedRoute> = new Set<AssistedRoute>(['contents', 'menus'])

/** 등록은 만들기 전이라 가리킬 id가 없다. 대상 자리에 고정 표식을 보낸다. */
export const NEW_MENU_TARGET: CmsAssistantTarget = {
  type: 'MENU',
  id: 'new',
  label: '새 메뉴 만들기',
  fields: {},
}

export default function CmsAiAssistant({ route, target, candidates, menus, onTarget, api, collapsed, onToggle }: {
  route: AssistedRoute
  target: CmsAssistantTarget | null
  candidates: CmsAssistantTarget[]
  menus: AssistantMenu[]
  onTarget: (target: CmsAssistantTarget) => void
  api: NaturalCmsApi
  collapsed: boolean
  onToggle: () => void
}) {
  const profile = profiles[route]
  const inputId = useId()
  const feedbackId = useId()
  const [draft, setDraft] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'input' })
  const [feedback, setFeedback] = useState('')
  const [detail, setDetail] = useState(false)
  const routeSupported = SUPPORTED_ROUTES.has(route)
  const supported = target !== null && SUPPORTED.has(target.type)

  /** 말에 대상이 없으면 이름이 겹치는 후보를 고르게 한다. 선택지는 코드가 만든다. */
  function narrow(requestText: string) {
    const words = requestText.split(/\s+/).filter((word) => word.length > 1)
    const matched = candidates.filter((candidate) => words.some((word) => candidate.label.includes(word)))
    return (matched.length > 0 ? matched : candidates).slice(0, MAX_CANDIDATES)
  }

  async function start(requestText: string, chosen: CmsAssistantTarget) {
    setPhase({ kind: 'analyzing' })
    try {
      const profileVersionId = await api.activeProfileVersionId()
      const job = await api.createJob({
        profileVersionId,
        requestText,
        resource: { type: chosen.type, id: chosen.id },
      })
      setDraft('')
      setPhase({ kind: 'waiting', job })
    }
    catch (failure) {
      setPhase({ kind: 'failed', message: describeFailure(failure) })
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const requestText = draft.trim()
    if (!requestText || !routeSupported) return
    if (!supported) {
      setPhase({ kind: 'asking', requestText, candidates: narrow(requestText) })
      return
    }
    await start(requestText, target)
  }

  function choose(requestText: string, chosen: CmsAssistantTarget) {
    onTarget(chosen)
    void start(requestText, chosen)
  }

  async function decide(job: NaturalCmsJob, decision: 'APPROVED' | 'REJECTED') {
    if (!job.previewId || !job.previewHash) {
      setPhase({ kind: 'failed', message: '미리보기가 없어 승인할 수 없습니다. 다시 요청해 주세요.' })
      return
    }
    if (decision === 'REJECTED' && !feedback.trim()) return
    setPhase({ kind: 'deciding', job })
    try {
      const decided = await api.decide(job.jobId, {
        previewId: job.previewId,
        previewHash: job.previewHash,
        decision,
        ...(decision === 'REJECTED' ? { feedback: feedback.trim() } : {}),
      })
      setFeedback('')
      setPhase(decision === 'APPROVED' ? { kind: 'done', job: decided } : { kind: 'rejected', job: decided })
    }
    catch (failure) {
      setPhase({ kind: 'failed', message: describeFailure(failure) })
    }
  }

  function reset() {
    setFeedback('')
    setDetail(false)
    setPhase({ kind: 'input' })
  }

  function commandFields(job: NaturalCmsJob) {
    const command = job.structuredCommand as { fields?: Record<string, unknown> } | null
    return Object.entries(command?.fields ?? {}).map(([name, value]) => [name, String(value)] as const)
  }

  /** 명령서가 아직 없을 수 있다. 미리보기 전에는 `null`이다. */
  function menuCommand(job: NaturalCmsJob): MenuCommand | null {
    const command = job.structuredCommand as Partial<MenuCommand> | null
    if (!command || typeof command.operation !== 'string') return null
    return { operation: command.operation, fields: command.fields ?? {} }
  }

  function removes(job: NaturalCmsJob) {
    return target?.type === 'MENU' && menuCommand(job)?.operation === 'DELETE'
  }

  /**
   * 메뉴 미리보기. 위치가 곧 정보라 트리로 보여주고, 삭제만 목록으로 센다.
   *
   * 결과 순서는 화면이 계산한다. 파이프라인이 주는 미리보기는 대상 한 행뿐이다.
   */
  function menuPreview(job: NaturalCmsJob) {
    const command = menuCommand(job)
    if (!command || !target) return <p className="m-0 text-[0.71875rem] text-muted-2">아직 변경 내용을 받지 못했습니다.</p>
    if (command.operation === 'DELETE') {
      const removal = menuRemoval(menus, target.id)
      return removal
        ? <MenuRemovalNotice target={removal.target} removed={removal.children} />
        : <p className="m-0 text-[0.71875rem] text-muted-2">삭제할 메뉴를 찾지 못했습니다.</p>
    }
    return <MenuTreePreview nodes={menuPreviewTree(menus, command, target.id)} />
  }

  if (collapsed) return <aside
    className={`${panel} sticky top-[4.375rem] flex flex-col items-center gap-3 px-2 py-3 max-[1239px]:static max-[1239px]:flex-row`}
    aria-label={`${profile.section} 자연어 도우미`}
  >
    <button
      type="button"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[0.3125rem] border border-btn-line bg-white text-base font-semibold text-muted hover:bg-sub"
      onClick={onToggle}
      aria-expanded="false"
      aria-label={`${profile.title} 패널 펼치기`}
    >‹</button>
    <span className="grid h-[1.625rem] w-[1.625rem] shrink-0 place-items-center rounded-md bg-teal-bg text-teal-fg" aria-hidden="true"><Icon name="bot" size={15} /></span>
    <strong className="text-[0.71875rem] font-semibold text-body [writing-mode:vertical-rl] max-[1239px]:[writing-mode:horizontal-tb]">{profile.title}</strong>
  </aside>

  return <aside
    className={`${panel} sticky top-[4.375rem] flex max-h-[calc(100vh-5.625rem)] flex-col overflow-hidden max-[1239px]:static max-[1239px]:max-h-none`}
    aria-label={`${profile.section} 자연어 도우미`}
  >
    <div className="flex items-center gap-[0.5625rem] border-b border-line-soft px-4 py-[0.875rem]">
      <span className="grid h-[1.625rem] w-[1.625rem] shrink-0 place-items-center rounded-md bg-teal-bg text-teal-fg" aria-hidden="true"><Icon name="bot" size={15} /></span>
      <span className="min-w-0 flex-1">
        <h2 className="m-0 text-[0.8125rem] font-semibold">{profile.title}</h2>
        <small className="block text-[0.65625rem] text-muted-2">현재 화면 범위 전용 AI 패널</small>
      </span>
      <span className="rounded bg-teal-bg px-[0.4375rem] py-[0.125rem] text-[0.65625rem] font-semibold text-teal-ink">AI</span>
      <button
        type="button"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-[0.3125rem] border border-btn-line bg-white text-base font-semibold text-muted hover:bg-sub"
        onClick={onToggle}
        aria-expanded="true"
        aria-label={`${profile.title} 패널 접기`}
      >›</button>
    </div>

    <div className="cms-ai-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-[0.875rem]">
      <div className="rounded-[0.3125rem] border border-line-soft bg-sub px-[0.6875rem] py-[0.625rem] text-[0.71875rem] leading-[1.6] text-muted">
        <b className="font-semibold text-ink">현재 화면 전용</b> · 이 패널은 <b className="font-semibold text-ink">{profile.section}</b> 범위의 CMS 변경만 제안합니다.
        <span className="mt-[0.3125rem] block text-muted-2">{profile.excluded}</span>
      </div>

      <p className="mt-[0.875rem] text-[0.71875rem] leading-[1.6] text-muted">{profile.description}</p>

      <div className="mt-[0.875rem] rounded-[0.3125rem] border border-line-soft px-[0.6875rem] py-[0.625rem]" aria-live="polite">
        <small className="block text-[0.65625rem] text-muted-3">변경 대상</small>
        {target
          ? <b className="mt-[0.1875rem] block truncate text-[0.71875rem] font-semibold text-ink" title={target.label}>{target.label}</b>
          : <span className="mt-[0.1875rem] block text-[0.71875rem] text-muted-2">목록에서 항목을 선택하면 그 대상에 적용합니다.</span>}
      </div>

      <div className="mt-[0.875rem] flex flex-wrap gap-[0.375rem]">
        {profile.capabilities.map((item) => <span key={item} className="rounded border border-[#d6e2e6] bg-[#f7fbfb] px-[0.4375rem] py-[0.1875rem] text-[0.65625rem] font-semibold text-[#3f7f86]">{item}</span>)}
      </div>

      <label className="mt-[0.875rem] block text-[0.71875rem] font-semibold text-body" htmlFor={inputId}>자연어 요청</label>
      <textarea
        id={inputId}
        className={`${textarea} min-h-[4.75rem]`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="CMS 변경 요청을 입력하세요"
      />

      <div className="mt-[0.5625rem] grid gap-[0.375rem]">
        {profile.suggestions.map((suggestion) => <button
          key={suggestion}
          type="button"
          className="w-full rounded-[0.3125rem] border border-dashed border-[#d6e2e6] bg-[#f7fbfb] px-[0.625rem] py-[0.5625rem] text-left text-[0.71875rem] leading-[1.5] text-[#3f7f86] hover:bg-[#eef7f8]"
          onClick={() => setDraft(suggestion)}
        >추천 요청: {suggestion}</button>)}
      </div>

      <div className="mt-4 border-t border-line-soft pt-[0.875rem]" aria-live="polite">
        {phase.kind === 'analyzing' && <p className="m-0 text-[0.71875rem] text-muted">요청을 분석하고 있습니다…</p>}

        {phase.kind === 'asking' && <>
          <b className="text-[0.78125rem] font-semibold">어느 것을 바꿀까요?</b>
          <p className="mt-[0.3125rem] text-[0.6875rem] leading-[1.6] text-muted-2">요청에 대상이 분명하지 않아 확인이 필요합니다.</p>
          <div className="mt-[0.625rem] grid gap-[0.375rem]">
            {phase.candidates.map((candidate) => <button
              key={`${candidate.type}:${candidate.id}`}
              type="button"
              className="w-full rounded-[0.3125rem] border border-line-soft bg-white px-[0.625rem] py-[0.5625rem] text-left text-[0.71875rem] text-body hover:bg-sub"
              onClick={() => choose(phase.requestText, candidate)}
            >{candidate.label}</button>)}
            {phase.candidates.length === 0 && <p className="m-0 text-[0.6875rem] text-muted-2">고를 수 있는 항목이 없습니다.</p>}
          </div>
          <p className="mt-[0.625rem] mb-0 text-[0.65625rem] leading-[1.5] text-muted-3">찾는 항목이 없으면 왼쪽 목록에서 직접 선택해 주세요.</p>
          <button type="button" className={`${secondaryButton} mt-[0.625rem] w-full justify-center`} onClick={reset}>취소</button>
        </>}

        {(phase.kind === 'waiting' || phase.kind === 'deciding') && <>
          <div className="flex items-center gap-[0.4375rem]">
            <Badge tone="wait">승인 대기</Badge>
            <b className="text-[0.78125rem] font-semibold">변경 내용 확인</b>
          </div>
          <div className="mt-[0.625rem] rounded-[0.3125rem] border border-line-soft bg-sub px-[0.6875rem] py-[0.625rem]">
            <small className="block text-[0.65625rem] text-muted-3">요청</small>
            <span className="mt-[0.1875rem] block text-[0.71875rem] text-body">{phase.job.requestText}</span>
          </div>
          <button
            type="button"
            className={`${secondaryButton} mt-[0.625rem] w-full justify-center`}
            onClick={() => setDetail(true)}
          >{removes(phase.job) ? '삭제 내용 확인하기' : '변경 내용 자세히 보기'}</button>
          <label className="mt-[0.875rem] block text-[0.71875rem] font-semibold text-body" htmlFor={feedbackId}>반려 사유</label>
          <input
            id={feedbackId}
            className={control}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="반려할 때만 입력합니다"
          />
          <div className="mt-[0.875rem] flex gap-2">
            <button
              type="button"
              className={`${secondaryButton} flex-1 justify-center`}
              disabled={phase.kind === 'deciding' || !feedback.trim()}
              onClick={() => void decide(phase.job, 'REJECTED')}
            >반려</button>
            <button
              type="button"
              className={`${primaryButton} flex-1 justify-center`}
              disabled={phase.kind === 'deciding'}
              onClick={() => void decide(phase.job, 'APPROVED')}
            >승인하고 반영</button>
          </div>
        </>}

        {phase.kind === 'done' && <>
          <Badge tone="ok">반영 완료</Badge>
          <p className="mt-[0.625rem] text-[0.71875rem] text-muted">요청한 변경을 반영했습니다.</p>
          <button type="button" className={`${secondaryButton} mt-[0.625rem] w-full justify-center`} onClick={reset}>새 요청</button>
        </>}

        {phase.kind === 'rejected' && <>
          <Badge tone="wait">반려됨</Badge>
          <p className="mt-[0.625rem] text-[0.71875rem] text-muted">반영하지 않았습니다. 요청을 고쳐 다시 시도해 주세요.</p>
          <button type="button" className={`${secondaryButton} mt-[0.625rem] w-full justify-center`} onClick={reset}>새 요청</button>
        </>}

        {phase.kind === 'failed' && <>
          <p className="m-0 flex items-start gap-2 rounded-[0.3125rem] border border-[#f0d5d1] bg-fail-bg p-[0.6875rem] text-[0.71875rem] leading-[1.6] text-fail-fg" role="alert">
            <Icon name="triangle-alert" size={15} className="mt-[0.0625rem]" />{phase.message}
          </p>
          <button type="button" className={`${secondaryButton} mt-[0.625rem] w-full justify-center`} onClick={reset}>다시 시도</button>
        </>}
      </div>
    </div>

    <form className="border-t border-line-soft p-3" onSubmit={(event) => void submit(event)}>
      <button
        className={`${primaryButton} w-full justify-center`}
        type="submit"
        disabled={!draft.trim() || !routeSupported || phase.kind === 'analyzing' || phase.kind === 'deciding'}
      >요청 분석하기</button>
      {!routeSupported && <p className="mb-0 mt-2 text-center text-[0.625rem] leading-4 text-muted-3">
        {profile.section} 화면은 아직 자연어 변경을 지원하지 않습니다.
      </p>}
    </form>

    {detail && (phase.kind === 'waiting' || phase.kind === 'deciding') && <AssistantPreviewModal
      title={removes(phase.job) ? `${profile.section} 삭제 확인` : `${profile.section} 변경 미리보기`}
      subtitle={removes(phase.job)
        ? '삭제한 메뉴는 되돌릴 수 없습니다.'
        : '승인하면 기존 CMS 저장 경로로 반영됩니다.'}
      busy={phase.kind === 'deciding'}
      approveLabel={removes(phase.job) ? '삭제하고 반영' : undefined}
      danger={removes(phase.job)}
      onApprove={() => { setDetail(false); void decide(phase.job, 'APPROVED') }}
      onClose={() => setDetail(false)}
    >
      <div className="rounded-[0.3125rem] border border-line-soft bg-sub px-[0.6875rem] py-[0.625rem]">
        <small className="block text-[0.65625rem] text-muted-3">요청</small>
        <span className="mt-[0.1875rem] block text-[0.8125rem] text-body">{phase.job.requestText}</span>
      </div>
      {target?.type === 'MENU'
        ? <div className="mt-3">{menuPreview(phase.job)}</div>
        : <div className="mt-3 grid gap-3">
          {commandFields(phase.job).map(([name, value]) => <section key={name}>
            <small className="block text-[0.65625rem] font-semibold text-muted-2">{name}</small>
            <FieldDiff before={target?.fields[name] ?? ''} after={value} />
          </section>)}
          {commandFields(phase.job).length === 0 && <p className="m-0 text-[0.71875rem] text-muted-2">아직 변경 내용을 받지 못했습니다.</p>}
        </div>}
    </AssistantPreviewModal>}
  </aside>
}

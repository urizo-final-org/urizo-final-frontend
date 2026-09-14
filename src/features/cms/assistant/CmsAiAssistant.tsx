import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import type { CmsRouteId } from '../../../app/routes'
import { describeFailure } from '../../../shared/api/error'
import { notifyCmsChanged, notifySiteUpdated } from '../api'
// 게시물 미리보기는 사용자 화면과 같은 렌더러를 쓴다. `AI05-001`이 이 재사용을 위해 export를 뽑았다.
import { ContentDocument } from '../../site/contentDocument'
import { contentImageUrl, type ContentImage } from '../api'
import { Icon } from '../../../shared/ui/icons'
import { control, panel, primaryButton, secondaryButton, textarea } from '../../../shared/ui/primitives'
import AssistantPreviewModal from './AssistantPreviewModal'
import AssistantRecords from './AssistantRecords'
import CmsRequestStatus from './CmsRequestStatus'
import MenuRemovalNotice from './MenuRemovalNotice'
import MenuTreePreview from './MenuTreePreview'
import { refusalMessage } from './refusal'
import type { NaturalCmsApi, NaturalCmsJob, NaturalCmsRecord, NaturalCmsRefusal } from './api'
import { hasChange, lineDiff } from './diff'
import { menuPreviewTree, menuRemoval, type AssistantMenu, type MenuCommand } from './menuTree'
import { templateProposal, TemplateProposalPreview, type TemplateAssistantContext } from './TemplateProposal'

/** 되묻기에 한 번에 보여줄 후보 최대 갯수. 더 많으면 목록에서 직접 고르게 한다. */
const MAX_CANDIDATES = 5

/** 패널에 남길 지난 요청 수. 넘치면 오래된 것부터 밀려나고 거버넌스 실행 이력에서 본다. */
const MAX_RECORDS = 5

/**
 * 이만큼 움직이지 않은 `ACTIVE` Job은 멎은 것으로 본다.
 *
 * 정상 요청은 20~40초에 끝난다. 더 짧게 잡으면 멀쩡히 도는 요청에 「닫기」가 붙고,
 * 그것을 누르면 되돌릴 수 없다.
 */
const STALLED_AFTER_MS = 5 * 60 * 1_000

/** 미리보기는 파이프라인이 채운다. 첫 조회는 곧바로 하고 그 뒤에만 기다린다. */
const POLL_INTERVAL_MS = 1_500
const POLL_ATTEMPTS = 40

function wait(ms: number) {
  return new Promise<void>((resolve) => { window.setTimeout(resolve, ms) })
}

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

type AssistedRoute = Exclude<CmsRouteId, 'members' | 'codes'>

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
  codeLabels?: Record<string, string>
}

/**
 * 화면별 안내.
 *
 * 홍보 문구(`description`)와 「…는 바꾸지 않아요」(`excluded`)를 뺐다. 앞의 것은 무엇을
 * 쓸지 알려주지 않고, 뒤의 것은 `capabilities`와 같은 말을 반대로 한다. 범위 밖 요청은
 * 가드레일이 사유와 함께 거절하므로 미리 두 번 말할 필요가 없다.
 *
 * 추천 문구도 뺐다. 화면마다 고정돼 있어 대상이 정해진 뒤에는 대개 맞지 않았다. 남은
 * `capabilities`가 무엇을 시킬 수 있는지 알려주는 유일한 자리다.
 */
type AssistantProfile = {
  section: string
  title: string
  /** 대상을 고르지 않았을 때의 안내. 화면마다 할 수 있는 것이 다르다. */
  empty: string
  capabilities: string[]
}

const profiles: Record<AssistedRoute, AssistantProfile> = {
  menus: {
    section: '메뉴 관리',
    title: '메뉴 AI',
    empty: '목록에서 고르거나, 바로 요청해 새 메뉴를 만들 수 있어요.',
    capabilities: ['메뉴 등록·수정·삭제', '상·하위 구조', '노출 순서', '콘텐츠·게시판 연결'],
  },
  contents: {
    section: '컨텐츠 관리',
    title: '컨텐츠 AI',
    empty: '목록에서 고르거나, 바로 요청해 새 컨텐츠를 만들 수 있어요.',
    capabilities: ['컨텐츠 등록·수정·삭제', '제목·본문 편집', '문단·목록 서식', '삭제 전 확인'],
  },
  boards: {
    section: '게시판 관리',
    title: '게시판 AI',
    empty: '목록에서 고르거나, 바로 요청해 새 게시판·게시글을 만들 수 있어요.',
    capabilities: ['게시판 등록·수정·삭제', '게시글 작성·편집·삭제', '제목·본문 정리', '삭제 전 확인'],
  },
  templates: {
    section: '템플릿 관리',
    title: '템플릿 AI',
    empty: '목록에서 항목을 선택하면 그 대상에 적용합니다.',
    capabilities: ['레이아웃 선택', '브랜드 색상', 'Header·Footer', '메인 이미지·문구·버튼'],
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
  | { kind: 'rejected'; job: NaturalCmsJob; refusal: NaturalCmsRefusal | null }
  | { kind: 'failed'; message: string }

/** 지금 자연어 변경이 가능한 리소스. 나머지 화면은 안내만 한다. */
const SUPPORTED: ReadonlySet<CmsAssistantTarget['type']> = new Set(['CONTENT', 'MENU', 'BOARD', 'TEMPLATE'])

/** 자연어 변경을 받는 화면. 리소스별 작업이 끝난 화면부터 연다. */
const SUPPORTED_ROUTES: ReadonlySet<AssistedRoute> = new Set<AssistedRoute>(['contents', 'menus', 'boards', 'templates'])

/** 화면이 다루는 리소스. 기록을 이 화면 것만으로 거르는 데 쓴다. */
const ROUTE_RESOURCE: Record<AssistedRoute, CmsAssistantTarget['type']> = {
  menus: 'MENU',
  contents: 'CONTENT',
  boards: 'BOARD',
  templates: 'TEMPLATE',
}

/** 멎음 판정과 「N분 전」이 시간이 지나면 바뀌므로 화면도 따라 움직인다. */
const CLOCK_INTERVAL_MS = 30 * 1_000

/** 등록은 만들기 전이라 가리킬 id가 없다. 대상 자리에 고정 표식을 보낸다. */
export const NEW_MENU_TARGET: CmsAssistantTarget = {
  type: 'MENU',
  id: 'new',
  label: '새 메뉴 만들기',
  fields: {},
}

export const NEW_BOARD_TARGET: CmsAssistantTarget = {
  type: 'BOARD',
  id: 'new',
  label: '새 게시판 만들기',
  /** 등록 미리보기가 빠진 필드를 알아보도록 빈 틀을 담는다. 변경 전 값이 없다는 뜻이기도 하다. */
  fields: { name: '', description: '' },
}

export const NEW_CONTENT_TARGET: CmsAssistantTarget = {
  type: 'CONTENT',
  id: 'new',
  label: '새 컨텐츠 만들기',
  fields: { title: '', body: '' },
}

/** 필드 이름을 사람 말로. 목록에 없으면 원래 이름을 그대로 쓴다. */
const FIELD_LABELS: Record<string, string> = {
  name: '이름',
  description: '설명',
  title: '제목',
  body: '내용',
  displayType: '게시판 유형',
  regionGroupKey: '지역 코드 그룹',
  categoryGroupKey: '분류 코드 그룹',
  thumbnailImageId: '대표 이미지',
  thumbnailAlt: '대표 이미지 설명',
  regionCodeId: '지역',
  categoryCodeId: '분류',
}

function fieldLabel(name: string) {
  return FIELD_LABELS[name] ?? name
}

/**
 * 게시물은 별도 Resource 타입이 아니라 `BOARD` 안에서 대상 id로 갈린다.
 *
 * 소속 게시판을 id가 함께 담으므로 서버가 등록·수정·삭제 모두 소속을 확인할 수 있다.
 * 게시물 번호만 보내면 화면이 어느 게시판을 열었는지 서버가 알 수 없다.
 */
export function postTargetId(boardId: number, postId: number | 'new') {
  return `board:${boardId}:post:${postId}`
}

const POST_TARGET_ID = /^board:\d+:post:(new|\d+)$/

function isPostTarget(target: CmsAssistantTarget | null) {
  return target !== null && target.type === 'BOARD' && POST_TARGET_ID.test(target.id)
}

/** 삭제 확인 문구는 무엇이 사라지는지 이름으로 말한다. 조사까지 붙여 둔다. */
function removalSubject(target: CmsAssistantTarget | null) {
  if (target === null) return '항목은'
  if (target.type === 'MENU') return '메뉴는'
  if (target.type === 'CONTENT') return '컨텐츠는'
  return isPostTarget(target) ? '게시물은' : '게시판은'
}

/** 요청 하나에 붙일 수 있는 사진. 더 늘리면 프롬프트에 주소만 길게 실린다. */
const MAX_ATTACHMENTS = 3

export default function CmsAiAssistant({ route, target, templateContext, candidates, menus, onTarget, api, onUploadImage, collapsed, onToggle }: {
  route: AssistedRoute
  target: CmsAssistantTarget | null
  templateContext?: TemplateAssistantContext | null
  candidates: CmsAssistantTarget[]
  menus: AssistantMenu[]
  onTarget: (target: CmsAssistantTarget) => void
  api: NaturalCmsApi
  /** 사진 첨부를 여는 화면만 넘긴다. 지금은 컨텐츠 화면뿐이다. */
  onUploadImage?: (file: File) => Promise<ContentImage>
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
  /**
   * 요청에 붙일 사진. 업로드는 **Job을 만들기 전에** 화면이 끝낸다.
   *
   * 그래서 파일이 파이프라인을 지나가지 않고 요청에는 주소만 실린다. `CreateJobRequest`는
   * 글자 네 칸뿐이라 파일을 담을 자리가 없고, 이 방식이면 공유 계약을 건드리지 않는다.
   */
  const [attached, setAttached] = useState<ContentImage[]>([])
  const [attaching, setAttaching] = useState(false)
  const [attachFailure, setAttachFailure] = useState<string | null>(null)
  /** 끌어다 놓는 동안의 표시. 자식 위를 지날 때마다 leave가 나므로 깊이로 센다. */
  const [dragDepth, setDragDepth] = useState(0)
  /**
   * 이 화면에서 내가 보낸 지난 요청.
   *
   * 거버넌스 실행 이력에서 읽는다. 조회가 막히면 빈 배열로 두어 기록 칸만 사라지고
   * 나머지 기능은 그대로 돈다 — `spring-core`에는 이력이 함께 읽는 코딩 DB가 없다.
   */
  const [records, setRecords] = useState<NaturalCmsRecord[]>([])
  const [closing, setClosing] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const attachInput = useRef<HTMLInputElement>(null)
  /** 지금 유효한 대기 세대. 새 요청이나 초기화가 이전 대기를 무효로 만든다. */
  const poll = useRef(0)
  const decisionBusy = useRef(false)
  const attachmentBusy = useRef(false)
  const attachmentGeneration = useRef(0)
  useEffect(() => {
    if (route !== 'templates') return
    attachmentGeneration.current += 1
    attachmentBusy.current = false
    setAttaching(false); setAttached([]); setAttachFailure(null)
  }, [route, target?.id])
  useEffect(() => () => { poll.current += 1 }, [])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS)
    return () => { window.clearInterval(timer) }
  }, [])
  useEffect(() => {
    let live = true
    void api.records(ROUTE_RESOURCE[route], MAX_RECORDS)
      .then((loaded) => { if (live) { setRecords(loaded); setNow(Date.now()) } })
      .catch(() => { if (live) setRecords([]) })
    return () => { live = false }
    // 결정이 끝날 때마다 다시 읽는다. 방금 보낸 요청이 그 자리에 들어가야 한다.
  }, [api, route, phase.kind])
  const routeSupported = SUPPORTED_ROUTES.has(route)
  const supported = target !== null && SUPPORTED.has(target.type)
  const canAttach = onUploadImage !== undefined && routeSupported
  const dropping = dragDepth > 0
  const attachmentLimit = route === 'templates' ? 5 : MAX_ATTACHMENTS
  /**
   * 결정을 기다리는 동안은 문장을 고칠 수 없다.
   *
   * 미리보기가 그 문장으로 만들어졌다. 여기서 고치게 두면 화면의 문장과 승인되는 내용이
   * 달라져, 고친 대로 적용된 줄 알고 승인하는 사고가 난다. 고치려면 반려가 그 길이다.
   */
  const locked = ['analyzing', 'waiting', 'deciding'].includes(phase.kind)
  const templateBusy = route === 'templates' && locked
  const templateBlocked = route === 'templates' ? templateContext?.blockedReason ?? (!target ? '템플릿을 선택해 주세요.' : null) : null
  function approvalBlocked(job: NaturalCmsJob) {
    if (job.resource.type !== 'TEMPLATE') return null
    if (!templateProposal(job)) return '승인할 템플릿 미리보기를 확인할 수 없습니다. 다시 요청해 주세요.'
    if (target?.type !== 'TEMPLATE' || job.resource.id !== target.id) return `이 요청의 대상은 ${job.resource.id}입니다. 해당 템플릿을 다시 선택해 주세요.`
    return templateBlocked
  }

  /**
   * 올려둔 사진 주소를 요청 끝에 붙인다.
   *
   * 파일이 아니라 주소만 실리므로 공유 계약이 그대로다. 모델은 여기 적힌 주소만 쓸 수 있고
   * 지어낸 주소는 저장 단계에서 거부된다.
   */
  function withAttachments(requestText: string) {
    if (attached.length === 0) return requestText
    const urls = attached.map((image) => contentImageUrl(image.id)).join(', ')
    return `${requestText}\n\n[이 요청에 첨부한 사진 주소: ${urls}]`
  }

  /** 말에 대상이 없으면 이름이 겹치는 후보를 고르게 한다. 선택지는 코드가 만든다. */
  function narrow(requestText: string) {
    const words = requestText.split(/\s+/).filter((word) => word.length > 1)
    const matched = candidates.filter((candidate) => words.some((word) => candidate.label.includes(word)))
    return (matched.length > 0 ? matched : candidates).slice(0, MAX_CANDIDATES)
  }

  /**
   * 막힌 이유를 함께 들고 반려 상태로 넘어간다.
   *
   * 사유는 Job 응답에 실을 수 없어 따로 받는다 — Orchestrator 가 Job 응답을 허용 목록으로
   * 검사해 필드를 더하면 파이프라인이 통째로 멎는다.
   *
   * 사람이 반려한 것은 부르지 않는다. 그때 사유는 이미 `approvalFeedback` 이고 화면도
   * 「반영하지 않았습니다」로 다르게 안내한다. 읽지 못해도 반려 자체는 보여 줘야 하므로
   * 실패는 삼킨다 — 그때는 요청 문장으로 안내하던 예전 경로로 되돌아간다.
   */
  async function rejectedPhase(job: NaturalCmsJob): Promise<Phase> {
    if (job.approvalDecision === 'REJECTED') return { kind: 'rejected', job, refusal: null }
    try {
      return { kind: 'rejected', job, refusal: await api.refusal(job.jobId) }
    }
    catch {
      return { kind: 'rejected', job, refusal: null }
    }
  }

  /**
   * 끝난 요청을 닫는다.
   *
   * 승인은 끝난 일이라 문장과 첨부를 비운다. 반려는 「아니 이렇게」라서 문장을 남겨 두고
   * 바로 고쳐 보낼 수 있게 한다 — 긴 요청을 다시 타이핑하게 만들지 않는다.
   */
  function finish(job: NaturalCmsJob) {
    setDraft('')
    setAttached([])
    setPhase({ kind: 'done', job })
  }

  /**
   * 미리보기가 생길 때까지 Job을 다시 읽는다.
   *
   * 생성 응답에는 미리보기가 없다. 파이프라인이 분석과 미리보기를 만든 뒤에야 채워지므로
   * 화면이 그 시점을 기다려야 한다. 취소·새 요청이 오면 세대 번호로 이전 대기를 버린다.
   */
  async function awaitPreview(jobId: string, generation: number) {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await wait(POLL_INTERVAL_MS)
      if (poll.current !== generation) return
      const job = await api.job(jobId)
      if (poll.current !== generation) return
      if (job.previewId && job.previewHash) {
        setPhase({ kind: 'waiting', job })
        return
      }
      if (job.status === 'COMPLETED') {
        finish(job)
        return
      }
      if (job.status === 'REJECTED') {
        setPhase(await rejectedPhase(job))
        return
      }
    }
    if (poll.current !== generation) return
    setPhase({
      kind: 'failed',
      message: '미리보기를 받지 못했습니다. 잠시 후 다시 요청해 주세요.',
    })
  }

  /**
   * 승인한 변경이 실제로 반영될 때까지 Job을 다시 읽는다.
   *
   * 승인 응답은 결정을 기록하고 Queue에 넣은 것까지다. 반영은 파이프라인이 잠시 뒤에 한다.
   * 응답 직후 목록을 다시 읽으면 아직 바뀌기 전 값을 받는다.
   */
  async function awaitApplied(jobId: string, generation: number) {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await wait(POLL_INTERVAL_MS)
      if (poll.current !== generation) return
      const job = await api.job(jobId)
      if (poll.current !== generation) return
      if (job.status === 'COMPLETED') {
        notifyCmsChanged()
        notifySiteUpdated()
        finish(job)
        return
      }
      if (job.status === 'REJECTED') {
        setPhase(await rejectedPhase(job))
        return
      }
    }
    if (poll.current !== generation) return
    setPhase({ kind: 'failed', message: '반영 결과를 받지 못했습니다. 목록을 새로고침해 확인해 주세요.' })
  }

  /** 사진을 먼저 올린다. 세 입구(버튼·붙여넣기·드래그)가 이 함수 하나로 모인다. */
  async function attach(files: FileList | null | undefined) {
    if (!onUploadImage || !files || attachmentBusy.current || templateBusy || templateBlocked) return
    const generation = attachmentGeneration.current
    const room = attachmentLimit - attached.length
    const chosen = [...files].filter((file) => file.type.startsWith('image/')).slice(0, room)
    if (chosen.length === 0) {
      setAttachFailure(room === 0
        ? `사진은 요청당 ${attachmentLimit}장까지 붙일 수 있습니다.`
        : '이미지 파일만 붙일 수 있습니다. 웹 페이지에서 끌어온 사진은 파일이 아니라 주소입니다.')
      return
    }
    setAttachFailure(null)
    setAttaching(true)
    attachmentBusy.current = true
    try {
      const saved: ContentImage[] = []
      for (const file of chosen) {
        saved.push(await onUploadImage(file))
        if (generation !== attachmentGeneration.current) return
      }
      setAttached((now) => [...now, ...saved].slice(0, attachmentLimit))
    }
    catch {
      if (generation === attachmentGeneration.current) setAttachFailure('사진을 올리지 못했습니다. JPG, PNG, WebP만 8MB까지 올릴 수 있습니다.')
    }
    finally { if (generation === attachmentGeneration.current) { attachmentBusy.current = false; setAttaching(false) } }
  }

  async function start(requestText: string, chosen: CmsAssistantTarget) {
    const generation = poll.current + 1
    poll.current = generation
    setPhase({ kind: 'analyzing' })
    try {
      const profileVersionId = await api.activeProfileVersionId()
      const job = await api.createJob({
        profileVersionId,
        requestText: withAttachments(requestText),
        resource: { type: chosen.type, id: chosen.id },
      })
      // 문장을 지우지 않는다. 미리보기가 이 문장으로 만들어지므로, 결정할 때까지
      // 무엇을 시켰는지 화면이 들고 있어야 한다. 승인하면 그때 비운다.
      setAttachFailure(null)
      await awaitPreview(job.jobId, generation)
    }
    catch (failure) {
      if (poll.current !== generation) return
      setPhase({ kind: 'failed', message: describeFailure(failure) })
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const requestText = draft.trim()
    if (!requestText || !routeSupported || attachmentBusy.current || locked || templateBlocked) return
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
    if (decisionBusy.current || (decision === 'APPROVED' && approvalBlocked(job))) return
    if (!job.previewId || !job.previewHash) {
      setPhase({ kind: 'failed', message: '미리보기가 없어 승인할 수 없습니다. 다시 요청해 주세요.' })
      return
    }
    if (decision === 'REJECTED' && !feedback.trim()) return
    decisionBusy.current = true
    setPhase({ kind: 'deciding', job })
    try {
      const decided = await api.decide(job.jobId, {
        previewId: job.previewId,
        previewHash: job.previewHash,
        decision,
        ...(decision === 'REJECTED' ? { feedback: feedback.trim() } : {}),
      })
      setFeedback('')
      if (decision === 'REJECTED') {
        setPhase(await rejectedPhase(decided))
        return
      }
      // 승인은 Queue에 넣은 것까지다. 반영이 끝난 뒤에 목록을 다시 읽어야 바뀐 값이 온다.
      setPhase({ kind: 'deciding', job: decided })
      poll.current += 1
      await awaitApplied(decided.jobId, poll.current)
    }
    catch (failure) {
      setPhase({ kind: 'failed', message: describeFailure(failure) })
    }
    finally { decisionBusy.current = false }
  }

  function reset() {
    poll.current += 1
    setFeedback('')
    setDetail(false)
    setPhase({ kind: 'input' })
  }

  /**
   * 기록의 대기 행에서 그 요청으로 돌아간다.
   *
   * 미리보기가 아직 유효하면 승인 대기 화면을 그대로 다시 연다. 그 사이에 끝났거나 닫혔으면
   * 지금 상태를 보여준다. 문장은 실제로 보낸 것을 그대로 띄운다.
   */
  async function resume(jobId: string) {
    const generation = poll.current + 1
    poll.current = generation
    setFeedback('')
    setDetail(false)
    try {
      const job = await api.job(jobId)
      if (poll.current !== generation) return
      setDraft(job.requestText)
      if (job.status === 'WAITING_APPROVAL' && job.previewId && job.previewHash) {
        setPhase({ kind: 'waiting', job })
        return
      }
      if (job.status === 'REJECTED') { setPhase(await rejectedPhase(job)); return }
      if (job.status === 'COMPLETED') { setPhase({ kind: 'done', job }); return }
      setPhase({ kind: 'analyzing' })
      await awaitPreview(jobId, generation)
    }
    catch (failure) {
      if (poll.current !== generation) return
      setPhase({ kind: 'failed', message: describeFailure(failure) })
    }
  }

  /** 멎은 요청을 사유와 함께 닫는다. 미리보기가 없어 승인할 것이 없는 상태다. */
  async function close(jobId: string) {
    if (closing) return
    setClosing(jobId)
    try {
      await api.cancel(jobId, '미리보기를 만들지 못하고 멎어 화면에서 닫았습니다.')
      setRecords(await api.records(ROUTE_RESOURCE[route], MAX_RECORDS))
      setNow(Date.now())
    }
    catch (failure) {
      setPhase({ kind: 'failed', message: describeFailure(failure) })
    }
    finally { setClosing(null) }
  }

  function commandFields(job: NaturalCmsJob) {
    const command = job.structuredCommand as { fields?: Record<string, unknown> } | null
    return Object.entries(command?.fields ?? {}).map(([name, value]) => [name, String(value)] as const)
  }

  /**
   * 메뉴가 아닌 리소스의 미리보기.
   *
   * 삭제는 무엇이 사라지는지만 확인하고, 게시물은 필드 아래에 저장 뒤 모습을 덧붙인다.
   * 등록한 게시물은 변경 전이 없어 diff가 같은 글을 두 번 보이게 하므로 렌더만 준다.
   */
  function resourcePreview(job: NaturalCmsJob) {
    if (job.resource.type === 'TEMPLATE') return <TemplateProposalPreview job={job} context={templateContext} />
    const operation = commandOf(job)?.operation
    if (operation === 'DELETE') {
      return <>
        <section>
          <small className="block text-[0.65625rem] font-semibold text-muted-2">삭제 대상</small>
          <span className="mt-[0.1875rem] block text-[0.8125rem] font-semibold text-body">{target?.label}</span>
        </section>
        {/* 게시판·컨텐츠 화면에서 `menus`는 이 대상을 연결한 메뉴다. 화면이 걸러 넘긴다. */}
        {!isPostTarget(target) && menus.length > 0 && <section>
          <small className="block text-[0.65625rem] font-semibold text-muted-2">
            이 {target?.type === 'CONTENT' ? '컨텐츠' : '게시판'}를 연결한 메뉴
          </small>
          <ul className="m-0 mt-[0.375rem] list-none p-0">
            {menus.map((menu) => <li className="py-[0.1875rem] text-[0.71875rem] text-body" key={menu.id}>
              {menu.name} <span className="text-muted-3">({menu.path})</span>
            </li>)}
          </ul>
          <p className="m-0 mt-[0.375rem] text-[0.6875rem] leading-[1.5] text-muted-2">
            메뉴는 삭제되지 않고 `연결 없음` 상태가 됩니다.
          </p>
        </section>}
      </>
    }
    const fields = previewFields(job)
    if (fields.length === 0) {
      return <p className="m-0 text-[0.71875rem] text-muted-2">아직 변경 내용을 받지 못했습니다.</p>
    }
    const post = isPostTarget(target)
    const content = target?.type === 'CONTENT'
    return <>
      {!(post && operation === 'CREATE') && fields.map(([name, value]) => <section key={name}>
        <small className="block text-[0.65625rem] font-semibold text-muted-2">{fieldLabel(name)}</small>
        {value === null
          ? <p className="m-0 mt-[0.1875rem] text-[0.71875rem] text-muted-3">(비어 있음)</p>
          : (content || post) && name === 'body'
            // 컨텐츠 본문은 편집기 문서다. 글자를 줄 단위로 견주면 부품 이름만 잔뜩 보인다.
            ? <div className="mt-[0.375rem] rounded-[0.3125rem] border border-line-soft bg-white px-4 py-3">
              <ContentDocument body={value} />
            </div>
            : name === 'thumbnailImageId'
              ? <div className="mt-2"><img className="max-h-48 rounded" src={contentImageUrl(Number(value))} alt="변경할 대표 이미지" /></div>
              : <FieldDiff before={(name === 'regionCodeId' || name === 'categoryCodeId' ? target?.codeLabels?.[target?.fields[name] ?? ''] : undefined) ?? target?.fields[name] ?? ''} after={(name === 'regionCodeId' || name === 'categoryCodeId' ? target?.codeLabels?.[value] : undefined) ?? value} />}
      </section>)}
      {post && postRender(job)}
    </>
  }

  /**
   * 게시물은 사용자가 읽는 글이라 저장 뒤 모습까지 보여준다.
   *
   * 사이트와 같은 `RichText`를 쓰므로 문법이 실제로 어떻게 렌더되는지 그대로 보인다.
   * **diff가 위, 렌더가 아래다.** 렌더가 위에 있으면 매끄럽게 읽히는 글에서 만족하고
   * 사실이 틀어진 것을 놓친다.
   */
  function postRender(job: NaturalCmsJob) {
    const sent = new Map(commandFields(job))
    const value = (name: string) => sent.has(name) ? sent.get(name) ?? '' : target?.fields[name] ?? ''
    return <section>
      <small className="block text-[0.65625rem] font-semibold text-muted-2">실제 화면</small>
      <div className="mt-[0.375rem] rounded-[0.3125rem] border border-line-soft bg-white px-4 py-[1.125rem]">
        <h3 className="m-0 text-[1.125rem] font-medium tracking-[-.03em] text-[#263e48]">{value('title')}</h3>
        {value('thumbnailImageId') && <figure className="my-4"><img className="max-h-56 rounded" src={contentImageUrl(Number(value('thumbnailImageId')))} alt={value('thumbnailAlt')} /><figcaption className="mt-1 text-xs text-muted-2">목록에 표시될 대표 이미지</figcaption></figure>}
        <p className="mt-2 text-xs text-muted-2">{['regionCodeId', 'categoryCodeId'].map((key) => value(key) ? target?.codeLabels?.[value(key)] ?? `${fieldLabel(key)} 코드 #${value(key)}` : '').filter(Boolean).join(' · ')}</p>
        <div className="mt-3 border-t border-[#e4ece9] pt-2">
          <ContentDocument body={value('body')} />
        </div>
      </div>
    </section>
  }

  /**
   * 등록은 보내지 않은 필드까지 보여준다. 값이 `null`이면 비어 있다는 뜻이다.
   *
   * 모델이 이름만 보내면 설명 줄이 아예 안 나와 무엇이 비었는지 알 수 없다. 등록 대상이
   * 빈 필드 틀을 들고 있으므로 그 이름으로 채운다. 수정은 보내지 않은 필드가 현재 값을
   * 그대로 유지하므로 채우지 않는다.
   */
  function previewFields(job: NaturalCmsJob): (readonly [string, string | null])[] {
    const sent = new Map(commandFields(job))
    if (commandOf(job)?.operation !== 'CREATE') {
      return [...sent].map(([name, value]) => [name, value] as const)
    }
    const names = [...new Set([...Object.keys(target?.fields ?? {}), ...sent.keys()])]
    return names.map((name) => [name, sent.get(name) ?? null] as const)
  }

  /** 명령서가 아직 없을 수 있다. 미리보기 전에는 `null`이다. */
  function commandOf(job: NaturalCmsJob): MenuCommand | null {
    const command = job.structuredCommand as Partial<MenuCommand> | null
    if (!command || typeof command.operation !== 'string') return null
    return { operation: command.operation, fields: command.fields ?? {} }
  }

  /** 삭제는 리소스와 무관하게 확인 모달로 받는다. 되돌릴 수 없는 것은 모두 같다. */
  function removes(job: NaturalCmsJob) {
    return commandOf(job)?.operation === 'DELETE'
  }

  /**
   * 메뉴 미리보기. 위치가 곧 정보라 트리로 보여주고, 삭제만 목록으로 센다.
   *
   * 결과 순서는 화면이 계산한다. 파이프라인이 주는 미리보기는 대상 한 행뿐이다.
   */
  function menuPreview(job: NaturalCmsJob) {
    const command = commandOf(job)
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
        {/* 경계를 머리글 한 줄로 올렸다. 본문의 안내 상자와 홍보 문구는 뺐다. */}
        <small className="block truncate text-[0.65625rem] text-muted-2">현재 화면 전용 · {profile.section}</small>
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
      <div className="rounded-[0.3125rem] border border-line-soft px-[0.6875rem] py-[0.625rem]" aria-live="polite">
        <small className="block text-[0.65625rem] text-muted-3">변경 대상</small>
        {target
          ? <b className="mt-[0.1875rem] block truncate text-[0.71875rem] font-semibold text-ink" title={target.label}>{target.label}</b>
          : <span className="mt-[0.1875rem] block text-[0.71875rem] leading-[1.55] text-muted-2">{profile.empty}</span>}
      </div>

      <div className="mt-[0.875rem] flex flex-wrap gap-[0.375rem]">
        {profile.capabilities.map((item) => <span key={item} className="rounded border border-[#d6e2e6] bg-[#f7fbfb] px-[0.4375rem] py-[0.1875rem] text-[0.65625rem] font-semibold text-[#3f7f86]">{item}</span>)}
      </div>

      <label className="mt-[0.875rem] block text-[0.71875rem] font-semibold text-body" htmlFor={inputId}>자연어 요청</label>
      <div
        className={`rounded-[0.3125rem] ${dropping ? 'shadow-[inset_0_0_0_2px_var(--primary)]' : ''}`}
        onDragEnter={(event) => { if (canAttach) { event.preventDefault(); setDragDepth((depth) => depth + 1) } }}
        onDragOver={(event) => { if (canAttach) event.preventDefault() }}
        onDragLeave={() => { if (canAttach) setDragDepth((depth) => Math.max(0, depth - 1)) }}
        onDrop={(event) => {
          if (!canAttach || locked) return
          // 막지 않으면 브라우저가 파일을 새 탭에서 열어 화면이 통째로 바뀐다.
          event.preventDefault()
          setDragDepth(0)
          void attach(event.dataTransfer.files)
        }}
      >
        <textarea
          id={inputId}
          className={`${textarea} min-h-56 leading-relaxed ${locked ? 'cursor-default border-dashed bg-sub text-muted-2' : ''}`}
          rows={10}
          value={draft}
          readOnly={locked}
          // 속성만으로는 부족하다. 자동 완성이나 프로그램이 넣는 값은 readOnly를 지나간다.
          onChange={(event) => { if (!locked) setDraft(event.target.value) }}
          onPaste={(event) => { if (canAttach && !locked && event.clipboardData.files.length > 0) void attach(event.clipboardData.files) }}
          placeholder="CMS 변경 요청을 입력하세요"
        />
      </div>

      {canAttach && <div className="mt-[0.375rem] flex flex-wrap items-center gap-[0.375rem]">
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-[0.3125rem] bg-white text-base font-semibold text-muted shadow-[inset_0_0_0_1px_#dfe7e6] hover:bg-sub"
          onClick={() => attachInput.current?.click()}
          disabled={attaching || locked || !!templateBlocked}
          aria-label="사진 첨부"
        >+</button>
        {attached.map((image) => <span
          key={image.id}
          className="flex items-center gap-1 rounded-[0.3125rem] bg-sub py-[0.1875rem] pl-[0.1875rem] pr-[0.375rem] shadow-[inset_0_0_0_1px_#dfe7e6]"
        >
          <img className="h-6 w-6 rounded-[0.1875rem] object-cover" src={contentImageUrl(image.id)} alt="" />
          <button
            type="button"
            className="text-[0.6875rem] font-semibold text-muted-2 hover:text-fail-fg"
            onClick={() => setAttached((now) => now.filter((item) => item.id !== image.id))}
            aria-label="첨부한 사진 빼기"
          >✕</button>
        </span>)}
        {attaching
          ? <span className="text-[0.65625rem] text-muted-3">올리는 중…</span>
          : attached.length === 0 && <span className="text-[0.65625rem] leading-[1.4] text-muted-3">
            사진을 붙여넣거나 끌어다 놓아도 됩니다
          </span>}
        <input
          className="hidden"
          ref={attachInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(event) => { void attach(event.target.files); event.target.value = '' }}
        />
      </div>}
      {attachFailure && <p className="mt-[0.375rem] text-[0.65625rem] leading-[1.5] text-fail-fg" role="alert">{attachFailure}</p>}

      <div className="mt-4 border-t border-line-soft pt-[0.875rem]" aria-live="polite">
        {phase.kind === 'analyzing' && <CmsRequestStatus busy tone="run">요청을 분석하고 있습니다…</CmsRequestStatus>}

        {phase.kind === 'asking' && <>
          <CmsRequestStatus><b>어느 것을 바꿀까요?</b>
            <p>요청에 대상이 분명하지 않아 확인이 필요합니다.</p>
          </CmsRequestStatus>
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
          <CmsRequestStatus busy={phase.kind === 'deciding'} tone={phase.kind === 'deciding' ? 'run' : 'wait'}>
            {phase.kind === 'deciding' ? '요청을 처리하고 있습니다…' : <><b>승인 대기</b><p>변경 내용 확인</p></>}
          </CmsRequestStatus>
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
              disabled={phase.kind === 'deciding' || !!approvalBlocked(phase.job)}
              onClick={() => void decide(phase.job, 'APPROVED')}
            >승인하고 반영</button>
          </div>
          {approvalBlocked(phase.job) && <p role="alert" className="text-xs text-fail-fg">{approvalBlocked(phase.job)}</p>}
        </>}

        {phase.kind === 'done' && <>
          <CmsRequestStatus tone="ok"><b>반영 완료</b><p>요청한 변경을 반영했습니다.</p></CmsRequestStatus>
          <button type="button" className={`${secondaryButton} mt-[0.625rem] w-full justify-center`} onClick={reset}>새 요청</button>
        </>}

        {/* 같은 REJECTED라도 내가 반려한 것과 화면 범위 밖이라 막힌 것은 다른 안내다. */}
        {phase.kind === 'rejected' && <>
          <CmsRequestStatus>
            <b>{phase.job.approvalDecision === 'REJECTED' ? '반려됨' : '지원하지 않는 요청'}</b>
            <p>{phase.job.approvalDecision === 'REJECTED'
              ? '반영하지 않았습니다. 요청을 고쳐 다시 시도해 주세요.'
              : refusalMessage(
                phase.refusal?.code ?? null, phase.refusal?.reason ?? null,
                phase.job.requestText, profile.section,
                phase.refusal?.operations ?? [])}</p>
          </CmsRequestStatus>
          <button type="button" className={`${secondaryButton} mt-[0.625rem] w-full justify-center`} onClick={reset}>새 요청</button>
        </>}

        {phase.kind === 'failed' && <>
          <p className="m-0 flex items-start gap-2 rounded-[0.3125rem] border border-[#f0d5d1] bg-fail-bg p-[0.6875rem] text-[0.71875rem] leading-[1.6] text-fail-fg" role="alert">
            <Icon name="triangle-alert" size={15} className="mt-[0.0625rem]" />{phase.message}
          </p>
          <button type="button" className={`${secondaryButton} mt-[0.625rem] w-full justify-center`} onClick={reset}>다시 시도</button>
        </>}
      </div>

      <AssistantRecords
        records={records}
        now={now}
        stalledAfterMs={STALLED_AFTER_MS}
        busy={closing}
        onResume={(jobId) => void resume(jobId)}
        onClose={(jobId) => void close(jobId)}
      />
    </div>

    <form className="border-t border-line-soft p-3" onSubmit={(event) => void submit(event)}>
      <button
        className={`${primaryButton} w-full justify-center`}
        type="submit"
        disabled={!draft.trim() || !routeSupported || attaching || !!templateBlocked || locked}
      >요청 분석하기</button>
      {templateBlocked && <p className="mb-0 mt-2 text-xs text-muted-2">{templateBlocked}</p>}
      {!routeSupported && <p className="mb-0 mt-2 text-center text-[0.625rem] leading-4 text-muted-3">
        {profile.section} 화면은 아직 자연어 변경을 지원하지 않습니다.
      </p>}
    </form>

    {detail && (phase.kind === 'waiting' || phase.kind === 'deciding') && <AssistantPreviewModal
      title={removes(phase.job) ? `${profile.section} 삭제 확인` : `${profile.section} 변경 미리보기`}
      subtitle={removes(phase.job)
        ? `삭제한 ${removalSubject(target)} 되돌릴 수 없습니다.`
        : '승인하면 기존 CMS 저장 경로로 반영됩니다.'}
      busy={phase.kind === 'deciding' || !!approvalBlocked(phase.job)}
      approveLabel={removes(phase.job) ? '삭제하고 반영' : undefined}
      danger={removes(phase.job)}
      onApprove={() => { setDetail(false); void decide(phase.job, 'APPROVED') }}
      onClose={() => setDetail(false)}
    >
      <div className="rounded-[0.3125rem] border border-line-soft bg-sub px-[0.6875rem] py-[0.625rem]">
        <small className="block text-[0.65625rem] text-muted-3">요청</small>
        <span className="mt-[0.1875rem] block text-[0.8125rem] text-body">{phase.job.requestText}</span>
      </div>
      {phase.job.resource.type === 'MENU'
        ? <div className="mt-3">{menuPreview(phase.job)}</div>
        : <div className="mt-3 grid gap-3">{resourcePreview(phase.job)}</div>}
    </AssistantPreviewModal>}
  </aside>
}

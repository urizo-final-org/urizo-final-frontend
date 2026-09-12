import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { describeFailure } from '../../../shared/api/error'
import { Icon } from '../../../shared/ui/icons'
import { Callout, PanelTitle, panel, primaryButton } from '../../../shared/ui/primitives'
import AssistantPreviewModal from './AssistantPreviewModal'
import type {
  NaturalCmsGuardrailApi, NaturalCmsGuardrailResourceKey, NaturalCmsGuardrailView,
} from './guardrailApi'
import {
  RESOURCE_LABELS, RESOURCE_SCREENS, fieldLabel, lockLabel, operationLabel, operationRank,
  resourceLabel,
} from './guardrailLabels'

/**
 * 자연어 CMS 가드레일 설정.
 *
 * LLM Ops 탭과 성격이 반대라는 것이 이 화면의 전제다. 저쪽은 허용 폴더가 비어 있으면
 * 파이프라인이 "제한 없음"으로 읽어 저장소가 실제로 뚫려 있다. 이쪽은 미리보기와 사람
 * 승인이 모든 반영 앞에 서 있어 활짝 열린 상태가 없다. 관리자가 놓치는 것은 뚫린 설정이
 * 아니라 기능이 조용히 멈춘 설정이다.
 *
 * 정하는 단위는 `대상 × 동작`이다. 필드 하나하나를 켜고 끄는 것은 관리자가 판단할 근거가
 * 없었다 — 「메뉴 주소는 AI 가 못 바꾸게」를 실제로 원하는 관리자는 드물고 「게시판은
 * 만들기만, 지우지는 못하게」는 자주 원한다. 필드는 그 대상이 무엇을 다루는지 알려 주는
 * 표시로만 남는다.
 *
 * 대상과 동작 목록은 서버가 Handler에서 읽어 내려준다. 화면이 갖고 있지 않으므로 서버가
 * 동작을 늘리면 저절로 나타나고, 없앤 동작이 옛 목록에서 계속 제공되지 않는다.
 */

/** 설정으로 열 수 없는 것들. 관리자가 실제로 알고 싶어 하는 목록이다. */
const OUTSIDE = [
  ['코드 작성', '파일을 읽거나 쓰는 도구가 없습니다'],
  ['AI 운영 설정 · 로그인 · 회원 · DB 구조', '대상으로 지정할 값 자체가 없습니다'],
  ['승인 없는 반영', '미리보기와 사람 승인을 거쳐야 합니다'],
] as const

/** 요청이 대상 하나에 묶이기까지. 가운데부터는 요청문으로 바꿀 수 없는 구간이다. */
const BINDING = ['관리 화면이 대상을 고름', '요청에 좌표로 실림', '서버가 Job 에 고정', '그 관리의 Handler 하나만 사용'] as const

/** `대상:동작` → 켜짐. 목록은 서버가 주고 여기에는 선택만 담는다. */
type Draft = Record<string, boolean>

function draftOf(view: NaturalCmsGuardrailView): Draft {
  const draft: Draft = {}
  for (const resource of view.resources) {
    for (const operation of resource.operations) {
      draft[`${resource.resourceKey}:${operation.name}`] = operation.enabled
    }
  }
  return draft
}

type Change = { who: string; said: string }

/** 동작 이름에 붙는 조사. 삭제만 받침이 없다. */
function withParticle(names: string[]): string {
  const last = names[names.length - 1]
  return names.join(' · ') + (last === '삭제' ? '를' : '을')
}

/**
 * 저장하면 무엇이 바뀌는지.
 *
 * 관리 하나가 한 줄이다. 동작마다 한 줄씩 쌓으면 같은 이름이 세 번 나온다.
 */
function changesOf(view: NaturalCmsGuardrailView, stored: Draft, draft: Draft): Change[] {
  const changes: Change[] = []
  for (const resource of view.resources) {
    const turnedOn: string[] = []
    const turnedOff: string[] = []
    for (const operation of resource.operations) {
      const key = `${resource.resourceKey}:${operation.name}`
      if (draft[key] === stored[key]) continue
      ;(draft[key] ? turnedOn : turnedOff).push(operationLabel(operation.name))
    }
    if (turnedOn.length === 0 && turnedOff.length === 0) continue
    const said = turnedOn.length > 0 && turnedOff.length > 0
      ? `${withParticle(turnedOn)} 켜고 ${withParticle(turnedOff)} 끕니다`
      : turnedOn.length > 0
        ? `${withParticle(turnedOn)} 켭니다`
        : `${withParticle(turnedOff)} 끕니다`
    changes.push({ who: RESOURCE_LABELS[resource.resourceKey], said })
  }
  return changes
}

export default function NaturalCmsGuardrailPanel({ api }: { api: NaturalCmsGuardrailApi }) {
  const [view, setView] = useState<NaturalCmsGuardrailView | null>(null)
  const [stored, setStored] = useState<Draft>({})
  const [draft, setDraft] = useState<Draft>({})
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  /* Reset on every run: React mounts, unmounts and remounts in development, and a flag that is
   * only ever set true would discard every later response. */
  const cancelled = useRef(false)
  const started = useRef(false)

  const load = useCallback(async () => {
    try {
      const current = await api.guardrail()
      if (cancelled.current) return
      setView(current)
      setStored(draftOf(current))
      setDraft(draftOf(current))
    }
    catch (error) {
      if (!cancelled.current) setFailure(describeFailure(error))
    }
  }, [api])

  useEffect(() => {
    cancelled.current = false
    if (!started.current) {
      started.current = true
      void load()
    }
    return () => { cancelled.current = true }
  }, [load])

  const changes = view === null ? [] : changesOf(view, stored, draft)

  function toggle(resourceKey: NaturalCmsGuardrailResourceKey, operation: string) {
    setSaved(false)
    const key = `${resourceKey}:${operation}`
    setDraft((current) => ({ ...current, [key]: !current[key] }))
  }

  async function save() {
    if (!view) return
    setSaving(true)
    setFailure(null)
    try {
      // 목록의 모든 동작을 보낸다. 켠 것만 보내면 나머지가 "선택된 적 없음"인지
      // "꺼짐"인지 서버가 구분할 수 없다.
      const operations = view.resources.flatMap((resource) =>
        resource.operations.map((operation) => ({
          resourceKey: resource.resourceKey,
          operation: operation.name,
          enabled: draft[`${resource.resourceKey}:${operation.name}`] === true,
        })))
      const next = await api.saveGuardrail({ operations })
      if (cancelled.current) return
      setView(next)
      setStored(draftOf(next))
      setDraft(draftOf(next))
      setConfirming(false)
      setSaved(true)
    }
    catch (error) {
      if (!cancelled.current) setFailure(describeFailure(error))
    }
    finally {
      if (!cancelled.current) setSaving(false)
    }
  }

  const state = view === null ? [] : view.resources.map((resource) => ({
    label: RESOURCE_LABELS[resource.resourceKey],
    on: resource.operations
      .filter((operation) => draft[`${resource.resourceKey}:${operation.name}`] === true)
      .map((operation) => operation.name),
  }))

  /** 동작이 하나도 없는 대상. 어시스턴트 버튼은 그대로 떠 있으므로 조용히 멈춘 것을 알린다. */
  const closed = state.filter((resource) => resource.on.length === 0)
  /**
   * 삭제만 남은 대상.
   *
   * 만들지도 고치지도 못하면서 지우기만 한다. 「AI 에게 너무 많이 맡기지 말자」며 등록·수정을
   * 끄다 보면 남는 것이 삭제라 실수로 만들어지기 쉽다. 이 탭에서 경고를 쓸 자격이 있는 것은
   * 이 하나뿐이다 — 나머지는 관리자가 알고 끈 것이다.
   */
  const deleteOnly = state.filter(
    (resource) => resource.on.length === 1 && resource.on[0] === 'DELETE')

  return <>
    {failure && <div className="mb-[0.875rem]">
      <Callout tone="warn" icon="triangle-alert">{failure}</Callout>
    </div>}

    {saved && <div className="mb-[0.875rem]">
      <Callout tone="ok" icon="check">저장했습니다. 다음 요청부터 이 가드레일이 적용됩니다.</Callout>
    </div>}

    {deleteOnly.length > 0 && <div className="mb-[0.875rem]">
      <Callout tone="warn" icon="triangle-alert">
        <b>{deleteOnly.map((resource) => resource.label).join(' · ')} 는 삭제만 켜져 있습니다.</b>
        {' '}AI 가 만들거나 고치지는 못하고 지우기만 합니다.
      </Callout>
    </div>}

    {/*
      * 닫힌 관리는 경고가 아니라 안내다. 관리자가 알고 끈 것일 수 있고, 이 탭에는 「뚫려 있다」는
      * 상태가 없다. Callout 은 경고(노랑)와 성공(초록) 둘뿐이라 초록을 쓰면 잘 됐다는 뜻이 된다.
      * 공용 primitives 를 건드리지 않고 중립 색으로 그린다.
      */}
    {closed.length > 0 && <div className="mb-[0.875rem] flex items-start gap-[0.5625rem] rounded-[0.3125rem] border border-line bg-sub p-[0.6875rem] text-[0.71875rem] leading-[1.6] text-body">
      <Icon name="lock" size={15} className="mt-[0.0625rem] text-muted-2" />
      <span>
        {closed.length === state.length
          ? <><b className="font-semibold text-ink">자연어 CMS 어시스턴트가 할 수 있는 일이 없습니다.</b>{' '}
            네 관리의 동작이 모두 꺼져 있어 어떤 요청도 거절됩니다.</>
          : <><b className="font-semibold text-ink">{closed.map((resource) => resource.label).join(' · ')} 는 자연어 CMS 를 쓸 수 없습니다.</b>
            {' '}동작이 모두 꺼져 있어 그 화면의 요청은 거절됩니다.</>}
      </span>
    </div>}

    <section className={panel}>
      <PanelTitle title="요청 하나는 관리 하나에 묶입니다" sub="모든 관리에 공통 · 설정으로 풀 수 없습니다" />
      <div className="px-4 pb-4 pt-[0.375rem]">
        <div className="flex flex-wrap items-center gap-[0.375rem]">
          {BINDING.map((step, index) => <span key={step} className="flex items-center gap-[0.375rem]">
            {index > 0 && <span aria-hidden="true" className="font-mono text-[0.625rem] text-muted-3">→</span>}
            <span className={`rounded-[0.1875rem] border px-[0.4375rem] py-[0.0625rem] text-[0.6875rem] ${
              index === 0
                ? 'border-line bg-panel text-body'
                : 'border-ok-dot/45 bg-ok-bg text-ok-fg'}`}>{step}</span>
          </span>)}
        </div>
        <p className="mb-[0.5rem] mt-[0.625rem] text-[0.6875rem] leading-5 text-muted-3">
          AI 가 쓰는 명령서에는 «무엇을»에 해당하는 칸이 없습니다. 대상은 사람이 목록에서 고른 것이고
          AI 는 «어떻게 바꿀지»만 씁니다. 그래서 한 관리의 요청이 다른 관리에 닿을 경로가 없습니다.
        </p>
        <ul>
          {OUTSIDE.map(([what, why]) => <li key={what} className="flex gap-2 border-b border-row-line py-[0.375rem] last:border-b-0">
            <span aria-hidden="true" className="font-mono text-[0.6875rem] text-muted-3">✕</span>
            <span className="text-[0.71875rem] leading-5 text-body"><b className="font-semibold text-ink">{what}</b> — {why}</span>
          </li>)}
        </ul>
      </div>
    </section>

    <p className="mt-[0.875rem] font-mono text-[0.625rem] tracking-[0.04em] text-muted-3">
      관리별 가드레일 — 체크한 동작만 AI 가 실행할 수 있습니다
    </p>

    {view === null
      ? <p className={`${panel} mt-[0.375rem] px-4 py-[0.875rem] text-[0.71875rem] text-muted-2`}>불러오는 중입니다…</p>
      /* 같은 모양의 블록이 넷이라 이름을 준다. 이름이 없으면 읽어 주는 쪽에서 「구역」 넷이
       * 구분 없이 이어지고, 대상 이름은 제외 목록에도 나와 본문만으로는 갈리지 않는다. */
      : view.resources.map((resource) => <section
        key={resource.resourceKey}
        className={`${panel} mt-[0.375rem]`}
        aria-label={`${RESOURCE_LABELS[resource.resourceKey]} 가드레일`}
      >
        <div className="border-b border-row-line px-4 py-[0.5625rem]">
          <div className="flex items-baseline gap-2">
            <b className="text-[0.84375rem] font-semibold text-ink">{RESOURCE_LABELS[resource.resourceKey]}</b>
            <span className="rounded-[0.1875rem] border border-line px-[0.3125rem] font-mono text-[0.625rem] tracking-[0.06em] text-primary">
              {resource.resourceKey}
            </span>
          </div>
          {/*
            * 이 대상의 가드레일이 어디에 있는지. 셋이 관리마다 다르다 — 패키지는 넷이 같아
            * 클래스까지 내려가야 갈린다. 「화면」은 사람이 같은 자료를 직접 다루는 곳이고
            * 그쪽에는 이 설정이 걸리지 않으므로 라벨 없이 주소만 두면 반대로 읽힌다.
            */}
          <div className="mt-[0.375rem] flex flex-wrap gap-x-[0.875rem] gap-y-[0.125rem] font-mono text-[0.625rem]">
            <span className="text-muted-3">경계 <span className="text-body">cms.assistant · {resource.lock.handler}</span></span>
            <span className="text-muted-3">데이터 <span className="text-body">{resource.lock.dataTable}</span></span>
            <span className="text-muted-3">화면 <span className="text-body">{RESOURCE_SCREENS[resource.resourceKey]}</span></span>
          </div>
        </div>
        <div className="grid lg:grid-cols-3">
          <div className="border-b border-row-line px-4 pb-[0.6875rem] pt-[0.5rem] lg:border-b-0 lg:border-r">
            <p className="mb-[0.4375rem] font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-3">AI 에게 여는 동작</p>
            <div className="flex flex-wrap gap-x-[0.875rem] gap-y-[0.3125rem]">
              {[...resource.operations]
                .sort((left, right) => operationRank(left.name) - operationRank(right.name))
                .map((operation) => {
                  const key = `${resource.resourceKey}:${operation.name}`
                  return <label key={operation.name} className="inline-flex cursor-pointer items-center gap-[0.3125rem] text-[0.71875rem] text-body" title={operation.name}>
                    <input
                      type="checkbox"
                      checked={draft[key] === true}
                      onChange={() => toggle(resource.resourceKey, operation.name)}
                      disabled={saving}
                    />
                    {operationLabel(operation.name)}
                  </label>
                })}
            </div>
            {/*
              * 필드는 정하는 단위가 아니라 이 대상이 무엇을 다루는지 알려 주는 표시다.
              * 그래서 한글로 적는다 — `parentId`·`targetType` 은 관리자에게 그것을 말해주지
              * 못한다. 명령서의 키는 title 에 남겨 필요할 때만 보이게 한다. 고정폭은 쓰지
              * 않는다. 한글에 씌우면 자간이 어그러진다.
              */}
            <p className="mb-[0.1875rem] mt-[0.625rem] font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-3">쓸 수 있는 필드</p>
            <p className="text-[0.6875rem] leading-5 text-muted-2">
              {resource.fields.map((name, index) => <Fragment key={name}>
                {index > 0 && <span aria-hidden="true"> · </span>}
                <span title={name}>{fieldLabel(resource.resourceKey, name)}</span>
              </Fragment>)}
            </p>
          </div>

          {/*
            * 설정으로 열 수 없는 칸이라 체크박스와 섞지 않는다. 근거가 Handler 고정이므로
            * 「할 수 없다」고 단정해도 과장이 아니다. 판정 지시문이었다면 모델이 무시할 수 있어
            * 이렇게 말하지 못한다.
            */}
          <div className="border-b border-row-line px-4 pb-[0.6875rem] pt-[0.5rem] lg:border-b-0 lg:border-r">
            <p className="mb-[0.375rem] font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-3">넘어갈 수 없는 곳</p>
            <ul
              className="flex flex-col gap-[0.125rem]"
              aria-label={`${RESOURCE_LABELS[resource.resourceKey]}에서 넘어갈 수 없는 곳`}
            >
              {resource.excludes.map((key) => <li key={key} className="flex items-center gap-[0.3125rem] text-[0.6875rem] text-muted-2">
                <span aria-hidden="true" className="font-mono text-[0.625rem] text-muted-3">✕</span>
                {resourceLabel(key)}
              </li>)}
            </ul>
          </div>

          <div className="px-4 pb-[0.6875rem] pt-[0.5rem]">
            <p className="mb-[0.375rem] font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-3">이 관리만의 잠금</p>
            <ul
              className="flex flex-col gap-[0.25rem]"
              aria-label={`${RESOURCE_LABELS[resource.resourceKey]}만의 잠금`}
            >
              {resource.lock.rules.map((rule) => <li key={rule.key} className="flex gap-[0.375rem] text-[0.6875rem] leading-5 text-muted-2">
                <span aria-hidden="true" className="text-[0.5625rem] leading-[1.8]">🔒</span>
                <span>{lockLabel(rule.key, rule.value).map((part, index) => (
                  typeof part === 'string'
                    ? <Fragment key={index}>{part}</Fragment>
                    : <b key={index} className="font-semibold text-ink">{part.strong}</b>
                ))}</span>
              </li>)}
            </ul>
          </div>
        </div>
      </section>)}

    <section className={`${panel} mt-[0.875rem]`}>
      <PanelTitle title="부가 규칙" sub="관리와 무관하게 모든 명령에 적용됩니다" />
      <div className="px-4 pb-4 pt-[0.375rem]">
        <ul className="flex flex-col gap-[0.3125rem]">
          {/* 메뉴 삭제 연쇄는 메뉴 카드의 잠금으로 옮겼다. 그 대상에만 걸리는 것이라 여기가 아니다. */}
          <li className="flex items-center gap-2 text-[0.71875rem] text-muted-2">AI 가 바꿀 수 없는 필드<span className="ml-auto font-mono text-[0.625rem] text-body">id · updatedAt · active</span></li>
          {/* Profile 스냅샷의 `discard --retry--> analyze` 간선 한도다. 되돌아가는 횟수를 세므로
            * analyze 를 밟는 횟수(최초 1 + 2)와 다르다. 관리자에게는 다시 만드는 횟수가 맞다. */}
          <li className="flex items-center gap-2 text-[0.71875rem] text-muted-2">반려 후 재시도<span className="ml-auto font-mono text-[0.625rem] text-body">2번까지 다시 만듭니다</span></li>
        </ul>

        <p className="mt-[0.5rem] text-[0.6875rem] leading-5 text-muted-2">
          ☑ 미리보기 필수 · ☑ 사람 승인 필수 — 항상 켜져 있으며 끌 수 없습니다.
          승인 전에는 DB 에 아무것도 반영되지 않습니다.
        </p>
      </div>
    </section>

    <div className="mt-[0.875rem] flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={primaryButton}
        disabled={view === null || changes.length === 0}
        onClick={() => setConfirming(true)}
      >저장</button>
      {changes.length > 0 && <span className="text-[0.6875rem] text-muted-2">저장하지 않은 변경이 있습니다.</span>}
      {view !== null && !view.configured && <span className="text-[0.6875rem] text-muted-2">
        아직 저장한 적이 없어 지금은 코드 기본값을 따릅니다.
      </span>}
    </div>

    {/*
      * 저장을 누르면 바뀌는 것을 먼저 보여주고 한 번 더 받는다. 체크를 열둘 만지고 나면
      * 무엇을 바꿨는지 기억나지 않는데 「저장하지 않은 변경이 있습니다」만으로는 알 수 없다.
      * 모달이라 뒤 화면이 잠겨, 확인을 띄운 채 체크를 더 만져 목록이 어긋나는 일이 없다.
      */}
    {confirming && <AssistantPreviewModal
      title="이렇게 바뀝니다"
      subtitle="저장하면 다음 요청부터 적용됩니다"
      busy={saving}
      // 페이지에도 「저장」이 있다. 같은 이름이면 어느 쪽이 진짜인지 헷갈린다.
      approveLabel={saving ? '저장하는 중입니다…' : '확인하고 저장'}
      onApprove={() => void save()}
      onClose={() => { if (!saving) setConfirming(false) }}
    >
      <ul className="flex flex-col">
        {changes.map((change) => <li key={change.who} className="flex gap-3 border-b border-row-line py-[0.375rem] text-[0.75rem] text-body last:border-b-0">
          <span className="w-[4rem] shrink-0 font-semibold text-ink">{change.who}</span>
          <span>{change.said}</span>
        </li>)}
      </ul>
    </AssistantPreviewModal>}
  </>
}

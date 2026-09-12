import { useCallback, useEffect, useRef, useState } from 'react'
import { describeFailure } from '../../../shared/api/error'
import { Callout, PanelTitle, panel, primaryButton } from '../../../shared/ui/primitives'
import type {
  NaturalCmsGuardrailApi, NaturalCmsGuardrailResourceKey, NaturalCmsGuardrailView,
} from './guardrailApi'
import { RESOURCE_LABELS, RESOURCE_SCREENS, fieldLabel, isRequiredField } from './guardrailLabels'

/**
 * 자연어 CMS 울타리 설정.
 *
 * LLM Ops 탭과 성격이 반대라는 것이 이 화면의 전제다. 저쪽은 허용 폴더가 비어 있으면
 * 파이프라인이 "제한 없음"으로 읽어 저장소가 실제로 뚫려 있다. 이쪽은 미리보기와 사람
 * 승인이 모든 반영 앞에 서 있어 활짝 열린 상태가 없다. 그래서 경고가 아니라 안내를 쓰고,
 * 관리자가 놓치는 것은 뚫린 설정이 아니라 기능이 조용히 멈춘 설정이다.
 *
 * 대상과 필드 목록은 서버가 Handler에서 읽어 내려준다. 화면이 갖고 있지 않으므로 서버가
 * 필드를 늘리면 저절로 나타나고, 없앤 필드가 옛 목록에서 계속 제공되지 않는다.
 */

/** 구조가 보장해 설정으로 열 수 없는 것들. 관리자가 실제로 알고 싶어 하는 목록이다. */
const OUTSIDE = [
  ['코드 작성', '파일을 읽거나 쓰는 도구가 없습니다'],
  ['AI 운영 설정', '가드레일·AI 프로필·Job 은 CMS 대상이 아닙니다'],
  ['로그인 · 회원', '회원 관리는 자연어 CMS 대상이 아닙니다'],
  ['DB 구조 · 서버 설정', '바꿀 경로가 없습니다'],
] as const

const INSIDE = [
  ['다른 화면의 대상', '요청 하나가 화면에서 연 대상 하나에 묶입니다'],
  ['계약 밖 입력값', '정해진 필드와 값 형태만 받습니다. 삭제 명령은 필드를 실을 수 없습니다'],
  ['비어 있지 않은 게시판 삭제', '사람은 가능하지만 AI 는 막혀 있습니다'],
  ['다른 게시판의 게시물', '소속 게시판을 서버가 확인합니다'],
  ['게시물 본문 서식', '제목 · 강조 · 목록 셋만'],
  ['컨텐츠 본문 서식', '지정된 이미지 · 링크 · 색상만'],
  ['승인 없는 반영', '미리보기와 사람 승인을 거쳐야 합니다'],
] as const

type Draft = {
  allowDelete: boolean
  /** `대상:필드` → 켜짐. 목록은 서버가 주고 여기에는 선택만 담는다. */
  fields: Record<string, boolean>
}

function draftOf(view: NaturalCmsGuardrailView): Draft {
  const fields: Record<string, boolean> = {}
  for (const resource of view.resources) {
    for (const field of resource.fields) {
      fields[`${resource.resourceKey}:${field.name}`] = field.enabled
    }
  }
  return { allowDelete: view.allowDelete, fields }
}

function same(left: Draft, right: Draft): boolean {
  if (left.allowDelete !== right.allowDelete) return false
  const keys = new Set([...Object.keys(left.fields), ...Object.keys(right.fields)])
  for (const key of keys) {
    if (left.fields[key] !== right.fields[key]) return false
  }
  return true
}

export default function NaturalCmsGuardrailPanel({ api }: { api: NaturalCmsGuardrailApi }) {
  const [view, setView] = useState<NaturalCmsGuardrailView | null>(null)
  const [stored, setStored] = useState<Draft | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
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

  const changed = stored !== null && draft !== null && !same(stored, draft)

  function toggleField(resourceKey: NaturalCmsGuardrailResourceKey, name: string) {
    if (!draft) return
    setSaved(false)
    const key = `${resourceKey}:${name}`
    setDraft({ ...draft, fields: { ...draft.fields, [key]: !draft.fields[key] } })
  }

  async function save() {
    if (!view || !draft) return
    setSaving(true)
    setFailure(null)
    try {
      // 목록의 모든 필드를 보낸다. 켠 것만 보내면 나머지가 "선택된 적 없음"인지
      // "꺼짐"인지 서버가 구분할 수 없다.
      const fields = view.resources.flatMap((resource) => resource.fields.map((field) => ({
        resourceKey: resource.resourceKey,
        fieldName: field.name,
        enabled: draft.fields[`${resource.resourceKey}:${field.name}`] === true,
      })))
      const next = await api.saveGuardrail({ allowDelete: draft.allowDelete, fields })
      if (cancelled.current) return
      setView(next)
      setStored(draftOf(next))
      setDraft(draftOf(next))
      setSaved(true)
    }
    catch (error) {
      if (!cancelled.current) setFailure(describeFailure(error))
    }
    finally {
      if (!cancelled.current) setSaving(false)
    }
  }

  /** 닫힌 필수 필드. 등록이 막힌다는 사실은 체크박스가 말해주지 않으므로 따로 알린다. */
  const blocked = view === null || draft === null ? [] : view.resources
    .map((resource) => ({
      label: RESOURCE_LABELS[resource.resourceKey],
      closed: resource.fields
        .filter((field) => isRequiredField(resource.resourceKey, field.name)
          && draft.fields[`${resource.resourceKey}:${field.name}`] !== true)
        .map((field) => fieldLabel(resource.resourceKey, field.name)),
    }))
    .filter((entry) => entry.closed.length > 0)

  return <>
    {failure && <div className="mb-[0.875rem]">
      <Callout tone="warn" icon="triangle-alert">{failure}</Callout>
    </div>}

    {saved && <div className="mb-[0.875rem]">
      {/* 화면 이름이 「가드레일 설정」이므로 안내도 같은 말을 쓴다. LLM Ops 탭은 아직
        * 「울타리」라고 말하는데 그쪽은 다른 담당 영역이라 여기서 고치지 않는다. */}
      <Callout tone="ok" icon="check">저장했습니다. 다음 요청부터 이 가드레일이 적용됩니다.</Callout>
    </div>}

    {blocked.length > 0 && <div className="mb-[0.875rem]">
      <Callout tone="warn" icon="triangle-alert">
        {blocked.map((entry) => `${entry.label} 등록이 막혀 있습니다. 필수 항목 «${entry.closed.join(' · ')}» 이(가) 닫혀 있습니다.`).join(' ')}
        {' '}수정은 그대로 가능합니다.
      </Callout>
    </div>}

    <section className={panel}>
      <PanelTitle title="AI 가 닿을 수 없는 곳" sub="구조가 보장합니다 · 설정으로 열 수 없습니다" />
      <div className="px-4 pb-4 pt-[0.375rem]">
        <p className="mb-[0.375rem] font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-3">다른 영역</p>
        <ul>
          {OUTSIDE.map(([what, why]) => <li key={what} className="flex gap-2 border-b border-row-line py-[0.375rem] last:border-b-0">
            <span aria-hidden="true" className="font-mono text-[0.6875rem] text-muted-3">✕</span>
            <span className="text-[0.71875rem] leading-5 text-body"><b className="font-semibold text-ink">{what}</b> — {why}</span>
          </li>)}
        </ul>
        <p className="mb-[0.375rem] mt-[0.625rem] font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-3">CMS 안에서</p>
        <ul>
          {INSIDE.map(([what, why]) => <li key={what} className="flex gap-2 border-b border-row-line py-[0.375rem] last:border-b-0">
            <span aria-hidden="true" className="font-mono text-[0.6875rem] text-muted-3">✕</span>
            <span className="text-[0.71875rem] leading-5 text-body"><b className="font-semibold text-ink">{what}</b> — {why}</span>
          </li>)}
        </ul>
      </div>
    </section>

    {/*
      * 필드 선택과 부가 규칙을 나란히 둔다. 세로로 쌓으면 부가 규칙을 보려고 필드 목록을
      * 전부 지나쳐야 하는데, 부가 규칙은 짧고 대부분 읽기 전용이라 그 스크롤이 아깝다.
      * 좁은 화면에서는 한 칼럼으로 돌아간다.
      */}
    <div className="mt-[0.875rem] grid items-start gap-[0.875rem] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
    <section className={panel}>
      <PanelTitle title="대상별 허용 필드" sub="체크한 필드만 AI 가 값을 실을 수 있습니다" />
      <div className="px-4 pb-4 pt-[0.375rem]">
        {view === null
          ? <p className="text-[0.71875rem] text-muted-2">불러오는 중입니다…</p>
          : <>
            <p className="mb-[0.375rem] text-[0.6875rem] text-muted-3">
              서버가 현재 여는 대상과 필드를 그대로 읽어 온 목록입니다.
              «필수» 를 닫으면 그 대상의 등록이 막히고 수정만 남습니다.
            </p>
            {view.resources.map((resource) => {
              // 필수를 앞에 세운다. 서버 순서는 Handler가 필드를 선언한 순서일 뿐이라
              // 관리자에게 아무 뜻이 없고, 닫으면 등록이 막히는 필드가 먼저 눈에 띄어야 한다.
              const ordered = [...resource.fields].sort((left, right) =>
                Number(isRequiredField(resource.resourceKey, right.name))
                - Number(isRequiredField(resource.resourceKey, left.name)))
              // 접지 않는다. 이 화면은 지금 무엇이 열려 있는지 보러 오는 곳이라
              // 접힌 머리글이 갯수만 말하면 정작 확인하러 온 것을 감춘다. 펼쳐 두면
              // 체크 상태가 그대로 보이므로 갯수를 따로 셀 필요도 없다.
              return <div key={resource.resourceKey} className="border-b border-row-line py-[0.4375rem] last:border-b-0">
                <div className="flex items-center gap-2 text-[0.75rem] text-ink">
                  <span className="font-semibold">{RESOURCE_LABELS[resource.resourceKey]}</span>
                  <span className="ml-auto font-mono text-[0.625rem] text-muted-3">{RESOURCE_SCREENS[resource.resourceKey]}</span>
                </div>
                <div className="flex flex-wrap gap-x-[0.875rem] gap-y-[0.3125rem] pl-[0.875rem] pt-[0.375rem]">
                  {ordered.map((field) => {
                    const key = `${resource.resourceKey}:${field.name}`
                    return <label key={field.name} className="inline-flex cursor-pointer items-center gap-[0.3125rem] text-[0.6875rem] text-body" title={field.name}>
                      <input
                        type="checkbox"
                        checked={draft?.fields[key] === true}
                        onChange={() => toggleField(resource.resourceKey, field.name)}
                        disabled={saving}
                      />
                      {fieldLabel(resource.resourceKey, field.name)}
                      {isRequiredField(resource.resourceKey, field.name)
                        && <span className="rounded-[0.1875rem] border border-[#e9d197] bg-[#fdf6e5] px-[0.25rem] font-mono text-[0.5625rem] text-[#8a6420]">필수</span>}
                    </label>
                  })}
                </div>
              </div>
            })}
          </>}
      </div>
    </section>

    <section className={panel}>
      <PanelTitle title="부가 규칙" sub="대상과 무관하게 모든 명령에 적용됩니다" />
      <div className="px-4 pb-4 pt-[0.375rem]">
        <label className="flex cursor-pointer items-center gap-[0.5625rem]">
          <input
            type="checkbox"
            checked={draft?.allowDelete === true}
            onChange={() => { if (draft) { setSaved(false); setDraft({ ...draft, allowDelete: !draft.allowDelete }) } }}
            disabled={saving || draft === null}
          />
          <span className="text-[0.78125rem] text-body">삭제 허용</span>
          <span className="text-[0.6875rem] text-muted-2">꺼져 있으면 AI 는 만들고 고치기만 합니다</span>
        </label>

        <div className="my-[0.5rem] h-px bg-row-line" />

        <ul className="flex flex-col gap-[0.3125rem]">
          <li className="flex items-center gap-2 text-[0.71875rem] text-muted-2">메뉴 삭제 연쇄<span className="ml-auto font-mono text-[0.625rem] text-body">한 번에 10개까지</span></li>
          <li className="flex items-center gap-2 text-[0.71875rem] text-muted-2">AI 가 바꿀 수 없는 필드<span className="ml-auto font-mono text-[0.625rem] text-body">id · updatedAt · active</span></li>
          {/* 「실행할 수 있는 도구 6종」은 뺐다. 나머지 줄은 AI 가 내 데이터에 무엇을 할 수 있는지에
            * 답하지만 도구 갯수는 내부 구현 수라 관리자가 판단에 쓸 수 없다. 이름을 펼치면
            * `resolve_cms_target` 같은 개발자 언어가 관리자 앞에 놓여 더 나쁘다. 정해진 도구만
            * 쓴다는 사실은 위 「코드 작성 — 파일을 읽거나 쓰는 도구가 없습니다」가 이미 말한다. */}
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
    </div>

    <div className="mt-[0.875rem] flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={primaryButton}
        disabled={saving || view === null || !changed}
        onClick={() => void save()}
      >{saving ? '저장하는 중입니다…' : '저장'}</button>
      {changed && <span className="text-[0.6875rem] text-muted-2">저장하지 않은 변경이 있습니다.</span>}
      {view !== null && !view.configured && <span className="text-[0.6875rem] text-muted-2">
        아직 저장한 적이 없어 지금은 코드 기본값을 따릅니다.
      </span>}
    </div>
  </>
}

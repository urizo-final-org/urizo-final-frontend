import { useEffect, useRef, useState } from 'react'
import { describeFailure } from '../../shared/api/error'
import { Callout, PanelTitle, panel, tableButton } from '../../shared/ui/primitives'
import { Icon } from '../../shared/ui/icons'
import type { KnowledgeAdminApi } from './admin-api'
import type { BuildEvaluation, KnowledgeVersion, TourDiagnosis as Diagnosis } from './admin-types'

/**
 * 품질 진단 에이전트의 화면(AI02-027).
 *
 * <p>점수가 낮다는 것은 버전 표가 이미 말합니다. 이 패널은 <b>왜 낮은지</b>를 말합니다.
 *
 * <p><b>조사가 끝나면 단계는 한 줄로 접힙니다.</b> 조사 중에는 단계가 화면의 주인공이지만
 * (무언가 일어나고 있다는 유일한 신호이므로), 끝난 뒤에도 단계마다 긴 설명을 펼쳐 두면
 * 정작 읽어야 할 진단이 스크롤 아래로 밀립니다. 끝난 조사는 "무엇을 했는지"만 남기고
 * 이유는 「자세히」 뒤로 보냅니다.
 *
 * <p><b>단계는 화면이 풀어 놓습니다.</b> 서버는 조사를 다 마친 뒤 단계와 진단을 한 번에
 * 돌려줍니다(30초 안팎). 그대로 그리면 30초 정적 뒤에 완성된 화면이 튀어나와, 조사가
 * 있었다는 사실이 보이지 않습니다. 실시간 스트리밍이 아니라 재생이고, 내용은 서버가
 * 보낸 그대로입니다.
 */
export function TourDiagnosisPanel({ api, knowledgeBaseId, version, onClose }: {
  api: KnowledgeAdminApi
  knowledgeBaseId: string
  version: KnowledgeVersion
  onClose: () => void
}) {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null)
  const [failure, setFailure] = useState<unknown>(null)
  const [elapsed, setElapsed] = useState(0)
  const [revealed, setRevealed] = useState(0)

  // 버전을 바꿔 다시 열면 이전 결과가 남아 있으면 안 됩니다 — 다른 버전의 진단을 그 버전의
  // 것으로 읽게 됩니다. 요청 하나가 화면 하나를 책임지게 두고, 늦게 온 응답은 버립니다.
  const requested = useRef(0)
  useEffect(() => {
    const ticket = ++requested.current
    setDiagnosis(null); setFailure(null); setElapsed(0); setRevealed(0)
    api.diagnoseTourVersion(knowledgeBaseId, version.knowledgeVersionId)
      .then((result) => { if (ticket === requested.current) setDiagnosis(result) })
      .catch((error) => { if (ticket === requested.current) setFailure(error) })
    const tick = setInterval(() => setElapsed((seconds) => seconds + 1), 1000)
    return () => clearInterval(tick)
  }, [api, knowledgeBaseId, version.knowledgeVersionId])

  // 단계 + 진단 한 칸. 마지막 칸까지 가면 멈춥니다.
  const total = diagnosis ? diagnosis.steps.length + 1 : 0
  useEffect(() => {
    if (total === 0 || revealed >= total) return
    const next = setTimeout(() => setRevealed((shown) => shown + 1), revealed === 0 ? 250 : 700)
    return () => clearTimeout(next)
  }, [total, revealed])

  const done = diagnosis != null && revealed >= total

  return <section className={panel}>
    <PanelTitle
      title="품질 진단"
      sub={`v${version.versionNumber} · ${done ? '에이전트가 원인을 조사했습니다' : '에이전트가 원인을 조사합니다'}`}
    >
      <button className={tableButton} onClick={onClose}>닫기</button>
    </PanelTitle>
    <div className="flex flex-col gap-3 p-4">
      {failure != null
        ? <Callout tone="warn" icon="triangle-alert">{describeFailure(failure)}</Callout>
        : <>
          <Steps
            steps={(diagnosis?.steps ?? []).slice(0, revealed)}
            done={done}
            waiting={diagnosis == null ? `에이전트가 조사하는 중입니다… ${elapsed}초 (보통 30초 안팎)`
              : revealed < total ? '결과를 정리하는 중입니다…' : null}
          />
          {done && <Verdict
            verdict={diagnosis.verdict}
            steps={diagnosis.steps.length}
            stopReason={diagnosis.stopReason}
            evaluation={version.evaluation}
          />}
        </>}
    </div>
  </section>
}

/**
 * 조사 단계. 진행 중에는 한 줄씩 쌓이고, 끝나면 한 행으로 접힙니다 —
 * 어떤 조사를 했는지는 남기고 세로 공간은 돌려줍니다.
 */
function Steps({ steps, done, waiting }: {
  steps: Diagnosis['steps']
  done: boolean
  waiting: string | null
}) {
  const [open, setOpen] = useState(false)
  const detailed = !done || open

  return <div className="flex flex-col gap-2">
    {done && <div className="flex items-center gap-2 text-[0.71875rem] text-muted-2">
      <span className="font-semibold text-muted-2">조사 {steps.length}단계</span>
      <button
        className="text-[0.6875rem] text-muted-2 underline underline-offset-2 hover:text-ink"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >{open ? '간단히' : '자세히'}</button>
    </div>}
    <ol className={detailed ? 'flex flex-col gap-1.5' : 'flex flex-wrap gap-1.5'}>
      {steps.map((step) => <li
        key={step.order}
        className={detailed
          ? 'flex items-start gap-2 rounded-[0.3125rem] border border-line-soft bg-sub px-[0.625rem] py-[0.4375rem]'
          : 'flex items-center gap-1.5 rounded-[0.3125rem] border border-ok-fg/25 bg-ok-bg px-2 py-1 text-[0.6875rem] text-ok-fg'}
      >
        <Icon
          name={step.failed ? 'triangle-alert' : 'check'}
          size={12}
          className={detailed ? 'mt-[0.1875rem] shrink-0 text-ok-fg' : 'shrink-0'}
        />
        {detailed
          ? <span className="min-w-0">
            <b className="block break-keep text-[0.75rem] font-semibold text-ink">{TOOL_LABEL[step.tool] ?? step.tool}</b>
            <span className="mt-[0.0625rem] block max-w-[46rem] break-keep text-[0.6875rem] leading-[1.7] text-muted-2">{step.reason}</span>
          </span>
          : <span className="whitespace-nowrap">{TOOL_LABEL[step.tool] ?? step.tool}</span>}
      </li>)}
      {waiting && <li className="flex items-center gap-2 px-[0.625rem] py-[0.4375rem] text-[0.71875rem] text-muted-2">
        <Icon name="loader-circle" size={13} className="animate-spin" />
        {waiting}
      </li>}
    </ol>
  </div>
}

/** 도구 이름은 코드의 말입니다. 화면은 그 도구가 한 일로 짧게 부릅니다. */
const TOOL_LABEL: Record<string, string> = {
  version_overview: '버전 정보 확인',
  score_questions: '평가 결과 확인',
  inspect_documents: '실패 문서 확인',
}

const CONFIDENCE_LABEL: Record<string, string> = { HIGH: '높음', MEDIUM: '보통', LOW: '낮음' }

/**
 * 결론 칸. <b>진단 한 줄이 먼저</b>고, 지표·근거는 그 줄을 뒷받침하러 아래에 섭니다.
 *
 * <p>한국어는 기본 줄바꿈이 글자 단위라 긴 문장이 단어 중간에서 끊깁니다. `break-keep`으로
 * 어절 단위 줄바꿈을 걸고, 줄 길이를 `max-w`로 묶어 눈이 다음 줄을 찾기 쉽게 합니다.
 */
function Verdict({ verdict, steps, stopReason, evaluation }: {
  verdict: Diagnosis['verdict']
  steps: number
  stopReason: string
  evaluation?: BuildEvaluation
}) {
  return <div className="rounded-[0.3125rem] border border-wait-dot/45 bg-wait-bg p-4 text-wait-fg">
    <p className="m-0 text-[0.6875rem] font-semibold uppercase tracking-[.04em] text-muted-2">진단 결과</p>
    <div className="mt-[0.4375rem] flex items-start gap-[0.5625rem]">
      <Icon name="search-check" size={18} className="mt-[0.125rem] shrink-0" />
      <b className="max-w-[44rem] break-keep text-[0.9375rem] font-bold leading-[1.6] text-ink">{verdict.verdict}</b>
    </div>

    {evaluation && <EvaluationDetail evaluation={evaluation} />}

    <dl className="mt-[0.875rem] flex flex-col gap-[0.6875rem] text-[0.71875rem] leading-[1.75]">
      <Field label="근거">
        <ul className="flex list-disc flex-col gap-[0.25rem] pl-4">
          {verdict.evidence.map((line, index) => <li key={index} className="break-keep">{line}</li>)}
        </ul>
      </Field>
      {verdict.reasoning && <Field label="판단 과정">{verdict.reasoning}</Field>}
      {verdict.recommendation && <Field label="권고">{verdict.recommendation}</Field>}
    </dl>

    <p className="m-0 mt-[0.875rem] border-t border-wait-dot/30 pt-[0.5625rem] text-[0.6875rem] text-muted-2">
      확신도 {CONFIDENCE_LABEL[verdict.confidence] ?? verdict.confidence}
      {' · '}조사 {steps}단계
      {' · '}{stopReason === 'MODEL_CONCLUDED' ? '에이전트가 스스로 마쳤습니다' : '조사 상한에서 멈췄습니다'}
    </p>
  </div>
}

/**
 * 진단 바로 아래의 평가 결과. <b>기본은 한 줄</b>입니다 — Hit@5·Hit@10·MRR@10은 이 화면을
 * 보는 사람이 늘 필요한 값이 아니고, 늘 펼쳐 두면 정작 읽어야 할 진단과 경쟁합니다.
 *
 * <p>값은 버전 목록이 이미 받아 둔 것을 그대로 씁니다 — 여기서 다시 계산하지 않습니다.
 */
function EvaluationDetail({ evaluation }: { evaluation: BuildEvaluation }) {
  const [open, setOpen] = useState(false)
  const golden = evaluation.method === 'GOLDEN_QUESTION'
  const excludedCount = evaluation.excluded?.length ?? 0

  return <div className="mt-[0.875rem] rounded-[0.3125rem] border border-wait-dot/40 px-3 py-[0.5625rem]">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.71875rem]">
      <span className="font-semibold text-muted-2">평가 결과</span>
      <b className="text-[0.8125rem] font-bold tabular-nums text-ink">
        {golden ? '품질 평가' : '색인 검색'} {Math.round(evaluation.hit5 * 100)}%
      </b>
      <button
        className="text-[0.6875rem] underline underline-offset-2 hover:opacity-80"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >{open ? '접기' : '상세보기'}</button>
    </div>
    {open && <dl className="mt-[0.5625rem] grid grid-cols-3 gap-x-3 gap-y-2 border-t border-wait-dot/30 pt-[0.5625rem] text-[0.6875rem] max-[560px]:grid-cols-1">
      <Metric label="Hit@5" value={`${(evaluation.hit5 * 100).toFixed(1)}%`}
        hint="질문의 정답 문서가 검색 상위 5건 안에 든 비율입니다." />
      <Metric label="Hit@10" value={`${(evaluation.hit10 * 100).toFixed(1)}%`}
        hint="같은 기준을 상위 10건까지 넓힌 비율입니다." />
      <Metric label="MRR@10" value={evaluation.mrr10.toFixed(3)}
        hint="정답이 몇 번째로 나왔는지까지 반영한 값입니다. 1에 가까울수록 위쪽에 나옵니다." />
      <dd className="col-span-3 m-0 break-keep opacity-85 max-[560px]:col-span-1">
        {golden
          ? `확정·동결된 골든 질문 세트 v${evaluation.setVersion ?? 1} · 문항 ${evaluation.sampleSize}개로 잰 값입니다. 같은 세트 버전끼리만 비교할 수 있습니다.`
          : `제목으로 검색해 그 문서가 상위에 오는지 잰 값입니다. 표본 ${evaluation.sampleSize}건 · 사용자 질문 기반 시험지가 아닙니다.`}
        {excludedCount > 0 && ` 정답 문서가 없어 채점 전에 제외된 문항이 ${excludedCount}건 있습니다.`}
      </dd>
    </dl>}
  </div>
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="min-w-0" title={hint}>
    <dt className="text-[0.625rem] font-semibold tracking-[.02em] opacity-75">{label}</dt>
    <dd className="m-0 text-[0.8125rem] font-bold tabular-nums text-ink">{value}</dd>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[4.25rem_minmax(0,44rem)] gap-x-3 max-[640px]:grid-cols-1 max-[640px]:gap-y-1">
    <dt className="font-semibold text-muted-2">{label}</dt>
    <dd className="m-0 min-w-0 break-keep">{children}</dd>
  </div>
}

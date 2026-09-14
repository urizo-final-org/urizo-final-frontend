import { useEffect, useRef, useState } from 'react'
import { describeFailure } from '../../shared/api/error'
import { Callout, PanelTitle, panel, tableButton } from '../../shared/ui/primitives'
import { Icon } from '../../shared/ui/icons'
import type { KnowledgeAdminApi } from './admin-api'
import type { KnowledgeVersion, TourDiagnosis as Diagnosis } from './admin-types'

/**
 * 품질 진단 에이전트의 화면(AI02-027).
 *
 * <p>점수가 낮다는 것은 버전 표가 이미 말한다. 이 패널은 <b>왜 낮은지</b>를 말한다 —
 * 에이전트가 어떤 도구를 왜 골랐는지 순서대로 보이고, 그 끝에 원인 한 줄을 놓는다.
 *
 * <p><b>단계는 화면이 풀어 놓는다.</b> 서버는 조사를 다 마친 뒤 단계와 진단을 한 번에
 * 돌려준다(30초 안팎). 그대로 그리면 30초 정적 뒤에 완성된 화면이 튀어나와, 조사가
 * 있었다는 사실이 보이지 않는다. 받은 순서대로 한 칸씩 내보내 사람이 따라 읽게 한다 —
 * 실시간 스트리밍이 아니라 재생이고, 내용은 서버가 보낸 그대로다.
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

  // 버전을 바꿔 다시 열면 이전 결과가 남아 있으면 안 된다 — 다른 버전의 진단을 그 버전의
  // 것으로 읽게 된다. 요청 하나가 화면 하나를 책임지게 두고, 늦게 온 응답은 버린다.
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

  // 단계 + 진단 한 칸. 마지막 칸까지 가면 멈춘다.
  const total = diagnosis ? diagnosis.steps.length + 1 : 0
  useEffect(() => {
    if (total === 0 || revealed >= total) return
    const next = setTimeout(() => setRevealed((shown) => shown + 1), revealed === 0 ? 250 : 700)
    return () => clearTimeout(next)
  }, [total, revealed])

  const verdict = diagnosis && revealed >= total ? diagnosis.verdict : null

  return <section className={panel}>
    <PanelTitle title="품질 진단" sub={`v${version.versionNumber} · 에이전트가 원인을 조사합니다`}>
      <button className={tableButton} onClick={onClose}>닫기</button>
    </PanelTitle>
    <div className="flex flex-col gap-3 p-4">
      {failure != null
        ? <Callout tone="warn" icon="triangle-alert">{describeFailure(failure)}</Callout>
        : <>
          <ol className="flex flex-col gap-2">
            {(diagnosis?.steps ?? []).slice(0, revealed).map((step) => <li
              key={step.order}
              className="flex items-start gap-[0.5625rem] rounded-[0.3125rem] border border-line-soft bg-sub px-3 py-[0.5625rem]"
            >
              <span className="mt-[0.0625rem] grid h-[1.125rem] w-[1.125rem] shrink-0 place-items-center rounded-full bg-ok-bg text-ok-fg">
                <Icon name={step.failed ? 'triangle-alert' : 'check'} size={11} />
              </span>
              <span className="min-w-0">
                <b className="block text-[0.78125rem] font-semibold text-ink">{TOOL_LABEL[step.tool] ?? step.tool}</b>
                <span className="mt-[0.125rem] block text-[0.71875rem] leading-[1.6] text-muted-2">{step.reason}</span>
              </span>
            </li>)}
            {(diagnosis == null || revealed < total) && <li className="flex items-center gap-[0.5625rem] px-3 py-[0.5625rem] text-[0.71875rem] text-muted-2">
              <Icon name="loader-circle" size={13} className="animate-spin" />
              {diagnosis == null
                ? `에이전트가 조사하는 중입니다… ${elapsed}초 (보통 30초 안팎)`
                : '정리하는 중…'}
            </li>}
          </ol>
          {verdict && <Verdict verdict={verdict} diagnosis={diagnosis!} />}
        </>}
    </div>
  </section>
}

/** 도구 이름은 코드의 말이다. 화면은 그 도구가 한 일로 부른다. */
const TOOL_LABEL: Record<string, string> = {
  version_overview: '버전 규모와 채움 상태 확인',
  score_questions: '골든 문항 재채점 · 실패 문항 확보',
  inspect_documents: '실패 문항이 가리키는 문서 원문 열람',
}

const CONFIDENCE_LABEL: Record<string, string> = { HIGH: '높음', MEDIUM: '보통', LOW: '낮음' }

/**
 * 결론 칸. <b>verdict만 크게</b> 둔다 — 촬영에서 한 줄만 읽히면 되고, 숫자·권고는 그
 * 한 줄을 뒷받침하러 아래에 선다.
 */
function Verdict({ verdict, diagnosis }: { verdict: Diagnosis['verdict']; diagnosis: Diagnosis }) {
  return <div className="rounded-[0.3125rem] border border-wait-dot/45 bg-wait-bg p-[0.875rem] text-wait-fg">
    <div className="flex items-start gap-[0.5625rem]">
      <Icon name="search-check" size={17} className="mt-[0.125rem] shrink-0" />
      <b className="text-[0.9375rem] font-bold leading-[1.5] text-ink">{verdict.verdict}</b>
    </div>
    <dl className="mt-[0.875rem] flex flex-col gap-[0.6875rem] text-[0.71875rem] leading-[1.6]">
      <Field label="근거">
        <ul className="flex list-disc flex-col gap-[0.1875rem] pl-4">
          {verdict.evidence.map((line, index) => <li key={index}>{line}</li>)}
        </ul>
      </Field>
      {verdict.reasoning && <Field label="판단 과정">{verdict.reasoning}</Field>}
      {verdict.recommendation && <Field label="권고">{verdict.recommendation}</Field>}
    </dl>
    <p className="mt-[0.875rem] border-t border-wait-dot/30 pt-[0.5625rem] text-[0.6875rem] text-muted-2">
      확신도 {CONFIDENCE_LABEL[verdict.confidence] ?? verdict.confidence}
      {' · '}조사 {diagnosis.steps.length}단계
      {' · '}{diagnosis.stopReason === 'MODEL_CONCLUDED' ? '에이전트가 스스로 종료' : '조사 상한에서 종료'}
    </p>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[4.25rem_1fr] gap-x-3 max-[560px]:grid-cols-1 max-[560px]:gap-y-1">
    <dt className="font-semibold text-muted-2">{label}</dt>
    <dd className="min-w-0">{children}</dd>
  </div>
}

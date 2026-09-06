import { isBuildInProgress, type AgentJob, type KnowledgeVersion } from './admin-types'

/**
 * A3 진행 표시의 계산부. **경과 시간이 주 표시이고 단계는 보조**다.
 *
 * <p>근거는 9/6 빌드 1회 실측이다. 화면에 쓸 수 있는 값이 경과 시간뿐이었다.
 *
 * <pre>
 * 05:09:53  빌드 시작
 * 05:09:54  CHUNK · 45% · 500/500 · updatedAt=05:09:54
 *           ... 8분 36초 동안 화면상 변화 0 ...
 * 05:18:30  APPROVAL_PENDING · 100% · 500/500 · updatedAt=05:18:30
 * </pre>
 *
 * <ul>
 *   <li>`percent`는 phase별 고정 상수라 `CHUNK` 45%에서 8분 36초 멈춘다 → 진행률 바 금지
 *   <li>`successCount`는 CHUNK 완료 시점 500/500이 그대로 얼어붙는다 → 건수 표기 금지
 *   <li>`updatedAt`도 서로 다른 값이 2개뿐이었다 → 정체 판정에 쓸 수 없다
 *   <li>`EMBED` phase는 한 번도 관측되지 않았다(단, 첫 폴러의 경로 오류로 5분 공백이 있어
 *       "관측되지 않았다"까지만 말한다 — 없다고 단정하지 않는다)
 * </ul>
 *
 * <p>따라서 정체 판정도 `updatedAt`이 아니라 **`createdAt` 기준 경과 시간**으로 한다.
 */

/** 통상 8분대. 이 값을 넘으면 사람이 로그를 봐야 한다. */
export const STALL_THRESHOLD_MS = 12 * 60_000

/** 7단계. UI 5단계의 "파싱·정제"는 대응 phase가 없어 뺐고, evaluate·승인 대기·활성화를 더했다. */
export const BUILD_STEPS = [
  'COLLECT', 'CHUNK', 'EMBED', 'INDEX', 'evaluate', '승인 대기', '활성화',
] as const

export type BuildView = {
  version: KnowledgeVersion
  /** 밀리초. `createdAt` 기준이라 새로고침해도 이어진다. */
  elapsedMs: number
  /** 12분 초과. 화면에 "정체됐습니다 · 로그 확인"을 띄운다. */
  stalled: boolean
  /**
   * 보조 표시용. job이 없으면 `null`이고 단계를 "진행 중"으로 뭉뚱그린다.
   * 값이 있어도 `CHUNK`에 머무는 구간이 길다 — 주 표시로 쓰지 않는다.
   */
  phase: string | null
  failure: AgentJob['failure']
}

/** 목록에서 진행 중인 버전 하나를 고른다. 없으면 폴링하지 않는다(설계 §5 정책). */
export function findInProgress(versions: KnowledgeVersion[]): KnowledgeVersion | null {
  return versions.find((version) => isBuildInProgress(version.status)) ?? null
}

export function buildView(version: KnowledgeVersion, job: AgentJob | null, nowMs: number): BuildView {
  const elapsedMs = Math.max(0, nowMs - Date.parse(version.createdAt))
  return {
    version,
    elapsedMs,
    stalled: elapsedMs > STALL_THRESHOLD_MS,
    phase: job?.progress?.phase ?? null,
    failure: job?.failure,
  }
}

/** `4분 12초` 형태. 통상 8분대라 시간 단위는 쓰지 않는다. */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`
}

/**
 * 단계 점등 상태. 실측에서 `CHUNK`에 머물다 끝에 한 번에 넘어갔으므로 **보조 표시**다.
 * job이 없으면 전부 `pending`으로 두고 화면이 "진행 중"만 말한다.
 */
export function stepStates(phase: string | null): ('done' | 'active' | 'pending')[] {
  if (phase == null) return BUILD_STEPS.map(() => 'pending')
  const index = BUILD_STEPS.findIndex((step) => step.toUpperCase() === phase.toUpperCase())
  if (index < 0) return BUILD_STEPS.map(() => 'pending')
  return BUILD_STEPS.map((_, position) =>
    position < index ? 'done' : position === index ? 'active' : 'pending')
}

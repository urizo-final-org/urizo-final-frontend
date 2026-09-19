import type { InputOptimizationDetail, InputOptimizationJob } from './api'

const nodeNames: Record<string, string> = {
  start: '시작', guardrail: '잠금 가드레일', analyze: '요청 분석', scope_approval: '작업 범위 승인',
  code: '코드 생성', review: '코드 검토', rework_gate: '재작업 확인', preview: '변경 미리보기',
  preview_approval: '변경 후보 승인', pr_request: 'PR 요청', github_approval: 'GitHub 반영 승인',
  pr_complete: 'PR 완료 확인', deploy_request: '배포 요청 기록', deploy_approval: '배포 승인',
  dev_merge_check: 'dev 병합 확인', deploy: '배포', end: '종료',
}
export function nodeName(job: InputOptimizationJob, id: string) {
  const handler = job.settings.nodes?.find(n => n.id === id)?.handlerKey
  return nodeNames[id] ?? nodeNames[(handler ?? id).replace(/^(coding|common)\./, '')] ?? id
}
export function completeTotal(job: InputOptimizationJob) {
  return job.inputKnown === job.calls && job.outputKnown === job.calls && job.inputTokens != null && job.outputTokens != null
    ? job.inputTokens + job.outputTokens : null
}
export function uncachedInput(job: InputOptimizationJob) {
  return job.inputKnown === job.calls && job.cacheKnown === job.calls && job.inputTokens != null && job.cachedInputTokens != null
    ? job.inputTokens - job.cachedInputTokens : null
}

export type TokenMeasurement = { sum: number | null; mean: number | null; known: number; calls: number; limited: boolean }
export function tokenMeasurements(detail: InputOptimizationDetail) {
  const j = detail.job
  const measured = (sum: number | null, known: number, limited = false): TokenMeasurement => ({
    sum: known > 0 ? sum : null, mean: sum != null && known > 0 ? sum / known : null,
    known, calls: j.calls, limited,
  })
  // Paired metrics must use the same calls, not sums over different known subsets.
  const paired = (kind: 'total' | 'uncached') => {
    const full = kind === 'total' ? completeTotal(j) : uncachedInput(j)
    if (full != null) return measured(full, j.calls)
    const values = detail.calls.flatMap(c => {
      const other = kind === 'total' ? c.outputTokens : c.cachedInputTokens
      if (c.inputTokens == null || other == null || (kind === 'uncached' && other > c.inputTokens)) return []
      return [kind === 'total' ? c.inputTokens + other : c.inputTokens - other]
    })
    return measured(values.length ? values.reduce((sum, value) => sum + value, 0) : null,
      values.length, detail.truncated)
  }
  return {
    input: measured(j.inputTokens, j.inputKnown),
    output: measured(j.outputTokens, j.outputKnown),
    total: paired('total'),
    cached: measured(j.cachedInputTokens, j.cacheKnown),
    uncached: paired('uncached'),
  }
}

export const count = (value: number | null | undefined) => value == null ? '미수집' : value.toLocaleString('ko-KR')
export function delta(before: number | null, after: number | null, complete: boolean): string {
  if (!complete || before == null || after == null || before === 0) return '비교 보류'
  const value = (after - before) / before * 100
  return `${value > 0 ? '↑' : value < 0 ? '↓' : '—'} ${Math.abs(value).toFixed(1)}%`
}

export function comparisonIssues(a: InputOptimizationJob, b: InputOptimizationJob): string[] {
  const issues: string[] = []
  if (!a.request || a.request !== b.request) issues.push('사용자 요청 다름 또는 미확인')
  if (!a.baseSha || a.baseSha !== b.baseSha || !a.repositoryId || a.repositoryId !== b.repositoryId) issues.push('초기 Source 상태 다름 또는 미확인')
  if (!a.finishedAt || !b.finishedAt || a.status !== b.status || a.stage !== b.stage) issues.push('종료 상태·도달 단계 다름 또는 실행 중')
  if (!a.reviewResult || a.reviewResult !== b.reviewResult) issues.push('리뷰 결과 다름 또는 미확인')
  if (JSON.stringify(a.settings.modelBindings) !== JSON.stringify(b.settings.modelBindings)
    || JSON.stringify(a.settings.toolBindings) !== JSON.stringify(b.settings.toolBindings)) issues.push('모델·도구 설정 다름')
  // Source/runtime version, result quality and cache warmth are not captured by this first version.
  issues.push('실행 서버 버전·캐시 시작 상태·동등 품질은 별도 검증 필요')
  return issues
}

export function rtkSummary(detail: InputOptimizationDetail) {
  const processed = new Set<string>()
  let attempts = 0, selected = 0, inclusions = 0, before = 0, after = 0, retained = 0, folded = 0
  let attemptedBefore = 0, attemptedAfter = 0, budgetFolded = 0
  const fallbacks: Record<string, number> = {}
  for (const call of detail.calls) {
    const p = call.inputProcessing
    if (!p) continue
    for (const [index, d] of p.decisions.entries()) {
      if (d.operation === 'RTK' && d.reason === 'selected'
        && !p.decisions.some(other => other.operation === 'REQUEST_BUDGET' && other.toolCallId === d.toolCallId)) inclusions++
      const key = `${p.processingId}:${index}`
      if (processed.has(key)) continue
      processed.add(key)
      if (d.operation === 'RTK' && d.firstProcessing) {
        // Count actual render evaluations, excluding size/budget gates that never invoke the compressor.
        if (['selected', 'not_smaller', 'information_loss', 'adapter_failure'].includes(d.reason)) {
          attempts++; attemptedBefore += d.beforeBytes; attemptedAfter += d.afterBytes
        }
        if (d.reason !== 'selected') fallbacks[d.reason] = (fallbacks[d.reason] ?? 0) + 1
        if (d.reason === 'selected') { selected++; before += d.beforeBytes; after += d.afterBytes }
      }
      if (d.reason === 'extra_retained') retained++
      if (d.reason === 'folded') folded++
      if (d.reason === 'elided') budgetFolded++
    }
  }
  return { attempts, selected, inclusions, before, after, retained, folded, attemptedBefore, attemptedAfter, budgetFolded, fallbacks,
    measured: detail.calls.some(c => c.inputProcessing != null), truncated: detail.truncated }
}

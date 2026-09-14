import { useEffect, useState } from 'react'
import { describeFailure } from '../../shared/api/error'
import { secondaryButton } from '../../shared/ui/primitives'
import type { AgentSettingsApiClient, ObservabilityMetricsResponse, TokenUsagePoint, TokenUsageResponse } from './api'

const shown = (value: number | null) => value == null ? '미제공' : Number.isInteger(value) ? value.toLocaleString('en-US') : String(value)

export function tokenBucketRange(data: TokenUsageResponse, point: TokenUsagePoint) {
  const start = Date.parse(point.bucketStart)
  const from = Math.max(start, Date.parse(data.from))
  const to = Math.min(start + (data.granularity === 'hour' ? 3_600_000 : 86_400_000), Date.parse(data.to))
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return null
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() }
}

export default function TokenUsageDetail({ data, point, jobId, getMetrics, cache, onClose, modelLimit = 50 }: {
  data: TokenUsageResponse; point: TokenUsagePoint; jobId: string
  getMetrics: AgentSettingsApiClient['getObservabilityMetrics']
  cache: Map<string, ObservabilityMetricsResponse>; onClose: () => void
  modelLimit?: number
}) {
  const range = tokenBucketRange(data, point)
  const key = `${range?.from}:${range?.to}:${jobId}`
  const [result, setResult] = useState<ObservabilityMetricsResponse | null>(() => cache.get(key) ?? null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!range || cache.has(key)) return
    const controller = new AbortController()
    // A pause over a bucket triggers one bounded query, never one request per mouse move.
    const timer = window.setTimeout(() => {
      void getMetrics(range.from, range.to, jobId || undefined, controller.signal).then((response) => {
        if (controller.signal.aborted) return
        if (Date.parse(response.from) !== Date.parse(range.from) || Date.parse(response.to) !== Date.parse(range.to) || response.environment !== 'local') {
          throw new Error('상세 응답의 UTC 구간 또는 환경이 일치하지 않습니다.')
        }
        if (response.status === 'AVAILABLE') {
          if (cache.size >= 50) cache.delete(cache.keys().next().value!)
          cache.set(key, response)
        }
        setResult(response)
      }).catch((failure) => { if (!controller.signal.aborted) setError(describeFailure(failure)) })
    }, 300)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [range?.from, range?.to, key, jobId, getMetrics, cache, reload])

  return <section aria-label="시간 구간 상세" className="text-xs">
    <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2">
      <b>시간 구간 상세 · UTC</b><button type="button" className={secondaryButton} onClick={onClose} aria-label="시간 구간 상세 닫기">닫기</button>
    </div>
    <div className="space-y-3 p-4">
      {range ? <div className="flex flex-wrap gap-x-8 gap-y-2 text-muted-2">
        <p>집계 시작 (UTC)<time dateTime={range.from} className="mt-1 block font-semibold text-ink">{range.from.replace('T', ' ').replace('.000Z', '').replace('Z', '')}</time></p>
        <p>집계 종료 (UTC · 미포함)<time dateTime={range.to} className="mt-1 block font-semibold text-ink">{range.to.replace('T', ' ').replace('.000Z', '').replace('Z', '')}</time></p>
      </div> : <p>조회 기간과 겹치지 않는 구간입니다.</p>}
      <dl className="grid grid-cols-3 gap-2 rounded-md bg-sub p-2">
        <div><dt className="text-sky-300">입력 Token</dt><dd>{shown(point.inputTokens)}</dd></div>
        <div><dt className="text-amber-300">출력 Token</dt><dd>{shown(point.outputTokens)}</dd></div>
        <div><dt className="text-violet-300">전체 Token</dt><dd>{shown(point.totalTokens)}</dd></div>
      </dl>
      <p className="text-[0.6875rem] text-muted-2">같은 구간·Job 조건 · 비용순 최대 50개 모델 · 전체 모델 합계가 아닙니다. 모델별 값은 별도 조회 시점의 집계입니다.</p>
      {range && !result && !error && <p role="status">모델별 사용량 조회 중…</p>}
      {error && <p role="alert" className="text-fail-fg">{error}</p>}
      {result?.status === 'DISABLED' && <p>관측 연결 안 됨</p>}
      {result?.status === 'UNAVAILABLE' && <p role="status">모델별 사용량 일시 사용 불가</p>}
      {result?.status === 'AVAILABLE' && result.rows.length === 0 && <p>이 구간의 모델 관측이 없습니다.</p>}
      {result?.status === 'AVAILABLE' && result.rows.length > 0 && <p className="text-muted-2">조회된 {result.rows.length}개 중 {Math.min(modelLimit, result.rows.length)}개 표시 · 비용순</p>}
      {result?.status === 'AVAILABLE' && <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>{result.rows.slice(0, modelLimit).map((row, index) => <article key={`${row.model}:${index}`} className="min-w-0 rounded-md border border-line-soft p-3">
        <b className="block break-all font-mono">{row.model ?? '모델 미제공'}</b>
        <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-3 gap-y-2 break-words text-xs">
          <dt>호출 수</dt><dd>{shown(row.observationCount)}</dd>
          <dt>입력 / 출력 Token</dt><dd>{shown(row.inputTokens)} / {shown(row.outputTokens)}</dd>
          <dt>전체 Token</dt><dd>{shown(row.totalTokens)}</dd>
          <dt>비용 (Langfuse)</dt><dd>{shown(row.totalCost)}</dd>
          <dt>P95 지연 (ms)</dt><dd>{shown(row.p95LatencyMs)}</dd>
        </dl>
      </article>)}</div>}
      {(error || result?.status === 'UNAVAILABLE') && <button type="button" className={secondaryButton} onClick={() => { setResult(null); setError(null); setReload((value) => value + 1) }}>구간 상세 다시 조회</button>}
    </div>
  </section>
}

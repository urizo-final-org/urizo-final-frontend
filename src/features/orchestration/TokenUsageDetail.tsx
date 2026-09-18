import { useObservabilityRead } from './useObservabilityRead'
import { useState } from 'react'
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
  useObservabilityRead((signal) => {
    if (!range || cache.has(key)) return
    // A pause over a bucket triggers one bounded query, never one request per mouse move.
    const timer = window.setTimeout(() => {
      void getMetrics(range.from, range.to, jobId || undefined, signal).then((response) => {
        if (signal.aborted) return
        if (Date.parse(response.from) !== Date.parse(range.from) || Date.parse(response.to) !== Date.parse(range.to) || response.environment !== 'local') {
          throw new Error('상세 응답의 UTC 구간 또는 환경이 일치하지 않습니다.')
        }
        if (response.status === 'AVAILABLE') {
          if (cache.size >= 50) cache.delete(cache.keys().next().value!)
          cache.set(key, response)
        }
        setResult(response)
      }).catch((failure) => { if (!signal.aborted) setError(describeFailure(failure)) })
    }, 300)
    return () => { window.clearTimeout(timer) }
  }, `${key}:${reload}`)

  return <section aria-label="시간 구간 상세" className="text-xs">
    <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2">
      <b>시간 구간 상세 · UTC</b><button type="button" className={secondaryButton} onClick={onClose} aria-label="시간 구간 상세 닫기">닫기</button>
    </div>
    <div className="space-y-2 p-3">
      {range ? <div className="flex flex-wrap gap-x-1 text-[11px] text-muted-2">
        <time dateTime={range.from}>{range.from.slice(5, 16).replace('T', ' ')}</time>
        <span>→</span><time dateTime={range.to}>{range.to.slice(5, 16).replace('T', ' ')}</time><span>(종료 미포함)</span>
      </div> : <p>조회 기간과 겹치지 않는 구간입니다.</p>}
      <dl className="grid grid-cols-3 gap-2 rounded-md bg-sub p-2">
        <div><dt className="text-muted-2">입력 Token</dt><dd className="font-semibold tabular-nums">{shown(point.inputTokens)}</dd></div>
        <div><dt className="text-muted-2">출력 Token</dt><dd className="font-semibold tabular-nums">{shown(point.outputTokens)}</dd></div>
        <div><dt className="text-muted-2">전체 Token</dt><dd className="font-semibold tabular-nums">{shown(point.totalTokens)}</dd></div>
      </dl>
      <p className="text-[11px] text-muted-2">수집된 토큰 기준 · 미제공은 0이 아닙니다.</p>
      {range && !result && !error && <p role="status">모델별 사용량 조회 중…</p>}
      {error && <p role="alert" className="text-fail-fg">{error}</p>}
      {result?.status === 'DISABLED' && <p>관측 연결 안 됨</p>}
      {result?.status === 'UNAVAILABLE' && <p role="status">모델별 사용량 일시 사용 불가</p>}
      {result?.status === 'AVAILABLE' && result.rows.length === 0 && <p>이 구간의 모델 관측이 없습니다.</p>}
      {result?.status === 'AVAILABLE' && result.rows.length > 0 && <>
        <p className="text-[11px] text-muted-2">조회된 {result.rows.length}개 중 {Math.min(modelLimit, result.rows.length)}개 표시 · 호출순{result.truncated ? ' · 상위 50개 한정' : ''}</p>
        <div className="max-h-56 overflow-y-auto rounded-md border border-line-soft">
          <table aria-label="모델별 호출과 토큰 요약" className="w-full table-fixed text-[11px]">
            <thead className="sticky top-0 bg-sub text-muted-2"><tr>
              <th className="w-[43%] px-2 py-1.5 text-left font-medium">모델</th>
              <th className="w-[13%] px-2 py-1.5 text-right font-medium">호출</th>
              <th className="w-[22%] px-2 py-1.5 text-right font-medium">입력</th>
              <th className="w-[22%] px-2 py-1.5 text-right font-medium">출력</th>
            </tr></thead>
            <tbody>{result.rows.slice(0, modelLimit).map((row, index) => <tr key={`${row.model}:${index}`} className="border-t border-line-soft">
              <th scope="row" title={row.model ?? '모델 미제공'} className="truncate px-2 py-1.5 text-left font-medium">{row.model ?? '모델 미제공'}</th>
              <td className="px-2 py-1.5 text-right tabular-nums">{shown(row.observationCount)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{shown(row.inputTokens)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{shown(row.outputTokens)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
      {(error || result?.status === 'UNAVAILABLE') && <button type="button" className={secondaryButton} onClick={() => { setResult(null); setError(null); setReload((value) => value + 1) }}>구간 상세 다시 조회</button>}
    </div>
  </section>
}

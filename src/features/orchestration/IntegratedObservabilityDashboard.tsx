import { useObservabilityRead } from './useObservabilityRead'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import TokenUsageDetail from './TokenUsageDetail'
import { describeFailure } from '../../shared/api/error'
import { Badge, PanelTitle, control, panel, secondaryButton } from '../../shared/ui/primitives'
import type { AgentSettingsApiClient, ObservabilityMetricsResponse, ObservabilityResponse, ObservabilityStatus, TokenUsageResponse } from './api'

interface Query { from: string; to: string; jobId: string }
interface Result<T> { data: T | null; error: string | null; loadedAt: string | null }
const pending = { data: null, error: null, loadedAt: null }
const shown = (value: string | number | null | undefined) => value == null ? '제공되지 않음' : String(value)

function State({ result, count, children }: {
  result: Result<{ status: ObservabilityStatus }>; count: number; children: ReactNode
}) {
  if (result.error) return <p role="alert" className="p-4 text-xs text-fail-fg">{result.error} · 상단 새로고침으로 다시 조회할 수 있습니다.</p>
  if (!result.data) return <p role="status" className="p-4 text-xs text-muted-2">조회 중…</p>
  if (result.data.status === 'DISABLED') return <p className="p-4 text-xs text-muted-2">관측 연결 안 됨 · Langfuse 연결 설정을 확인해 주세요.</p>
  if (result.data.status !== 'AVAILABLE') return <p role="status" className="p-4 text-xs text-fail-fg">관측 일시 사용 불가 · 상단 새로고침으로 다시 조회할 수 있습니다.</p>
  if (!count) return <p className="p-4 text-xs text-muted-2">선택한 조건의 관측 데이터가 없습니다.</p>
  return <>{children}</>
}

export default function IntegratedObservabilityDashboard({ api, query, onDetail, onRangeChange }: {
  api: Pick<AgentSettingsApiClient, 'getObservations' | 'getObservabilityMetrics' | 'getTokenUsage'>; query: Query; onDetail: (tab: 'node' | 'provider') => void
  onRangeChange?: (query: Query) => void
}) {
  const [nodes, setNodes] = useState<Result<ObservabilityResponse>>(pending)
  const [providers, setProviders] = useState<Result<ObservabilityMetricsResponse>>(pending)
  const [tokens, setTokens] = useState<Result<TokenUsageResponse>>(pending)
  const [modelLimit, setModelLimit] = useState(50)
  const [panelWidth, setPanelWidth] = useState('100%')
  const hours = (Date.parse(query.to) - Date.parse(query.from)) / 3_600_000
  const preset = [24, 48, 168, 720].includes(hours) ? String(hours) : ''

  useObservabilityRead((signal) => {
    setNodes(pending); setProviders(pending); setTokens(pending)
    async function read<T extends { from: string; to: string; environment: string }>(request: () => Promise<T>, save: (result: Result<T>) => void) {
      try {
        const data = await request()
        if (signal.aborted) return
        // Compare instants: Spring may omit .000 while the browser sends milliseconds.
        if (Date.parse(data.from) !== Date.parse(query.from) || Date.parse(data.to) !== Date.parse(query.to) || data.environment !== 'local') {
          throw new Error('관측 응답의 UTC 기간 또는 환경이 일치하지 않습니다.')
        }
        save({ data, error: null, loadedAt: new Date().toISOString() })
      } catch (error) {
        if (!signal.aborted) save({ data: null, error: describeFailure(error), loadedAt: null })
      }
    }
    const job = query.jobId || undefined
    void read(() => api.getObservations(query.from, query.to, { jobId: job, kind: 'NODE', limit: 50 }, signal), setNodes)
    void read(() => api.getObservabilityMetrics(query.from, query.to, job, signal), setProviders)
    void read(() => api.getTokenUsage(query.from, query.to, job, signal), setTokens)
  }, query)

  const nodeRows = nodes.data?.observations.filter((row) => row.name !== 'axms.model') ?? []
  const providerRows = providers.data?.rows ?? []
  const loaded = [nodes, providers, tokens].filter((result) => result.data?.status === 'AVAILABLE').length

  return <section className="mt-3 max-w-full space-y-3" style={{ width: panelWidth }} aria-label="통합 계측 대시보드 결과">
    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
      <h3 className="text-sm font-semibold text-ink">통합 계측 대시보드</h3>
      <Badge tone={loaded === 3 ? 'ok' : 'wait'} dot={false}>계측 응답 {loaded}/3</Badge>
      <p className="w-full text-xs text-muted-2">Node 실행 관측과 Provider 사용량을 함께 확인합니다. 답변 평가 점수나 종합 품질점수는 생성하지 않습니다.</p>
    </div>
    <div className="flex flex-wrap items-end gap-3 px-1 text-xs">
      {onRangeChange && <label>조회 기간
        <select className={control} value={preset} onChange={event => {
          const duration = Number(event.target.value)
          if ([24, 48, 168, 720].includes(duration)) onRangeChange({ ...query, from: new Date(Date.parse(query.to) - duration * 3_600_000).toISOString() })
        }}>
          <option value="" disabled>직접 지정</option>
          <option value="24">최근 24시간</option><option value="48">최근 48시간</option>
          <option value="168">최근 7일</option><option value="720">최근 30일</option>
        </select>
      </label>}
      <label>상세 표시 모델 수
        <select className={control} value={modelLimit} onChange={event => setModelLimit(Number(event.target.value))}>
          <option value="3">최대 3개</option><option value="10">최대 10개</option><option value="50">최대 50개</option>
        </select>
      </label>
      <label>패널 폭
        <select className={control} value={panelWidth} onChange={event => setPanelWidth(event.target.value)}>
          <option value="100%">화면 전체</option><option value="720px">720px</option><option value="390px">390px</option>
        </select>
      </label>
      <p className="w-full text-[0.6875rem] text-muted-2">기간은 현재 조회 종료 UTC 기준 · Job 조건 유지 · 집계 간격: {hours <= 48 ? '시간별' : '일별'} (자동). 모델 수는 툴팁 표시 개수이며 전체 토큰 집계에는 영향을 주지 않습니다.</p>
    </div>
    <section className={panel} aria-label="토큰 사용량 추이">
      <PanelTitle title="토큰 사용량 추이"><Badge tone="idle" dot={false}>입력 · 출력 · 전체</Badge></PanelTitle>
      <p className="px-4 pt-3 text-xs leading-5 text-muted-2">실제 Provider 호출의 전체 조회 기간 집계 · 48시간 이하는 시간별, 그 이상은 일별 UTC 구간입니다. 최초·마지막 구간은 선택 기간과 겹치는 부분만 집계합니다.</p>
      <State result={tokens} count={tokens.data?.points.length ?? 0}>
        {tokens.data && <TokenUsageChart key={tokens.loadedAt} data={tokens.data} jobId={query.jobId} getMetrics={api.getObservabilityMetrics} modelLimit={modelLimit} />}
      </State>
      {tokens.loadedAt && <p className="px-4 pb-3 text-[0.6875rem] text-muted-2">조회 완료 UTC {tokens.loadedAt}</p>}
    </section>
    <div className={`grid min-w-0 grid-cols-1 items-start gap-3 ${panelWidth === '100%' ? 'xl:grid-cols-2' : ''}`}>
      <section className={panel} aria-label="Node 계측 요약">
        <PanelTitle title="Node 계측 요약"><button type="button" className={secondaryButton} onClick={() => onDetail('node')}>Node 상세 보기</button></PanelTitle>
        <p className="px-4 pt-3 text-xs leading-5 text-muted-2">최근 Node·Tool·Check 관측 최대 5건 · 전체 건수나 성공률 집계가 아닙니다.</p>
        <State result={nodes} count={nodeRows.length}>
          <div className="overflow-x-auto p-3"><table className="w-full min-w-[30rem] text-left text-xs">
            <thead className="bg-sub text-muted-2"><tr><th className="p-2">관측 / Node</th><th className="p-2">상태 / Attempt</th><th className="p-2">지연시간</th></tr></thead>
            <tbody>{nodeRows.slice(0, 5).map((row) => <tr key={row.id} className="border-t border-line-soft">
              <td className="p-2"><span className="block font-mono">{row.name} / {shown(row.metadata.nodeId)}</span><span className="block break-all text-[0.6875rem] text-muted-2">Job {shown(row.metadata.jobId)}<br />{row.startTime}</span></td>
              <td className="p-2">{shown(row.metadata.nodeStatus ?? row.metadata.toolStatus ?? row.metadata.checkStatus ?? row.level)} / {shown(row.metadata.attempt)}</td>
              <td className="p-2">{row.latencyMs == null ? shown(null) : `${row.latencyMs} ms`}</td>
            </tr>)}</tbody>
          </table></div>
          <p className="px-4 pb-3 text-[0.6875rem] text-muted-2">{nodeRows.length > 5 || nodes.data?.nextCursor ? '추가 관측은 Node 상세 보기에서 페이지를 이동해 확인하세요.' : '선택 조건의 최근 관측입니다.'}</p>
        </State>
        {nodes.loadedAt && <p className="px-4 pb-3 text-[0.6875rem] text-muted-2">조회 완료 UTC {nodes.loadedAt}</p>}
      </section>
      <section className={panel} aria-label="Provider 계측 요약">
        <p className="mb-2 text-xs text-muted-2">입력은 캐시를 포함한 전체 사용량입니다. 캐시 입력은 Provider 상세의 호출별 관측에서 확인하세요.</p>
        <PanelTitle title="Provider 계측 요약"><button type="button" className={secondaryButton} onClick={() => onDetail('provider')}>Provider 상세 보기</button></PanelTitle>
        <p className="px-4 pt-3 text-xs leading-5 text-muted-2">전체 조회 기간의 모델별 호출·토큰·비용 · 비용순 상위 5개 모델만 표시합니다. 전체 모델 합계가 아닙니다.</p>
        <State result={providers} count={providerRows.length}>
          <div className="overflow-x-auto p-3"><table className="w-full min-w-[30rem] text-left text-xs">
            <thead className="bg-sub text-muted-2"><tr><th className="p-2">Model / 호출</th><th className="p-2">입력 / 출력 / 전체 Token</th><th className="p-2">비용 / P95</th></tr></thead>
            <tbody>{providerRows.slice(0, 5).map((row, index) => <tr key={`${row.model}-${index}`} className="border-t border-line-soft">
              <td className="p-2"><span className="block font-mono">{shown(row.model)}</span>{shown(row.observationCount)} 회</td>
              <td className="p-2">{shown(row.inputTokens)} / {shown(row.outputTokens)} / {shown(row.totalTokens)}</td>
              <td className="p-2">{shown(row.totalCost)} / {row.p95LatencyMs == null ? shown(null) : `${row.p95LatencyMs} ms`}</td>
            </tr>)}</tbody>
          </table></div>
          <p className="px-4 pb-3 text-[0.6875rem] text-muted-2">추가 모델 집계(최대 50개)와 실제 호출 내역은 Provider 상세 보기에서 확인하세요.</p>
        </State>
        {providers.loadedAt && <p className="px-4 pb-3 text-[0.6875rem] text-muted-2">조회 완료 UTC {providers.loadedAt}</p>}
      </section>
    </div>
  </section>
}

const series = [
  { field: 'inputTokens', label: '입력 Token', color: '#38bdf8', dash: undefined },
  { field: 'outputTokens', label: '출력 Token', color: '#fbbf24', dash: '6 4' },
  { field: 'totalTokens', label: '전체 Token', color: '#a78bfa', dash: '2 3' },
] as const
const validToken = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0

export function TokenUsageChart({ data, jobId = '', getMetrics, modelLimit = 50 }: {
  data: TokenUsageResponse; jobId?: string; getMetrics?: AgentSettingsApiClient['getObservabilityMetrics']
  modelLimit?: number
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPointer = useRef({ x: 0, y: 0 })
  const dismissedAt = useRef<{ x: number; y: number } | null>(null)
  const cancelClose = () => { if (closeTimer.current !== null) clearTimeout(closeTimer.current); closeTimer.current = null }
  const dismiss = () => { cancelClose(); dismissedAt.current = { ...lastPointer.current }; setSelected(null) }
  const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => setSelected(null), 180) }
  const openBucket = (index: number) => { cancelClose(); if (!dismissedAt.current) setSelected(index) }
  useEffect(() => () => { if (closeTimer.current !== null) clearTimeout(closeTimer.current) }, [])
  const tooltipId = useId()
  const chartRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [tooltipStyle, setTooltipStyle] = useState({ left: 16, top: 40, width: 0 })
  const cache = useRef(new Map<string, ObservabilityMetricsResponse>())
  useLayoutEffect(() => {
    if (selected === null) return
    const chart = chartRef.current
    const tooltip = tooltipRef.current
    const anchor = chart?.querySelector<HTMLButtonElement>(`[data-token-bucket="${selected}"]`)
    if (!chart || !tooltip || !anchor) return
    const place = () => {
      const box = chart.getBoundingClientRect()
      const target = anchor.getBoundingClientRect()
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth
      const width = Math.max(0, Math.min(900, box.width - 32, viewportWidth - 24))
      const minLeft = Math.max(12, box.left + 16)
      const maxRight = Math.min(viewportWidth - 12, box.right - 16)
      const preferredLeft = target.right + 12 + width <= maxRight ? target.right + 12 : target.left - width - 12
      const left = Math.max(minLeft, Math.min(preferredLeft, maxRight - width)) - box.left
      // An absolute overlay scrolls with the page, so oversized details remain reachable.
      // Reposition when data/width changes, not on vertical page scroll.
      const top = Math.max(12, Math.min(target.top + 12, window.innerHeight - tooltip.getBoundingClientRect().height - 12)) - box.top
      setTooltipStyle(previous => previous.left === left && previous.top === top && previous.width === width
        ? previous : { left, top, width })
    }
    place()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    observer?.observe(chart)
    observer?.observe(tooltip)
    const scroller = scrollerRef.current
    scroller?.addEventListener('scroll', place)
    window.addEventListener('resize', place)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      observer?.disconnect()
      scroller?.removeEventListener('scroll', place)
      window.removeEventListener('resize', place)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [selected])
  const points = data.points
  const values = points.flatMap((point) => series.map(({ field }) => point[field]).filter(validToken))
  const max = Math.max(1, ...values)
  // Keep every returned UTC bucket legible; narrow screens scroll only the chart horizontally.
  const chartWidth = Math.max(800, points.length * 42 + 116)
  const plotWidth = chartWidth - 116
  const step = plotWidth / Math.max(1, points.length - 1)
  const x = (index: number) => 66 + (points.length === 1 ? 0.5 : index / (points.length - 1)) * plotWidth
  const y = (value: number) => 212 - value / max * 164
  const point = selected === null ? null : points[selected]
  const hoverPoint = (index: number, clientX: number, clientY: number, moving = false) => {
    const at = dismissedAt.current
    if (moving && at && (Math.abs(clientX - at.x) > 2 || Math.abs(clientY - at.y) > 2)) dismissedAt.current = null
    openBucket(index)
  }
  const lineBucket = (element: SVGPathElement, clientX: number) => {
    const bounds = element.ownerSVGElement!.getBoundingClientRect()
    const chartX = (clientX - bounds.left) * chartWidth / bounds.width
    return points.length === 1 ? 0 : Math.max(0, Math.min(points.length - 1, Math.round((chartX - 66) / step)))
  }
  return <div ref={chartRef} className="relative p-4" onMouseMove={event => { lastPointer.current = { x: event.clientX, y: event.clientY } }}>
    <div className="mb-2 flex flex-wrap gap-4 text-xs">{series.map((item) => <span key={item.field} className="flex items-center gap-1.5"><svg width="25" height="8" aria-hidden="true"><line x1="0" x2="25" y1="4" y2="4" stroke={item.color} strokeWidth="2" strokeDasharray={item.dash} /></svg>{item.label}</span>)}</div>
    {values.length === 0 ? <p className="py-4 text-xs text-muted-2">토큰 값이 제공되지 않아 그래프를 표시할 수 없습니다.</p> : <div ref={scrollerRef} className="overflow-x-auto">
      <div className="relative" style={{ minWidth: chartWidth }}>
      <svg className="block w-full" viewBox={`0 0 ${chartWidth} 286`} role="img" aria-label="UTC 구간별 입력·출력·전체 토큰 사용량 그래프">
        <title>토큰 사용량 추이</title><desc>누락된 값은 선을 연결하지 않습니다. 정확한 값은 아래 시간별 데이터 표에서 확인할 수 있습니다.</desc>
        {[0, 0.5, 1].map((fraction) => <g key={fraction}>
          <line x1="66" x2={chartWidth - 50} y1={y(max * fraction)} y2={y(max * fraction)} stroke="currentColor" opacity="0.15" />
          <text x="58" y={y(max * fraction) + 4} textAnchor="end" fill="currentColor" fontSize="11">{Number((max * fraction).toFixed(1)).toLocaleString('en-US')}</text>
        </g>)}
        <text x="66" y="25" fill="currentColor" fontSize="11">Token / {data.granularity === 'hour' ? '시간' : '일'}</text>
        {points.map((item, index) => <g key={item.bucketStart} data-time-tick={item.bucketStart}>
          <line x1={x(index)} x2={x(index)} y1="40" y2="216" stroke="currentColor" opacity="0.08" />
          <line x1={x(index)} x2={x(index)} y1="212" y2="218" stroke="currentColor" opacity="0.5" />
          <text x={x(index)} y="236" textAnchor="middle" fill="currentColor" fontSize="10">{item.bucketStart.slice(5, 10)}</text>
          <text x={x(index)} y="252" textAnchor="middle" fill="currentColor" fontSize="10">{item.bucketStart.slice(11, 16)}</text>
        </g>)}
        {series.map(({ field, label: name, color, dash }) => {
          let connected = false
          const path = points.map((point, index) => {
            const value = point[field]
            if (!validToken(value)) { connected = false; return '' }
            const command = `${connected ? 'L' : 'M'} ${x(index)} ${y(value)}`
            connected = true
            return command
          }).join(' ')
          return <g key={field} aria-label={name}>
            <path data-series={field} d={path} fill="none" stroke={color} strokeWidth="2" strokeDasharray={dash} pointerEvents="none" />
            {points.map((point, index) => validToken(point[field]) && <circle key={point.bucketStart} cx={x(index)} cy={y(point[field])} r="3" fill={color} pointerEvents="none"><title>{point.bucketStart} · {name}: {point[field]}</title></circle>)}
            {getMetrics && <path data-token-line={field} d={path} fill="none" stroke="transparent" strokeWidth="10" vectorEffect="non-scaling-stroke" pointerEvents="stroke"
              onMouseEnter={event => hoverPoint(lineBucket(event.currentTarget, event.clientX), event.clientX, event.clientY)}
              onMouseMove={event => hoverPoint(lineBucket(event.currentTarget, event.clientX), event.clientX, event.clientY, true)} onMouseLeave={scheduleClose} />}
            {getMetrics && points.map((item, index) => validToken(item[field]) && <circle key={item.bucketStart} data-token-point={index}
              cx={x(index)} cy={y(item[field])} r="3" fill="transparent" stroke="transparent" strokeWidth="8" vectorEffect="non-scaling-stroke" pointerEvents="all"
              onMouseEnter={event => hoverPoint(index, event.clientX, event.clientY)}
              onMouseMove={event => hoverPoint(index, event.clientX, event.clientY, true)} onMouseLeave={scheduleClose} />)}
          </g>
        })}
        <text x={66 + plotWidth / 2} y="277" textAnchor="middle" fill="currentColor" fontSize="11">구간 시작 (UTC) · {data.granularity === 'hour' ? '1시간' : '1일'} 간격</text>
        {selected !== null && <line x1={x(selected)} x2={x(selected)} y1="40" y2="216" stroke="#cbd5e1" strokeDasharray="3 4" pointerEvents="none" />}
      </svg>
      {getMetrics && points.map((item, index) => <button key={item.bucketStart} type="button"
        data-token-bucket={index} aria-haspopup="dialog"
        aria-label={`${item.bucketStart} 구간 상세`} aria-expanded={selected === index} aria-controls={selected === index ? tooltipId : undefined}
        className="pointer-events-none absolute rounded-sm focus-visible:outline-2 focus-visible:outline-sky-300"
        style={{ top: `${48 / 286 * 100}%`, height: `${164 / 286 * 100}%`, left: `${(points.length === 1 ? 66 : x(index) - (index === 0 ? 0 : step / 2)) / chartWidth * 100}%`,
          width: `${(points.length === 1 ? plotWidth : step / (index === 0 || index === points.length - 1 ? 2 : 1)) / chartWidth * 100}%` }}
        onFocus={() => { dismissedAt.current = null; openBucket(index) }}
        onBlur={event => { if (!(event.relatedTarget instanceof Node) || !tooltipRef.current?.contains(event.relatedTarget)) scheduleClose() }}
        onClick={() => { dismissedAt.current = null; openBucket(index) }} />)}
      </div>
    </div>}
    {getMetrics && <p className="mt-2 text-[0.6875rem] text-muted-2">그래프의 선·점에 마우스를 올리면 구간 상세가 뜹니다. 선·점과 툴팁을 벗어나면 자동으로 닫힙니다. 닫기 또는 Esc로 즉시 닫을 수도 있습니다.</p>}
    {data.granularity === 'day' && <p className="mt-1 text-xs text-muted-2">현재는 일별 집계입니다. 시간별로 확인하려면 조회 기간을 48시간 이하로 줄여 주세요.</p>}
      {point && getMetrics && <div ref={tooltipRef} id={tooltipId} role="dialog" aria-label="시간 구간 툴팁" aria-modal="false"
        className="absolute z-50 rounded-lg border border-line bg-panel shadow-[0_12px_40px_#0006]" style={tooltipStyle}
        onMouseEnter={cancelClose} onMouseLeave={scheduleClose} onFocus={cancelClose}
        onBlur={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) scheduleClose() }}>
        <TokenUsageDetail key={`${data.from}:${data.to}:${jobId}:${point.bucketStart}`} point={point} data={data} jobId={jobId} modelLimit={modelLimit}
          getMetrics={getMetrics} cache={cache.current} onClose={dismiss} />
      </div>}
    <p className="mt-2 text-[0.6875rem] leading-5 text-muted-2">미제공 값·관측 없는 구간은 0으로 보정하지 않습니다. 전체 Token은 입력+출력을 재계산하지 않고 원본 집계를 표시합니다.</p>
    <details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold">시간별 데이터 표 보기 (UTC)</summary><div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left"><thead className="bg-sub text-muted-2"><tr><th className="p-2">구간 시작 UTC</th>{series.map(({ field, label: name }) => <th className="p-2" key={field}>{name}</th>)}</tr></thead><tbody>
        {points.map((point) => <tr key={point.bucketStart} className="border-t border-line-soft"><td className="p-2 font-mono">{point.bucketStart}</td>{series.map(({ field }) => <td className="p-2" key={field}>{shown(point[field])}</td>)}</tr>)}
      </tbody></table>
    </div></details>
  </div>
}

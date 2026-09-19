import { Fragment, useEffect, useState, type ReactNode } from 'react'
import type { AgentSettingsApiClient, InputOptimizationDetail, InputOptimizationHistory, InputOptimizationJob } from './api'
import { panel, secondaryButton, primaryButton, control, PanelTitle, Badge, type Tone } from '../../shared/ui/primitives'
import { describeFailure } from '../../shared/api/error'
import { comparisonIssues, count, delta, rtkSummary, nodeName, tokenMeasurements, type TokenMeasurement } from './inputOptimization'
import './InputOptimizationPanel.css'

type Props = { api: AgentSettingsApiClient; from: string; to: string; jobId: string; mode: 'history' | 'compare'; selected: string[]; onSelect: (ids: string[]) => void; onCompare: () => void; children?: ReactNode }
const td = 'border-t border-line-soft px-3 py-2 align-top'
const reasons: Record<string, string> = {
  selected: '압축본 채택', below_threshold: '작은 결과 · 압축 생략', too_large: '크기 제한 · 원문',
  unsupported_shape: '지원하지 않는 형식 · 원문', information_loss: '정보 보존 실패 · 원문',
  not_smaller: '감량 없음 · 원문', adapter_failure: '압축 실행 오류 · 원문', budget_exceeded: '처리 한도 · 원문',
  extra_retained: '작은 Tool 결과 캐시 유지', folded: '오래된 본문을 안내문으로 접음', elided: '최종 입력 크기 제한으로 접음',
}
function Settings({ job }: { job: InputOptimizationJob }) {
  const nodes = job.settings.nodes?.filter(n => ['coding.code', 'coding.review'].includes(n.handlerKey ?? ''))
  return <div className="io-settings">{nodes?.length ? nodes.map(n => <div key={n.id}><span>{nodeName(job, n.id)}</span><Badge tone={n.config?.rtkSearchEnabled ? 'run' : 'idle'} dot={false}>RTK {n.config?.rtkSearchEnabled ? 'ON' : 'OFF'}</Badge>{n.handlerKey === 'coding.code' && <Badge tone={n.config?.retainSmallToolResults ? 'run' : 'idle'} dot={false}>Tool 결과 캐시 {n.config?.retainSmallToolResults ? 'ON' : 'OFF'}</Badge>}</div>) : '설정 미확인'}</div>
}
const statuses: Record<string, [string, Tone]> = {
  PENDING: ['시작 대기', 'idle'], QUEUED: ['실행 대기', 'idle'], RUNNING: ['진행 중', 'run'],
  WAITING_APPROVAL: ['승인 대기', 'wait'], COMPLETED: ['완료', 'ok'], SUCCEEDED: ['호출 성공', 'ok'],
  FAILED: ['실패', 'fail'], CANCELLED: ['취소됨', 'idle'], EXPIRED: ['만료됨', 'idle'],
}
function Status({ value }: { value: string }) { const [label, tone] = statuses[value] ?? [value, 'idle']; return <span title={value}><Badge tone={tone}>{label}</Badge></span> }
function Review({ value }: { value: string | null }) {
  const label = value === 'passed' ? '✓ 리뷰 통과' : value === 'changes_requested' ? '↻ 수정 요청' : value === 'failed' ? '리뷰 실패' : value ? `리뷰: ${value}` : '리뷰 미확인'
  return <Badge tone={value === 'passed' ? 'ok' : value === 'changes_requested' ? 'wait' : value === 'failed' ? 'fail' : 'idle'} dot={false}>{label}</Badge>
}
function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) { return <div className="io-stat"><dt>{label}</dt><dd>{value}</dd>{note && <small>{note}</small>}</div> }
function Metric({ value, known, calls }: { value: number | null; known: number; calls: number }) { return <span><b className="io-number">{count(value)}</b>{known < calls && <small className="block io-muted">{known > 0 ? '부분 합계 · ' : ''}{known}/{calls}회 수집</small>}</span> }
function Change({ before, after, neutral = false }: { before: number | null; after: number | null; neutral?: boolean }) {
  const available = before != null && after != null
  const direction = !neutral && available && before !== 0 ? after > before ? 'up' : after < before ? 'down' : '' : ''
  return <span className="io-change" data-direction={direction}>{!available ? '비교 불가 · 수집값 없음' : before === 0 ? '증감률 산출 불가 · 기준 0' : delta(before, after, true)}</span>
}
const dateLabel = (value: string) => new Date(value).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function InputOptimizationPanel({ api, from, to, jobId, mode, selected, onSelect, onCompare, children }: Props) {
  const [history, setHistory] = useState<InputOptimizationHistory | null>(null)
  const [details, setDetails] = useState<Record<string, InputOptimizationDetail>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [profile, setProfile] = useState('LLM_OPS')
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setHistory(null); setDetails({}); setError(null); setLoading(true)
    if (!api.listInputOptimizationJobs) { setError('입력 최적화 이력 API가 연결되지 않았습니다.'); setLoading(false); return }
    api.listInputOptimizationJobs(from, to, jobId || undefined, controller.signal).then(data => {
      if (!controller.signal.aborted) setHistory(data)
    }).catch(e => { if (!controller.signal.aborted) setError(describeFailure(e)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [api, from, to, jobId, refresh])

  useEffect(() => {
    const controller = new AbortController()
    const ids = mode === 'compare' ? selected : openId ? [openId] : []
    setDetails({}); setDetailError(null)
    if (!ids.length) { setDetailLoading(false); return }
    if (!api.getInputOptimizationJob) { setDetailLoading(false); setDetailError('호출 상세 API가 연결되지 않았습니다.'); return }
    setDetailLoading(true)
    Promise.all(ids.map(id => api.getInputOptimizationJob!(id, controller.signal))).then(results => {
      if (!controller.signal.aborted) setDetails(Object.fromEntries(results.map(d => [d.job.jobId, d])))
    }).catch(e => { if (!controller.signal.aborted) setDetailError(describeFailure(e)) })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false) })
    return () => controller.abort()
  }, [api, mode, openId, selected, refresh, from, to, jobId])

  const jobs = history?.jobs.filter(j => `${j.request} ${j.jobId}`.toLowerCase().includes(query.toLowerCase())) ?? []
  const a = details[selected[0]], b = details[selected[1]]
  return <section className={`${panel} input-optimization mt-3`} aria-label={mode === 'history' ? '실제 Provider 호출' : '최적화 비교'}>
    <PanelTitle title={mode === 'history' ? '실제 Provider 호출' : '최적화 비교'}><Badge tone="idle">실제 내부 기록 · LLM Ops</Badge></PanelTitle>
    <div className="io-body">
      <p className="io-muted">{mode === 'history' ? '요청 전체 결과를 먼저 보고, 행을 펼쳐 해당 Job의 개별 모델 호출을 확인하세요. 요청 요약·호출 상세는 Job 전체 실행 기준이며 캐시 토큰은 입력 토큰에 포함됩니다.' : '같은 요청의 두 실행을 나란히 확인합니다. 이 화면은 저장된 이력을 조회하며 새 모델 호출을 실행하지 않습니다.'}</p>
      <div className="io-toolbar">
        <label>기능 <select aria-label="이력 기능" value={profile} className={control} onChange={e => setProfile(e.target.value)}><option value="LLM_OPS">LLM Ops</option><option value="NATURAL_CMS">자연어 CMS · 향후 연결</option></select></label>
        {mode === 'history' && <label className="min-w-0 flex-1">요청 검색<input className={control} value={query} placeholder="조회된 요청·Job ID 검색" onChange={e => setQuery(e.target.value)} /></label>}
        <button className={secondaryButton} onClick={() => setRefresh(v => v + 1)} disabled={loading || detailLoading}>이력 새로고침</button>
      </div>
      {error && <p role="alert" className="text-fail-fg">{error}</p>}
      {loading && <p role="status">내부 실행 기록 조회 중…</p>}
      {profile === 'NATURAL_CMS' ? <p>자연어 CMS 최적화 이력은 아직 연결되지 않았습니다. 0건·절감 0%로 해석하지 마세요.</p> : <>
        {mode === 'history' && <>
          <p className="io-muted">조회된 요청 <b>{jobs.length}건</b> · 입력 계측 있음 <b>{jobs.filter(j => j.inputKnown > 0).length}건</b> · 승인 대기 <b>{jobs.filter(j => j.status === 'WAITING_APPROVAL').length}건</b></p>
          <div className="io-selection"><p><b>{selected.length}/2 선택</b> · 먼저 선택한 Job이 기준 A, 두 번째가 후보 B입니다.</p><button className={`${primaryButton} disabled:opacity-45`} disabled={selected.length !== 2} onClick={onCompare}>선택한 두 Job 비교</button></div>
          {history && <p className="io-muted">조회 {dateLabel(history.observedAt)} · 최근 최대 50건{history.truncated ? ' · 기간 또는 Job ID를 좁혀 나머지를 조회하세요.' : ''}</p>}
          <div className="io-scroll"><table className="io-table io-history"><colgroup>{[5, 22, 12, 20, 5, 14, 13, 9].map((width, i) => <col key={i} style={{ width: `${width}%` }} />)}</colgroup><thead><tr>{['비교', '요청 / Job', '실행 상태', '적용 설정', '호출', '토큰 사용량', '입력 중 캐시', '호출 상세'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
            {jobs.map(j => <Fragment key={j.jobId}><tr data-selected={selected.includes(j.jobId)} data-expanded={openId === j.jobId}>
              <td className={td}><input type="checkbox" aria-label={`비교 선택 ${j.jobId}`} checked={selected.includes(j.jobId)} disabled={!selected.includes(j.jobId) && selected.length === 2} onChange={e => onSelect(e.target.checked ? [...selected, j.jobId] : selected.filter(id => id !== j.jobId))} /> {selected.includes(j.jobId) ? selected.indexOf(j.jobId) === 0 ? 'A' : 'B' : ''}</td>
              <td><button className="io-request" aria-label={j.request || '요청 미수집'} aria-expanded={openId === j.jobId} aria-controls={`provider-calls-${j.jobId}`} onClick={() => setOpenId(openId === j.jobId ? null : j.jobId)}><span>{j.request || '요청 미수집'}</span></button><div className="io-meta"><span title={j.jobId}>Job {j.jobId.slice(0, 8)}…</span> · <time title={j.createdAt}>{dateLabel(j.createdAt)}</time></div></td>
              <td><Status value={j.status} /><p className="my-2 font-semibold" title={j.stage}>{nodeName(j, j.stage)}</p><Review value={j.reviewResult} /></td>
              <td><b>Snapshot v{j.profileVersion}</b><Settings job={j} /></td>
              <td className="io-number">{j.calls}</td>
              <td><div className="io-metric-line"><span>입력</span><Metric value={j.inputTokens} known={j.inputKnown} calls={j.calls} /></div><div className="io-metric-line"><span>출력</span><Metric value={j.outputTokens} known={j.outputKnown} calls={j.calls} /></div></td>
              <td><Metric value={j.cachedInputTokens} known={j.cacheKnown} calls={j.calls} /><p className="io-meta">{j.cacheKnown === 0 ? '캐시 여부 미수집' : `캐시 적중 ${j.cacheHits}/${j.cacheKnown}호출`}</p></td>
              <td><button type="button" className={secondaryButton} aria-label={`호출 상세 ${j.jobId}`} aria-expanded={openId === j.jobId} aria-controls={`provider-calls-${j.jobId}`} onClick={() => setOpenId(openId === j.jobId ? null : j.jobId)}>{openId === j.jobId ? '접기 ↑' : '펼치기 ↓'}</button></td>
            </tr><tr id={`provider-calls-${j.jobId}`} hidden={openId !== j.jobId} className="io-expanded-row"><td colSpan={8}>
              {openId === j.jobId && (detailError ? <div role="alert">{detailError} <button className={secondaryButton} onClick={() => setRefresh(v => v + 1)}>상세 다시 조회</button></div> : detailLoading || !details[j.jobId] ? <p role="status">호출 상세 조회 중…</p> : <JobDetail detail={details[j.jobId]} inline />)}
            </td></tr></Fragment>)}
          </tbody></table></div>
          {!loading && !jobs.length && history && <p>조회 조건에 해당하는 LLM Ops Job이 없습니다.</p>}
        </>}
        {mode === 'compare' && (selected.length !== 2 ? <p>Provider 계측의 요청 이력에서 기준 A와 후보 B를 선택하세요.</p> : detailError ? <p role="alert">{detailError}</p> : detailLoading ? <p role="status">비교 기록 조회 중…</p> : a && b ? <Comparison a={a} b={b} swap={() => onSelect([selected[1], selected[0]])} /> : <p>선택한 Job의 기록을 확인하고 있습니다.</p>)}
      </>}
      {mode === 'history' && children}
      <details className="rounded border border-line-soft p-3"><summary className="cursor-pointer font-semibold">향후 확장 · 목업</summary><p className="my-2 text-muted-2">아래 항목은 구상 단계이며 실행 설정에 반영되지 않습니다.</p><div className="flex flex-wrap gap-2">{['Tool 결과 캐시 유지량·유지 턴 세부 조절', 'MD 지침 편집·버전 관리', '자동 실험·최적화 에이전트'].map(name => <button key={name} disabled className={`${secondaryButton} opacity-50`}>{name} · 준비 중</button>)}</div></details>
    </div>
  </section>
}

function JobDetail({ detail, inline = false }: { detail: InputOptimizationDetail; inline?: boolean }) {
  const s = rtkSummary(detail)
  const maxInput = Math.max(1, ...detail.calls.map(c => c.inputTokens ?? 0))
  return <section aria-label={`Job 상세 ${detail.job.jobId}`} className="io-detail">
    <div><h3 className="io-heading">{inline ? '이 요청에서 발생한 Provider 호출' : '호출 순서와 입력 처리 상세'}</h3><p className="io-meta">Job {detail.job.jobId} · Snapshot v{detail.job.profileVersion} · 호출 {detail.calls.length}건{detail.truncated ? ' (처음 500건)' : ''} · 오래된 순</p></div>
    <details><summary>사용자 요청 원문</summary><p className="mt-2 leading-relaxed">{detail.job.request ?? '미수집'}</p></details>
    <div className="overflow-x-auto"><table className="io-table min-w-[760px]"><thead><tr>{['순서 / 노드', '모델 / 상태', '입력 / 출력', '입력 중 캐시', '처리 내역'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{detail.calls.map((c, i) => <tr key={c.callId}>
      <td className={td}><b title={c.nodeId}>{i + 1} · {nodeName(detail.job, c.nodeId)}</b><p className="io-meta">실행 {c.pipelineAttempt}/{c.executionAttempt} · 호출 시도 {c.providerAttempt}</p></td>
      <td className={td}><b>{c.model}</b><p className="io-meta">{c.provider}</p><p className="my-1"><Status value={c.status} /></p>{c.errorCode && <p className="text-fail-fg break-all">{c.errorCode}</p>}<p className="io-muted">{c.finishedAt ? `${((Date.parse(c.finishedAt) - Date.parse(c.startedAt)) / 1000).toFixed(1)}초` : '종료 기록 없음'}</p></td>
      <td className={td}>{count(c.inputTokens)} / {count(c.outputTokens)}</td><td className={td}>{c.cachedInputTokens == null ? '미수집·확인 불가' : c.cachedInputTokens === 0 ? '0 · 캐시 사용 없음' : count(c.cachedInputTokens)}</td>
      <td className={`${td} max-w-96`}><details><summary>{c.inputProcessing ? `RTK ${c.inputProcessing.rtkEnabled ? 'ON' : 'OFF'} / Tool 결과 캐시 ${c.inputProcessing.retentionEnabled ? 'ON' : 'OFF'} · ${c.inputProcessing.decisions.length}건` : '처리 기록 미수집'} · 펼치기</summary><p className="my-2 break-all io-muted">호출 {c.callId}<br />Trace {c.observationTraceId ?? '미연결'}</p>{c.inputProcessing?.decisions.map((d, index) => <div key={index} className="mb-2 rounded border border-line-soft bg-sub p-2"><Badge tone={d.reason === 'selected' ? 'run' : d.reason === 'adapter_failure' ? 'fail' : 'idle'} dot={false}>{reasons[d.reason] ?? d.reason}</Badge><p className="mt-1 font-semibold">{d.tool} · {count(d.beforeBytes)} → {count(d.afterBytes)} bytes{d.operation === 'RTK' && d.beforeBytes > 0 ? ` · ${((1 - d.afterBytes / d.beforeBytes) * 100).toFixed(1)}% 감량` : ''}</p><p className="break-all io-meta">결과 {d.toolCallId} · {d.firstProcessing ? '이번 처리' : '재사용·반복 유지'}</p></div>)}</details></td>
    </tr>)}</tbody></table></div>
    {!detail.calls.length && <p>이 Job에 기록된 Provider 호출이 없습니다.</p>}
    <details open={inline ? undefined : true}><summary className="font-semibold">RTK·Tool 결과 캐시 요약과 입력 토큰 추이</summary><div className="io-diagnostics">
    <dl className="io-stats"><Stat label="RTK 실행 / 채택" value={s.measured ? `${s.attempts} / ${s.selected}회` : '미수집'} note={s.attempts ? `채택률 ${(s.selected / s.attempts * 100).toFixed(1)}%` : '실제 압축 실행 기준'} /><Stat label="채택 원문 → 압축본" value={s.measured ? `${count(s.before)} → ${count(s.after)}` : '미수집'} note="바이트 기준 · 토큰 절감률과 다름" /><Stat label="Tool 결과 캐시 유지" value={s.measured ? `${s.retained}회` : '미수집'} note={s.measured ? `오래된 본문 접기 ${s.folded}회 · 최종 크기 제한 접기 ${s.budgetFolded}회` : 'Tool 결과 처리 기록'} /></dl>
    <p className="io-muted">{s.measured ? `압축본 입력 포함 ${s.inclusions}회. ` : ''}같은 결과의 반복 포함과 새로운 압축 실행은 별개입니다. 필요한 캐시·불필요한 캐시는 자동 판정하지 않습니다.</p>
    {detail.truncated && <p className="text-fail-fg">호출 상세는 처음 500건입니다. 압축·Tool 결과 캐시 요약과 그래프는 일부 기록 기준입니다.</p>}
    <p className="io-muted">호출 순서 → · 입력 토큰 0–{detail.calls.some(c => c.inputTokens != null) ? count(maxInput) : '미수집'} · 미수집은 × · 정확한 값은 위 호출 표에서 확인</p>
    <div className="overflow-x-auto"><svg viewBox="0 0 720 135" role="img" aria-label="호출 순서별 입력 토큰 그래프" className="min-w-[360px] w-full max-h-40 rounded bg-sub">
      {detail.calls.map((c, i) => { const width = 680 / Math.max(1, detail.calls.length); const h = (c.inputTokens ?? 0) / maxInput * 88; return <g key={c.callId}><title>{i + 1}회 · {nodeName(detail.job, c.nodeId)}: {count(c.inputTokens)}</title>{c.inputTokens == null ? <text x={25 + i * width} y="114" className="io-chart-missing" fontSize="16">×</text> : <rect x={25 + i * width} y={116 - h} width={Math.max(1, width - 2)} height={Math.max(1, h)} className="io-chart" />}</g> })}
    </svg></div>

    </div></details>
  </section>
}

function TokenComparison({ a, b, average }: { a: InputOptimizationDetail; b: InputOptimizationDetail; average: boolean }) {
  const measurements = [tokenMeasurements(a), tokenMeasurements(b)]
  const fields = [
    ['input', '입력 토큰'], ['output', '출력 토큰'], ['total', '전체 토큰 (입력 + 출력)'],
    ['cached', '입력 중 캐시'], ['uncached', '미캐시 입력 토큰'],
  ] as const
  const title = average ? '호출당 평균 비교' : '작업 전체 사용량 비교'
  const value = (m: TokenMeasurement) => average ? m.mean : m.sum
  const formatted = (m: TokenMeasurement) => {
    const v = value(m)
    return v == null ? '미수집' : v.toLocaleString('ko-KR', { maximumFractionDigits: average ? 1 : 0 })
  }
  return <section aria-label={title} className="io-comparison">
    <h3 className="io-heading">{title}</h3>
    <p className="io-muted mb-3">{average
      ? '수집된 토큰 합계 ÷ 해당 항목이 수집된 호출 수입니다. 호출 수가 달라도 비교하며, 미수집 호출은 평균에서 제외합니다.'
      : '각 Job에서 지금까지 수집된 사용량의 합계입니다. 부분 합계에는 미수집 호출의 사용량이 포함되지 않습니다.'}</p>
    <div className="io-scroll"><table className="io-table min-w-[560px]"><thead><tr>{['항목', '기준 A', '후보 B', average ? '평균 증감' : '합계 증감'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
      {fields.map(([key, label]) => {
        const [before, after] = measurements.map(m => m[key])
        const partial = [before, after].some(m => m.known < m.calls || m.limited)
        return <tr key={key}><td className="font-semibold">{label}</td>{[before, after].map((m, i) => <td key={i}>
          <b className="io-number">{formatted(m)}{average && value(m) != null && <small className="font-normal"> 토큰/회</small>}</b>
          <p className="io-meta">{m.known}/{m.calls}회 수집{m.known > 0 && m.known < m.calls ? average ? ' · 부분 계측' : ' · 부분 합계' : ''}{m.limited ? ' · 상세 조회 범위 내' : ''}</p>
        </td>)}<td><Change before={value(before)} after={value(after)} neutral={key === 'cached'} />
          {partial && value(before) != null && value(after) != null && <p className="io-meta">부분 계측 기준</p>}
        </td></tr>
      })}
      {!average && <>
        <tr><td className="font-semibold">Provider 호출</td><td className="io-number">{a.job.calls}</td><td className="io-number">{b.job.calls}</td><td><Change before={a.job.calls} after={b.job.calls} /></td></tr>
        <tr><td>캐시 적중 호출</td>{[a,b].map(d => <td key={d.job.jobId}>{d.job.cacheKnown ? `${d.job.cacheHits} / ${d.job.cacheKnown}회 확인` : '미수집'}<p className="io-meta">전체 {d.job.calls}회 중 캐시 값 {d.job.cacheKnown}회 수집</p></td>)}<td className="io-muted">캐시 토큰이 양수인 호출</td></tr>
      </>}
    </tbody></table></div>
    <p className="mt-3 io-muted">전체 토큰은 입력·출력이 함께 수집된 호출, 미캐시 입력은 입력·캐시가 함께 수집된 호출 기준입니다. 캐시는 입력에 포함됩니다.{average ? ' 호출 구성에 따라 평균이 달라질 수 있습니다.' : ' 호출 수는 실패·재시도를 포함합니다.'}</p>
  </section>
}

function Comparison({ a, b, swap }: { a: InputOptimizationDetail; b: InputOptimizationDetail; swap: () => void }) {
  const issues = comparisonIssues(a.job, b.job)
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="io-heading">기준 A → 후보 B</h3><button className={secondaryButton} onClick={swap}>A·B 바꾸기</button></div>
    <div className="io-pair">{[a, b].map((d, i) => <div key={d.job.jobId} className="io-candidate" data-side={i ? 'b' : 'a'}><h4>{i === 0 ? '기준 A' : '후보 B'} · v{d.job.profileVersion}<Status value={d.job.status} /></h4><p className="my-3 leading-relaxed">{d.job.request}</p><Settings job={d.job} /><div className="mt-3 flex flex-wrap items-center gap-2"><b>{nodeName(d.job, d.job.stage)}</b><Review value={d.job.reviewResult} /></div><details className="mt-3"><summary className="cursor-pointer text-link">적용 조건 상세</summary><p className="io-meta">Job {d.job.jobId}<br />초기 SHA {d.job.baseSha ?? '미확인'}</p><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(d.job.settings, null, 2)}</pre></details></div>)}</div>
    <div className="io-notice" data-tone="wait"><b>절감 판정 보류 · 확인된 수치 차이만 표시</b><ul className="mt-2 list-disc pl-5">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul><p className="mt-2">현재 OFF 실행은 작업 전 코드를 대신하지 않습니다. 비용은 미수집이며 캐시 증가만으로 개선을 판정하지 않습니다.</p></div>
    <p className="io-muted">↑ 증가 · ↓ 감소 · 색상은 수치의 방향입니다. 품질 유지와 비용 절감의 판정은 별도입니다.</p>
    <TokenComparison a={a} b={b} average />
    <TokenComparison a={a} b={b} average={false} />
    <ProcessingComparison a={a} b={b} />
    {[a,b].map((d,i) => <details className="rounded border border-line p-3" key={d.job.jobId}><summary className="cursor-pointer font-semibold text-link">{i ? '후보 B' : '기준 A'} 호출 상세 · {d.calls.length}회 펼치기</summary><div className="mt-3"><JobDetail detail={d} /></div></details>)}
  </div>
}

function ProcessingComparison({ a, b }: { a: InputOptimizationDetail; b: InputOptimizationDetail }) {
  const summaries = [rtkSummary(a), rtkSummary(b)]
  const byteView = (s: ReturnType<typeof rtkSummary>) => !s.attempts ? '압축 실행 없음' : `${count(s.attemptedBefore)} → ${count(s.attemptedAfter)} bytes · ${((1 - s.attemptedAfter / s.attemptedBefore) * 100).toFixed(1)}% 감소`
  const metrics: [string, (s: ReturnType<typeof rtkSummary>) => string][] = [
    ['RTK 실행 / 채택', s => `${s.attempts}회 / ${s.selected}회${s.attempts ? ` · 채택률 ${(s.selected / s.attempts * 100).toFixed(1)}%` : ''}`],
    ['압축 시도 결과 전체 크기', byteView],
    ['원문 사용·압축 생략 사유', s => Object.entries(s.fallbacks).map(([reason, n]) => `${reasons[reason] ?? reason} ${n}회`).join(' · ') || '해당 없음'],
    ['후속 입력에 압축본 포함', s => `${s.inclusions}회 · 신규 압축과 별개`],
    ['작은 Tool 결과 캐시', s => `${s.retained}회 · 유지 결정 기준`],
    ['본문 접기', s => `오래된 결과 ${s.folded}회 / 최종 크기 제한 ${s.budgetFolded}회`],
  ]
  return <section aria-label="입력 처리 비교"><h3 className="io-heading">어디서 달라졌나요?</h3><div className="io-scroll"><table className="io-table min-w-[560px]"><thead><tr><th>모델 입력 처리</th><th>기준 A</th><th>후보 B</th></tr></thead><tbody>{metrics.map(([label, render]) => <tr key={label}><td className="font-semibold">{label}</td>{summaries.map((s,i) => <td key={i}>{s.measured ? render(s) : '미수집'}{s.truncated && ' (일부 기록)'}</td>)}</tr>)}</tbody></table></div><p className="mt-2 io-muted">RTK 감소율은 본문 바이트 기준입니다. Tool 결과 캐시는 Provider 입력 캐시 적중과 다르며, 유지 횟수만으로 유용성을 판단하지 않습니다.</p></section>
}

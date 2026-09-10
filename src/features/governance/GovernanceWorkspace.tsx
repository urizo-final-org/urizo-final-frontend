import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { describeFailure } from '../../shared/api/error'
import type { AdminRole } from '../../shared/api/session'
import { Badge, PageHead, panel, control, secondaryButton } from '../../shared/ui/primitives'
import { monitoringJobHref } from '../orchestration/ActiveJobMonitoringLink'
import type { ApprovalDomain, HistoryClient, HistoryEntry, HistoryPage, RunCategory } from './api'

const domains: Record<string, string> = { RAG: 'RAG', LLM_OPS: 'LLM Ops', NATURAL_CMS: '자연어 CMS', CMS: '직접 CMS' }
const approvalTabs = [{ id: 'RAG', label: 'RAG' }, { id: 'LLM_OPS', label: 'LLM Ops' }, { id: 'NATURAL_CMS', label: '자연어 CMS' }]
const runTabs = [{ id: 'ALL', label: '전체' }, { id: 'CMS', label: 'CMS 변경' }, { id: 'AI', label: 'AI 실행' }]
const coverage: Record<string, string> = { VERSION_STATE: '버전 활성화 상태 · 전체 승인 로그 아님', LATEST_ONLY: '현재 보존된 마지막 승인 정보 · 전체 이력 아님', DECISION_RECORD: '승인 결정 기록', CHANGE_RECORD: '직접 CMS 변경 기록', JOB_STATE: 'Job 현재 상태' }
const states: Record<string, string> = { APPROVED: '승인', REJECTED: '반려', APPROVAL_PENDING: '승인 대기', WAITING_APPROVAL: '승인 대기', ACTIVE: '활성', ARCHIVED: '보관', SUCCEEDED: '성공', COMPLETED: '완료', FAILED: '실패', CANCELLED: '취소', CANCELED: '취소', RUNNING: '실행 중', QUEUED: '대기' }
const time = (value: string | null) => value ? new Date(value).toLocaleString('ko-KR') : 'UNKNOWN'
const value = (input: string | number | null) => input ?? 'UNKNOWN'

export default function GovernanceWorkspace(props: { route: 'approvals' | 'runs'; api: HistoryClient; role: AdminRole }) {
  return <HistoryScreen key={props.route} {...props} />
}

function HistoryScreen({ route, api, role }: { route: 'approvals' | 'runs'; api: HistoryClient; role: AdminRole }) {
  const approvals = route === 'approvals'
  const tabs = approvals ? approvalTabs : runTabs
  const [tab, setTab] = useState(tabs[0].id)
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [revision, setRevision] = useState(0)
  const [page, setPage] = useState<HistoryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  const [selected, setSelected] = useState<HistoryEntry | null>(null)
  const cursor = cursors[cursors.length - 1]

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true); setPage(null); setSelected(null); setFailure(null)
    const options = { query, cursor, signal: controller.signal }
    const request = approvals ? api.approvals(tab as ApprovalDomain, options) : api.runs(tab as RunCategory, options)
    request.then((result) => { if (active) setPage(result) })
      .catch((error) => { if (active) setFailure(describeFailure(error)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [api, approvals, tab, query, cursor, revision])

  function chooseTab(id: string) { setTab(id); setCursors([undefined]); setSelected(null); setPage(null) }
  function search(event: FormEvent) { event.preventDefault(); setQuery(draft.trim()); setCursors([undefined]); setRevision((n) => n + 1) }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
    if (next === null) return
    event.preventDefault(); chooseTab(tabs[next].id)
    document.getElementById(`history-tab-${tabs[next].id}`)?.focus()
  }

  return <>
    <PageHead title={approvals ? '승인 내역' : '실행 이력'} description={approvals ? '기능별 승인 정보를 조회합니다. 승인·반려는 각 기능 메뉴에서 처리합니다.' : '직접 CMS 변경과 AI Job을 구분하여 조회합니다. 상태는 조회 시점의 원본 값입니다.'}>
      <Badge tone="idle" dot={false}>조회 전용</Badge>
      <button type="button" className={secondaryButton} disabled={loading} onClick={() => { setCursors([undefined]); setRevision((n) => n + 1) }}>새로고침</button>
    </PageHead>
    <section className={panel}>
      <div role="tablist" aria-label={approvals ? '승인 내역 구분' : '실행 이력 구분'} className="flex gap-2 border-b border-line-soft p-3">
        {tabs.map((item, index) => <button key={item.id} id={`history-tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls="history-panel" tabIndex={tab === item.id ? 0 : -1} onKeyDown={(event) => keyboard(event, index)} onClick={() => chooseTab(item.id)} className={`${secondaryButton} ${tab === item.id ? 'bg-sub ring-1 ring-accent' : ''}`}>{item.label}</button>)}
      </div>
      <div id="history-panel" role="tabpanel" aria-labelledby={`history-tab-${tab}`} className="p-4">
        <p className="mb-3 text-xs leading-5 text-muted-2">{approvals
          ? tab === 'RAG' ? 'RAG는 현재 저장된 버전 활성화 상태를 표시합니다. 처리자·전체 승인 변경 로그는 제공되지 않습니다.'
            : tab === 'NATURAL_CMS' ? '자연어 CMS는 현재 보존된 마지막 승인 정보만 표시합니다. 재시도 시 이전 정보가 사라질 수 있으며 승인 시각은 추정하지 않습니다.'
              : 'LLM Ops에 저장된 승인 결정 기록입니다. 결정 당시 상태와 현재 Job 상태는 다를 수 있습니다.'
          : 'CMS 변경은 이 기능 적용 이후 성공한 관리자 직접 변경만 기록합니다. 과거 데이터는 복원하지 않으며 자연어 CMS 실행은 AI Job으로만 표시합니다.'}</p>
        <form className="mb-4 flex flex-wrap gap-2" onSubmit={search}>
          <input aria-label="이력 검색" placeholder="제목 · 대상 ID · Job ID · 상태 검색" maxLength={200} className={`${control} min-w-64 flex-1`} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <button className={secondaryButton} disabled={loading}>검색</button>
        </form>
        {loading && <p role="status" className="py-8 text-center text-sm text-muted-2">이력을 불러오는 중입니다…</p>}
        {failure && <p role="alert" className="py-4 text-sm text-fail-fg">이력 조회 실패: {failure}</p>}
        {page && <>
          <p className="mb-2 text-xs text-muted-2">조회 시각 {time(page.observedAt)} · 현재 페이지 {page.items.length}건</p>
          {page.items.length === 0 ? <p className="py-8 text-center text-sm text-muted-2">조회 조건에 해당하는 이력이 없습니다.</p> : <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="bg-sub text-muted-2"><tr>{['구분 / 유형', '대상', '상태', approvals ? '결정 / 활성화 시각' : '생성 시각', '상세'].map((label) => <th key={label} scope="col" className="px-3 py-2">{label}</th>)}</tr></thead>
              <tbody>{page.items.map((item) => <tr key={item.id} className="border-b border-line-soft">
                <td className="px-3 py-3">{domains[item.domain] ?? item.domain}<small className="mt-1 block text-muted-2">{item.kind}</small></td>
                <td className="max-w-80 break-words px-3 py-3">{item.title}<small className="mt-1 block font-mono text-muted-2">{item.jobId ?? `${item.targetType} #${value(item.targetId)}`}</small></td>
                <td className="px-3 py-3">{states[item.status] ?? item.status}<small className="block text-muted-2">{item.status}</small></td>
                <td className="px-3 py-3">{time(approvals ? item.occurredAt : item.createdAt)}</td>
                <td className="px-3 py-3"><button className={secondaryButton} aria-label={`${item.title} 상세`} aria-expanded={selected?.id === item.id} onClick={() => setSelected(item)}>상세</button></td>
              </tr>)}</tbody>
            </table>
          </div>}
          <div className="mt-4 flex items-center justify-end gap-3 text-xs">
            <button className={secondaryButton} disabled={cursors.length === 1} onClick={() => setCursors((list) => list.slice(0, -1))}>이전</button>
            <span>{cursors.length} 페이지</span>
            <button className={secondaryButton} disabled={!page.nextCursor} onClick={() => { if (page.nextCursor) setCursors((list) => [...list, page.nextCursor!]) }}>다음</button>
          </div>
        </>}
      </div>
    </section>
    {selected && <Detail entry={selected} role={role} close={() => setSelected(null)} />}
  </>
}

function Detail({ entry, role, close }: { entry: HistoryEntry; role: AdminRole; close: () => void }) {
  const fields: [string, string | number | null][] = [
    ['기록 ID', entry.id], ['데이터 범위', coverage[entry.coverage] ?? entry.coverage],
    ['대상', `${entry.targetType} #${value(entry.targetId)}`], ['Job ID', entry.jobId],
    ['기록 상태', entry.status], ['현재 Job 상태', entry.jobStatus], ['단계', entry.stage],
    ['시도', entry.attempt], ['상태 버전', entry.stateVersion],
    ['처리자', entry.actorName ?? entry.actorId], ['처리자 역할', entry.actorRole],
    ['생성 시각', time(entry.createdAt)], ['결정 / 변경 시각', time(entry.occurredAt)],
    ['시작 시각', time(entry.startedAt)], ['수정 시각', time(entry.updatedAt)], ['종료 시각', time(entry.finishedAt)],
    ['의견', entry.feedback], ['오류 코드', entry.errorCode],
  ]
  const href = entry.domain === 'RAG' ? '/admin/rag' : entry.domain === 'LLM_OPS' ? '/admin/llm-devops'
    : ({ MENU: '/admin/menus', CONTENT: '/admin/contents', BOARD: '/admin/boards', POST: '/admin/boards', TEMPLATE: '/admin/templates' }[entry.targetType.toUpperCase()] ?? '/admin/contents')
  return <section aria-label="이력 상세" className={`${panel} mt-4 p-4`}>
    <div className="mb-4 flex items-start justify-between gap-4"><h2 className="text-sm font-semibold">{entry.title}</h2><button className={secondaryButton} onClick={close}>상세 닫기</button></div>
    <dl className="grid gap-3 text-xs sm:grid-cols-2">{fields.map(([label, text]) => <div key={label}><dt className="mb-1 text-muted-2">{label}</dt><dd className="whitespace-pre-wrap break-words">{value(text)}</dd></div>)}</dl>
    <div className="mt-4 flex flex-wrap gap-2"><Link className={secondaryButton} to={href}>원래 기능으로 이동</Link>
      {role === 'SUPER_ADMIN' && entry.jobId && (entry.domain === 'LLM_OPS' || entry.domain === 'NATURAL_CMS') && <Link className={secondaryButton} to={monitoringJobHref(entry.jobId)}>Node · Tool · 재시도 모니터링</Link>}
    </div>
    {entry.jobId && <p className="mt-2 text-xs text-muted-2">원래 기능에서 Job ID로 대상을 확인하세요. 모니터링 상세는 최고관리자 권한과 해당 Job의 모니터링 기록이 필요합니다.</p>}
  </section>
}

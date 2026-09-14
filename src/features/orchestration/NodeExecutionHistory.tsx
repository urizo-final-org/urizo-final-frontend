import type { MonitoringNodeOccurrence } from './api'

const states = { RUNNING: '진행 중', WAITING_APPROVAL: '승인 대기', COMPLETED: '완료', FAILED: '실패' }
export default function NodeExecutionHistory({ occurrences, truncated, domainTerminal }: {
  occurrences: MonitoringNodeOccurrence[]; truncated: boolean; domainTerminal: boolean
}) {
  const ordered = [...occurrences].sort((a, b) => b.pipelineAttempt - a.pipelineAttempt || b.executionAttempt - a.executionAttempt || b.nodeSequence - a.nodeSequence)
  return <section aria-label="Node occurrence 이력" className="rounded-md border border-line-soft bg-sub p-3">
    <b>노드 실행·오류 이력</b>
    <p className="mt-1 text-muted-2">서버에 저장된 시각·상태·오류 코드입니다. 로그 원문·모델 응답은 수집하거나 표시하지 않습니다.</p>
    {truncated && <p className="mt-2 text-wait-fg">일부 과거 이력은 잘렸으며 최신 Node 상태는 유지됩니다.</p>}
    {domainTerminal && <p className="mt-2 text-muted-2">종료된 Job의 마지막 기록입니다. Node에 승인 대기·진행 중이 남아 있어도 현재 실행 중이라는 뜻은 아닙니다.</p>}
    {ordered.length === 0 ? <p className="mt-2 text-muted-2">기록 없음</p> : <ol className="mt-3 max-h-[30rem] space-y-3 overflow-y-auto">
      {ordered.map((item) => {
        const events = [
          { at: item.startedAt, label: '실행 시작' }, { at: item.waitingAt, label: '승인 대기 진입' },
          { at: item.completedAt, label: '실행 완료' }, { at: item.failedAt, label: '실행 실패' },
        ].filter((event): event is { at: string; label: string } => event.at !== null)
          .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
        return <li key={`${item.pipelineAttempt}:${item.executionAttempt}:${item.nodeSequence}`} className="rounded-md border border-line-soft bg-panel p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><b className={item.status === 'FAILED' ? 'text-fail-fg' : ''}>{states[item.status]}</b><span>Pipeline {item.pipelineAttempt} · Attempt {item.executionAttempt} · Sequence {item.nodeSequence}</span></div>
          {item.errorCode && <div className="mt-2 rounded border border-fail-fg/40 bg-fail-bg p-2 text-fail-fg"><b>실패 코드</b><code className="mt-1 block break-all select-text">{item.errorCode}</code></div>}
          {events.length === 0 ? <p className="mt-2 text-muted-2">전이 시각 미제공</p> : <ol className="my-3 space-y-2 border-l border-line pl-3" aria-label={`Sequence ${item.nodeSequence} 전이 시각`}>
            {events.map((event) => <li key={event.label}><span className="block">{event.label}</span><time dateTime={event.at} className="break-all font-mono text-muted-2">{event.at}</time></li>)}
          </ol>}
          <details className="mt-2"><summary className="cursor-pointer text-muted-2">추적 식별자·마지막 보고</summary>
            <dl className="mt-2 space-y-1 break-all font-mono"><dt>Handler</dt><dd>{item.handlerKey}</dd><dt>Job Trace ID</dt><dd className="select-text">{item.traceId}</dd><dt>관측 Trace ID</dt><dd className="select-text">{item.observationTraceId ?? '미제공'}</dd><dt>마지막 보고 UTC</dt><dd>{item.lastUpdatedAt}</dd></dl>
          </details>
        </li>
      })}
    </ol>}
  </section>
}

import type { MonitoringJobSnapshotResponse, MonitoringLatestNodeState, MonitoringModelCall, ProfileModelBinding } from './api'

export function nodeModelCalls(snapshot: MonitoringJobSnapshotResponse, node?: MonitoringLatestNodeState | null) {
  if (!node || snapshot.modelCalls?.status !== 'AVAILABLE') return []
  return snapshot.modelCalls.calls.filter((call) => call.nodeId === node.nodeId
    && call.pipelineAttempt === node.pipelineAttempt && call.executionAttempt === node.executionAttempt
    && call.nodeSequence === node.nodeSequence).sort((a, b) => a.callOrder - b.callOrder)
}

function statusLabel(call: MonitoringModelCall, active: boolean) {
  return call.status === 'SUCCEEDED' ? '호출 성공' : call.status === 'FAILED' ? '호출 실패'
    : active ? '호출 중' : '결과 미확인'
}

export function modelCallLabel(snapshot: MonitoringJobSnapshotResponse, node?: MonitoringLatestNodeState) {
  const calls = nodeModelCalls(snapshot, node)
  const last = calls.at(-1)
  if (last) return `${last.model} · ${statusLabel(last, !snapshot.job.domainTerminal && node?.status === 'RUNNING')}`
  if (node?.status === 'NOT_STARTED') return '모델 호출 전'
  return snapshot.modelCalls?.status === 'AVAILABLE' ? '실제 모델 기록 없음' : '실제 모델 기록 미제공'
}

const failureLabels: Record<string, string> = {
  MODEL_NOT_CONFIGURED: '인증·크레딧·모델 설정 오류',
  MODEL_RATE_LIMITED: '호출 한도 초과', MODEL_TIMEOUT: '응답 시간 초과',
  MODEL_PROVIDER_UNAVAILABLE: '제공사 사용 불가', INTERNAL_TRANSIENT_ERROR: '일시적 호출 오류',
  MODEL_RESPONSE_INVALID: '유효하지 않은 모델 응답',
}

function groupModelCalls(calls: MonitoringModelCall[]) {
  const groups = new Map<string, { calls: MonitoringModelCall[]; switches: string[]; retries: number }>()
  const previousByTurn = new Map<string, MonitoringModelCall>()
  for (const call of calls) {
    const key = JSON.stringify([call.provider, call.model])
    let group = groups.get(key)
    if (!group) {
      group = { calls: [], switches: [], retries: 0 }
      groups.set(key, group)
    }
    const previous = previousByTurn.get(call.turnId)
    if (previous?.status === 'FAILED') {
      if (previous.provider !== call.provider || previous.model !== call.model) {
        group.switches.push(failureLabels[previous.errorCode ?? ''] ?? previous.errorCode ?? '이전 호출 실패')
      } else {
        group.retries += 1
      }
    }
    group.calls.push(call)
    previousByTurn.set(call.turnId, call)
  }
  return Array.from(groups.values())
}

function countedLabels(labels: string[]) {
  const counts = new Map<string, number>()
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1)
  return Array.from(counts, ([label, count]) => `${label} ${count}회`).join(' · ')
}

export default function NodeModelActivity({ snapshot, node, binding }: {
  snapshot: MonitoringJobSnapshotResponse; node: MonitoringLatestNodeState; binding?: ProfileModelBinding
}) {
  const calls = nodeModelCalls(snapshot, node)
  const last = calls.at(-1)
  const active = !snapshot.job.domainTerminal && node.status === 'RUNNING'
  const configuredModel = (id: string) => binding?.selections?.[id]?.model ?? id
  return <section aria-label="실제 모델 및 전환 이력" className="rounded-md border border-line-soft bg-sub p-3">
    <b>실제 모델 · 전환 이력</b>
    {last ? <div className="mt-2 break-words">
      <p className="text-sm font-semibold text-body">{last.model}</p>
      <p className="mt-1 text-muted-2">{last.provider} · {statusLabel(last, active)}</p>
    </div> : <p className="mt-2 text-muted-2">{node.nodeType !== 'agent' ? '모델을 직접 호출하는 노드가 아닙니다.'
      : node.status === 'NOT_STARTED' ? '아직 모델을 호출하지 않았습니다.'
        : snapshot.modelCalls?.status !== 'AVAILABLE' ? '실제 모델 호출 기록을 조회할 수 없습니다.'
          : '저장된 호출 기록이 없습니다. 보완 전 실행 또는 기록 누락은 설정값으로 추정하지 않습니다.'}</p>}
    {snapshot.modelCalls?.truncated && <p className="mt-2 text-wait-fg">최근 호출만 표시합니다. 이전 호출·전환 이력이 누락될 수 있습니다.</p>}
    {calls.length > 0 && <ul className="mt-3 space-y-2" aria-label="모델별 호출 요약">
      {groupModelCalls(calls).map((group) => {
        const call = group.calls[0]!
        const errors = group.calls.filter((item) => item.errorCode).map((item) => `${failureLabels[item.errorCode!] ?? '모델 호출 오류'} · ${item.errorCode}`)
        return <li key={call.callId} className="break-words rounded border border-line-soft p-2">
          {group.switches.length > 0 && <p className="mb-1 font-semibold text-wait-fg">대체 모델로 전환 · {countedLabels(group.switches)}</p>}
          {group.retries > 0 && <p className="mb-1 text-wait-fg"><span>동일 모델 재시도</span> · {group.retries}회</p>}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1"><b className="break-all">{call.model}</b><p className="mt-1 text-muted-2">{call.provider}</p></div>
            <span role="img" aria-label={`호출 ${group.calls.length}회`} className="flex h-11 min-w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-teal-ink/15 bg-teal-bg/60 px-2 text-teal-ink">
              <strong aria-hidden="true" className="text-xl font-semibold leading-5 tracking-tight tabular-nums">{group.calls.length}</strong>
              <span aria-hidden="true" className="text-[0.625rem] font-medium leading-3 text-muted">호출</span>
            </span>
          </div>
          <p className="mt-2">{countedLabels(group.calls.map((item) => statusLabel(item, active)))}</p>
          {errors.length > 0 && <p className="mt-1 text-fail-fg">{countedLabels(errors)}</p>}
          <details className="mt-2 border-t border-line-soft pt-2">
            <summary className="cursor-pointer text-muted-2">호출 시간 이력 ({group.calls.length}건)</summary>
            <ol aria-label={`${call.provider} ${call.model} 호출 시간 이력`} className="mt-2 max-h-48 space-y-2 overflow-y-auto text-muted-2">
              {group.calls.map((item) => <li key={item.callId} className="border-b border-line-soft pb-2 last:border-0">
                <p>시작 <time dateTime={item.startedAt}>{item.startedAt}</time></p>
                <p>종료 {item.finishedAt ? <time dateTime={item.finishedAt}>{item.finishedAt}</time> : active ? '대기 중' : '미확인'}</p>
              </li>)}
            </ol>
          </details>
        </li>
      })}
    </ul>}
    {binding && <details className="mt-3 border-t border-line-soft pt-2">
      <summary className="cursor-pointer text-muted-2">Job 고정 모델 설정</summary>
      <p className="mt-2 break-words">우선 모델: {configuredModel(binding.primary)}</p>
      <p className="mt-1 break-words">대체 후보: {binding.fallback.map(configuredModel).join(' → ') || '없음'}</p>
      <p className="mt-1 text-muted-2">설정 순서이며 실제 호출 여부는 위 실행 기록을 따릅니다.</p>
    </details>}
  </section>
}

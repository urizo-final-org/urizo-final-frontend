import { useCallback, useEffect, useRef, useState } from 'react'
import { describeFailure } from '../../shared/api/error'
import { Callout, PanelTitle, panel, smallButton, textarea } from '../../shared/ui/primitives'
import type { KnowledgeAdminApi } from './admin-api'
import type { ActivationRequest, KnowledgeVersion } from './admin-types'

/**
 * 자료 갱신 요청 경로.
 *
 * <p>**메우는 구멍**: 쓰기 4종이 전부 `SUPER_ADMIN` 전용이라 일반 관리자는 문제를 발견해도
 * 회색 버튼 툴팁의 "최고 관리자에게 요청하세요"가 전부였고, 그 문장은 아무 데로도 가지 않았다.
 * 전달은 사람이 말로 옮겨야 했다.
 *
 * <p>**처리 완료 버튼을 두지 않는다.** 활성화·롤백이 곧 처리이고 서버가 그때 닫는다. 별도
 * 처리 엔드포인트가 아예 없다 — 두면 "바꿨는데 요청은 열려 있는" 상태의 정합이 다시 사람 몫이 된다.
 *
 * <p>**확인 창도 두지 않는다.** 되돌리기 어려운 쓰기 3종과 달리 요청은 되돌릴 게 없고, 서버가
 * "같은 사람 · 같은 대상 · 열린 요청"을 부분 유니크 인덱스로 하나로 접는다. 두 번 눌러도 행이 안 늘어난다.
 */

/** 서버 `@Size(max = 500)`과 같은 값. 넘기면 400이므로 입력 단계에서 막는다. */
const REASON_MAX = 500

/** 목록의 `knowledgeVersionId`가 null이면 "새로 만들어 달라"는 요청이다. */
const NEW_BUILD = ''

export function ActivationRequests({ api, knowledgeBaseId, mayWrite, versions, refreshKey }: {
  api: KnowledgeAdminApi
  knowledgeBaseId: string | null
  /** SUPER_ADMIN 여부. 쓰기가 되는 사람에게는 요청 폼 대신 목록만 보인다. */
  mayWrite: boolean
  versions: KnowledgeVersion[] | null
  /** 활성화·롤백 성공 시 증가한다. 서버가 닫은 요청이 목록에서 사라지는지 여기서 보인다. */
  refreshKey: number
}) {
  const [requests, setRequests] = useState<ActivationRequest[] | null>(null)
  const [reason, setReason] = useState('')
  const [targetId, setTargetId] = useState(NEW_BUILD)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [sent, setSent] = useState(false)
  const alive = useRef(true)

  // 마운트마다 되살린다. StrictMode는 mount → unmount → mount로 두 번 도는데, 정리에서
  // false로만 두면 두 번째 마운트에서 영원히 막혀 화면이 빈 채로 남는다(AI02-005 함정 3).
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const load = useCallback(async () => {
    if (!knowledgeBaseId) return
    try {
      const list = await api.listActivationRequests(knowledgeBaseId)
      if (alive.current) setRequests(list.items ?? [])
    }
    catch {
      // 요청 목록 하나 때문에 RAG 화면 전체가 오류로 덮이면 안 된다. 없는 셈 친다.
      if (alive.current) setRequests(null)
    }
  }, [api, knowledgeBaseId])

  useEffect(() => { void load() }, [load, refreshKey])

  const send = useCallback(async () => {
    if (!knowledgeBaseId) return
    setBusy(true)
    setFailure(null)
    try {
      await api.createActivationRequest(knowledgeBaseId, {
        knowledgeVersionId: targetId === NEW_BUILD ? undefined : targetId,
        reason: reason.trim() || undefined,
      })
      if (alive.current) { setReason(''); setSent(true) }
    }
    catch (error) {
      if (alive.current) setFailure(error)
    }
    finally {
      // 성공하면 방금 남긴 요청이 목록에 보인다 — 눌렀는데 아무 일도 안 일어난 것처럼
      // 보이지 않게 하는 유일한 증거다.
      await load()
      if (alive.current) setBusy(false)
    }
  }, [api, knowledgeBaseId, targetId, reason, load])

  if (!knowledgeBaseId) return null

  /** 최고 관리자가 실제로 손댈 수 있는 버전만 지목 대상이다 — 승인 대기는 활성화, 보관은 롤백. */
  const targets = (versions ?? []).filter((v) => v.status === 'APPROVAL_PENDING' || v.status === 'ARCHIVED')
  const open = requests ?? []

  return <section className={panel}>
    <PanelTitle title="자료 갱신 요청" sub={requests ? `열린 요청 ${open.length}건` : undefined} />

    {!mayWrite && <div className="flex flex-col gap-2 border-b border-line-soft px-4 py-[0.875rem]">
      <p className="m-0 text-[0.6875rem] text-muted-3">
        활성화·롤백은 최고 관리자만 할 수 있습니다. 여기에 남기면 요청이 그대로 전달됩니다.
      </p>
      <label className="flex flex-col gap-1 text-[0.6875rem] text-muted-3">
        요청 대상
        <select
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
          className="min-w-[14rem] rounded-[0.3125rem] border border-field-line bg-white px-2 py-[0.375rem] text-xs text-ink"
        >
          <option value={NEW_BUILD}>새로 만들어 주세요 (대상 버전 없음)</option>
          {targets.map((version) => <option key={version.knowledgeVersionId} value={version.knowledgeVersionId}>
            v{version.versionNumber} {version.status === 'APPROVAL_PENDING' ? '활성화' : '로 되돌리기'}
          </option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[0.6875rem] text-muted-3">
        사유 (선택 · 최대 {REASON_MAX}자)
        <textarea
          className={textarea}
          rows={2}
          maxLength={REASON_MAX}
          value={reason}
          onChange={(event) => { setReason(event.target.value); setSent(false) }}
          placeholder="예: 8월 관광지 정보가 빠져 있어 검색이 비어 나옵니다."
        />
      </label>
      <div className="flex items-center gap-2">
        <button className={smallButton} disabled={busy} onClick={() => { void send() }}>
          {busy ? '보내는 중…' : '갱신 요청'}
        </button>
        {sent && <small className="text-[0.6875rem] text-ok-fg">전달했습니다. 아래 목록에 남습니다.</small>}
      </div>
      {failure != null && <Callout tone="warn" icon="triangle-alert">{describeFailure(failure)}</Callout>}
    </div>}

    <div>
      {requests == null && <p className="m-0 px-4 py-[0.875rem] text-xs text-muted-3">요청을 불러오는 중…</p>}
      {requests != null && open.length === 0 && <p className="m-0 px-4 py-[0.875rem] text-xs text-muted-3">
        열린 요청이 없습니다.
      </p>}
      {open.map((request) => <div key={request.requestId} className="border-b border-row-line px-4 py-[0.625rem] text-xs text-body last:border-b-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <b className="text-[0.78125rem] font-semibold text-ink">{request.requestedByName}</b>
          <span className="text-[0.6875rem] text-muted-2">{describeTarget(request, versions)}</span>
          <span className="ml-auto font-mono text-[0.6875rem] text-muted-3">
            {new Date(request.createdAt).toLocaleString('ko-KR')}
          </span>
        </div>
        {request.reason && <p className="m-0 mt-1 text-[0.71875rem] text-muted">{request.reason}</p>}
      </div>)}
    </div>
  </section>
}

/**
 * 요청이 가리키는 대상. 버전 목록에 없는 id는 번호 대신 그대로 두지 않고 "지정 버전"으로만
 * 말한다 — 접혀 있거나 이미 지워진 버전을 v?로 그리면 틀린 번호를 보게 된다.
 */
function describeTarget(request: ActivationRequest, versions: KnowledgeVersion[] | null): string {
  if (request.knowledgeVersionId == null) return '새 빌드 요청'
  const found = (versions ?? []).find((v) => v.knowledgeVersionId === request.knowledgeVersionId)
  return found ? `v${found.versionNumber} 요청` : '지정 버전 요청'
}

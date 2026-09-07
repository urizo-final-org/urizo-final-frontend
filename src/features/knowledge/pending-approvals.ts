import { useEffect, useRef, useState } from 'react'
import type { KnowledgeAdminApi } from './admin-api'

/**
 * 메뉴 뱃지용 승인 대기 건수.
 *
 * <p>**메우는 구멍**: 빌드가 끝나도 자동 활성화되지 않고 `APPROVAL_PENDING`으로 멈추는데,
 * 그 멈춤은 `/admin/rag`에 **들어가야만** 보인다. 안 들어가면 며칠이고 모른다. 여기서는
 * 껍데기 메뉴에 건수만 띄워 "볼 게 있다"를 들어가기 전에 알린다.
 *
 * <p>여기에 **자료 갱신 요청 건수를 함께 센다**(AI02-007). 축이 둘이지만 뱃지는 하나로
 * 둔다 — 메뉴 뱃지가 답하는 질문은 "저기 들어가 볼 일이 있나"이고 그 답은 둘 다 같다.
 * 뱃지를 둘로 나누면 메뉴가 복잡해지는 만큼을 화면 안에서 이미 구분해 보여 준다. 어느
 * 쪽인지는 툴팁이 나눠 말한다.
 *
 * <p>실패하면 조용히 없는 셈 친다(null). 편의 표시 하나 때문에 껍데기가 깨지면 안 된다.
 * 다만 **요청 조회 실패는 승인 대기 건수까지 지우지 않는다** — 백엔드가 아직 이 엔드포인트를
 * 배포하지 않은 환경에서 404 하나로 기존 뱃지가 통째로 꺼지면 안 된다.
 */
const REFRESH_INTERVAL_MS = 60_000
/** 껍데기에서 도는 조회라 상한을 둔다. 뱃지 하나를 위해 목록을 무한정 훑지 않는다. */
const MAX_PROJECTS = 5

/** 뱃지는 합계를 쓰고 툴팁이 축을 나눈다. */
export type PendingCounts = { approvals: number; requests: number }

export function usePendingApprovals(api: KnowledgeAdminApi, enabled: boolean): PendingCounts | null {
  const [count, setCount] = useState<PendingCounts | null>(null)
  const alive = useRef(true)

  // RagAdminPanel과 같은 이유로 마운트마다 되살린다 — StrictMode는 mount → unmount →
  // mount로 두 번 돈다. 정리에서 false로만 두면 두 번째 마운트에서 영원히 막힌다.
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setCount(null)
      return
    }
    let timer: ReturnType<typeof setInterval> | null = null
    let bases: string[] | null = null

    async function read() {
      try {
        // 껍데기 뱃지는 "어딘가에 볼 게 있다"를 알린다. 화면 안의 선택(프로젝트 드롭다운)과
        // 달리 대상을 하나로 좁힐 수 없으므로 전체를 센다 — 프로젝트가 둘 이상이면
        // resolveTarget이 'choose'를 주고, 그걸로는 아무것도 못 센다.
        if (!bases) {
          const projects = (await api.listProjects()).items ?? []
          const found: string[] = []
          for (const project of projects.slice(0, MAX_PROJECTS)) {
            const list = (await api.listKnowledgeBases(project.projectId)).items ?? []
            list.forEach((base) => found.push(base.knowledgeBaseId))
          }
          bases = found
        }
        let approvals = 0
        let requests = 0
        for (const knowledgeBaseId of bases) {
          const list = await api.listVersions(knowledgeBaseId)
          approvals += (list.items ?? []).filter((v) => v.status === 'APPROVAL_PENDING').length
          // 목록은 OPEN만 내려주므로 상태로 다시 거르지 않는다.
          try {
            const open = await api.listActivationRequests(knowledgeBaseId)
            requests += (open.items ?? []).length
          }
          catch { /* 엔드포인트가 없는 환경에서도 승인 대기 뱃지는 살아 있어야 한다 */ }
        }
        if (alive.current) setCount({ approvals, requests })
      }
      catch {
        if (alive.current) setCount(null)
      }
    }

    void read()
    timer = setInterval(() => { void read() }, REFRESH_INTERVAL_MS)
    return () => { if (timer) clearInterval(timer) }
  }, [api, enabled])

  return count
}

import { useEffect, useRef, useState } from 'react'
import type { KnowledgeAdminApi } from './admin-api'
import type { ActivationRequest } from './admin-types'

/**
 * 아직 처리되지 않은 자료 갱신 요청. 헤더의 종이 이것을 한 줄씩 그린다.
 *
 * <p>**메우는 구멍**: 일반 관리자가 보낸 갱신 요청은 `/admin/rag`에 **들어가야만** 보인다.
 * 안 들어가면 며칠이고 모른다. 여기서 읽어 종에 넘겨, 들어가기 전에 알린다.
 *
 * <p>**승인 대기 버전은 세지 않는다.** 한때 같이 셌지만 종이 답해야 하는 질문은 "지금 나에게
 * 온 것이 있나" 하나다. 빌드가 승인 대기로 멈춰 있다는 사실은 버전 표에 늘 떠 있어 언제든
 * 확인할 수 있는 반면, 요청은 사람이 방금 보낸 것이라 알림이 아니면 닿지 않는다. 둘을 한
 * 종에 섞으면 상시 켜져 있는 숫자가 새로 온 소식을 가린다.
 *
 * <p>실패하면 조용히 없는 셈 친다(null). 편의 표시 하나 때문에 껍데기가 깨지면 안 된다.
 * 백엔드가 이 엔드포인트를 아직 배포하지 않은 환경에서도 껍데기는 그대로 떠야 한다.
 */
/** 종과 갱신 요청 목록이 같은 주기를 쓴다 — 갈라지면 "종은 1인데 목록은 비어 있는" 화면이 된다. */
export const REFRESH_INTERVAL_MS = 60_000
/** 껍데기에서 도는 조회라 상한을 둔다. 알림 하나를 위해 목록을 무한정 훑지 않는다. */
const MAX_PROJECTS = 5

export function usePendingApprovals(
  api: KnowledgeAdminApi, enabled: boolean,
): ActivationRequest[] | null {
  const [requests, setRequests] = useState<ActivationRequest[] | null>(null)
  const alive = useRef(true)

  // RagAdminPanel과 같은 이유로 마운트마다 되살린다 — StrictMode는 mount → unmount →
  // mount로 두 번 돈다. 정리에서 false로만 두면 두 번째 마운트에서 영원히 막힌다.
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setRequests(null)
      return
    }
    let timer: ReturnType<typeof setInterval> | null = null
    let bases: string[] | null = null

    async function read() {
      try {
        // 껍데기 알림은 "어딘가에 볼 게 있다"를 알린다. 화면 안의 선택(프로젝트 드롭다운)과
        // 달리 대상을 하나로 좁힐 수 없으므로 전체를 훑는다 — 프로젝트가 둘 이상이면
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
        // 목록은 OPEN만 내려주므로 상태로 다시 거르지 않는다.
        const open: ActivationRequest[] = []
        for (const knowledgeBaseId of bases) {
          const list = await api.listActivationRequests(knowledgeBaseId)
          ;(list.items ?? []).forEach((request) => open.push(request))
        }
        if (alive.current) setRequests(open)
      }
      catch {
        if (alive.current) setRequests(null)
      }
    }

    void read()
    timer = setInterval(() => { void read() }, REFRESH_INTERVAL_MS)
    return () => { if (timer) clearInterval(timer) }
  }, [api, enabled])

  return requests
}

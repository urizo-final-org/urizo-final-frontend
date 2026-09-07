import { useEffect, useRef, useState } from 'react'
import type { KnowledgeAdminApi } from './admin-api'

/**
 * 메뉴 뱃지용 승인 대기 건수.
 *
 * <p>**메우는 구멍**: 빌드가 끝나도 자동 활성화되지 않고 `APPROVAL_PENDING`으로 멈추는데,
 * 그 멈춤은 `/admin/rag`에 **들어가야만** 보인다. 안 들어가면 며칠이고 모른다. 여기서는
 * 껍데기 메뉴에 건수만 띄워 "볼 게 있다"를 들어가기 전에 알린다.
 *
 * <p>새 테이블도 새 엔드포인트도 만들지 않는다 — 이미 읽고 있는 버전 목록을 셀 뿐이다.
 * 알림 저장소가 필요한 것은 사람 사이의 요청 전달이지 이 표시가 아니다.
 *
 * <p>실패하면 조용히 없는 셈 친다(null). 편의 표시 하나 때문에 껍데기가 깨지면 안 된다.
 */
const REFRESH_INTERVAL_MS = 60_000
/** 껍데기에서 도는 조회라 상한을 둔다. 뱃지 하나를 위해 목록을 무한정 훑지 않는다. */
const MAX_PROJECTS = 5

export function usePendingApprovals(api: KnowledgeAdminApi, enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(null)
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
        let pending = 0
        for (const knowledgeBaseId of bases) {
          const list = await api.listVersions(knowledgeBaseId)
          pending += (list.items ?? []).filter((v) => v.status === 'APPROVAL_PENDING').length
        }
        if (alive.current) setCount(pending)
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

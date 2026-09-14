import { useEffect, useRef, useState } from 'react'
import type { KnowledgeAdminApi } from './admin-api'
import type { KnowledgeBase, SourceChangeSummary } from './admin-types'
import { REFRESH_INTERVAL_MS } from './pending-approvals'

/**
 * 스케줄러가 남긴 원천 변경 요약을 종에 올린다(AXMS-AI02-022).
 *
 * <p>AppShell이 예약해 둔 일반 관리자 몫 — "자동 감지된 갱신 필요" — 이 이것이다.
 * 감지는 서버 스케줄러가 하고, 여기는 읽어서 알릴 뿐이다. 갱신 요청은 사람이 남긴다.
 *
 * <p>{@code usePendingApprovals}와 같은 태도: 실패는 조용히 없는 셈 치고(null),
 * 알림 하나 때문에 껍데기를 깨지 않는다. 조회 상한도 같은 이유로 둔다.
 */
const MAX_PROJECTS = 5

export type SourceChangeNotice = {
  knowledgeBaseId: string
  projectId: string
  name: string
  summary: SourceChangeSummary
}

/** 변경이 실제로 있는 지식베이스만 남긴다. 0건 요약은 "점검했고 이상 없음"이라 알릴 것이 아니다. */
export function changedBases(bases: KnowledgeBase[]): SourceChangeNotice[] {
  const notices: SourceChangeNotice[] = []
  for (const base of bases) {
    const summary = base.sourceChangeSummary
    if (summary && summary.added + summary.modified + summary.missing > 0) {
      notices.push({
        knowledgeBaseId: base.knowledgeBaseId,
        projectId: base.projectId,
        name: base.name,
        summary,
      })
    }
  }
  return notices
}

export function useSourceChanges(
  api: KnowledgeAdminApi, enabled: boolean,
): SourceChangeNotice[] | null {
  const [changes, setChanges] = useState<SourceChangeNotice[] | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setChanges(null)
      return
    }
    let timer: ReturnType<typeof setInterval> | null = null

    async function read() {
      try {
        // 요약은 지식베이스 행에 실려 오므로 매 주기 목록을 새로 읽는다 —
        // 스케줄러가 방금 갱신한 값을 캐시가 가리면 알림이 늦는 만큼 서비스가 낡는다.
        const projects = (await api.listProjects()).items ?? []
        const found: SourceChangeNotice[] = []
        for (const project of projects.slice(0, MAX_PROJECTS)) {
          const bases = (await api.listKnowledgeBases(project.projectId)).items ?? []
          changedBases(bases).forEach((notice) => found.push(notice))
        }
        if (alive.current) setChanges(found)
      }
      catch {
        if (alive.current) setChanges(null)
      }
    }

    void read()
    timer = setInterval(() => { void read() }, REFRESH_INTERVAL_MS)
    return () => { if (timer) clearInterval(timer) }
  }, [api, enabled])

  return changes
}

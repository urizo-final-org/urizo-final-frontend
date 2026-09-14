/**
 * 공개 포털 경로 → 프로젝트(고객사) 해석.
 *
 * <p>세 단계 우선순위로 본다. 관리자 화면과 공개 포털이 같은 SPA·같은 오리진이라
 * 2순위가 성립한다(AppShell이 경로로만 갈린다).
 *
 * <ol>
 * <li>딥링크 쿼리 {@code ?project=<uuid>} — 다른 브라우저·기기로 넘길 때 관리 화면이 발급
 * <li>브라우저 기록 — 온보딩(AI02-017)이 등록 직후 남기는 연결. <b>촬영용 임시다.</b>
 *     다른 기기 방문자에게는 보이지 않는 상태이므로 제품 답은 slug의 프로젝트 속성
 *     승격이며, 그때 이 단계를 지운다
 * <li>상수 — 로컬 데모 DB의 {@code app.project} 행. 02 문서 결정대로 slug를 DB에
 *     저장하지 않는다. 관광이 여기 없는 것은 의도다(없으면 서버 기본 챗봇 경로 유지)
 * </ol>
 */
const PORTAL_PROJECTS: Readonly<Record<string, string>> = {
  sme: '95725d1e-eeb2-45a8-9065-8118928fddd6',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 온보딩과 포털이 같은 키를 쓴다. 형식을 바꾸면 온보딩 쪽 기록도 함께 바꿔야 한다. */
export function portalProjectKey(slug: string): string {
  return `axms-portal-project:${slug}`
}

/**
 * 관리 화면이 보여줄 그 고객사의 포털 주소(AI02-021). 모르면 null — 억지로 만들지 않는다.
 * 쿼리를 실은 딥링크를 돌려주는 이유: 다른 브라우저에서 열어도 그 자리에서 연결이 복구된다.
 */
export function portalPathOf(projectId: string, projectName?: string | null): string | null {
  for (const slug of Object.keys(PORTAL_PROJECTS)) {
    let stored: string | null = null
    try { stored = window.localStorage.getItem(portalProjectKey(slug)) }
    catch { /* 저장소가 막혀도 상수 비교는 남는다 */ }
    if (stored === projectId || PORTAL_PROJECTS[slug] === projectId) {
      return `/${slug}?project=${projectId}`
    }
  }
  // 관광은 루트 포털이고 slug 매핑이 의도적으로 없다(위 주석) — 시드 프로젝트 이름으로 식별한다.
  return projectName === '관광 포털' ? '/' : null
}

export function projectIdOf(pathname: string, search = ''): string | undefined {
  const fromQuery = new URLSearchParams(search).get('project')
  if (fromQuery && UUID.test(fromQuery)) return fromQuery
  const slug = pathname.split('/').find(Boolean) ?? ''
  if (!slug) return undefined
  try {
    const stored = window.localStorage.getItem(portalProjectKey(slug))
    if (stored && UUID.test(stored)) return stored
  }
  catch { /* 저장소가 막힌 브라우저는 상수로 떨어진다 */ }
  return PORTAL_PROJECTS[slug]
}

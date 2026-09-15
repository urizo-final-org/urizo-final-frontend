/**
 * 공개 포털 경로 → 프로젝트(고객사) 해석.
 *
 * <p>두 단계 우선순위로 본다. 관리자 화면과 공개 포털이 같은 SPA·같은 오리진이라
 * 2순위가 성립한다(AppShell이 경로로만 갈린다).
 *
 * <ol>
 * <li>딥링크 쿼리 {@code ?project=<uuid>} — 다른 브라우저·기기로 넘길 때 관리 화면이 발급.
 *     포털 안을 이동해도 {@link withProject}가 이 값을 계속 실어 나른다
 * <li>브라우저 기록 — 온보딩(AI02-017)이 등록 직후 남기는 연결. <b>촬영용 임시다.</b>
 *     다른 기기 방문자에게는 보이지 않는 상태이므로 제품 답은 slug의 프로젝트 속성
 *     승격이며, 그때 이 단계를 지운다
 * </ol>
 *
 * <p>둘 다 없으면 {@code undefined}다. 예전에는 여기서 상수 UUID로 떨어졌는데, 그 값은
 * 작성자 PC에서 온보딩이 런타임에 만든 {@code app.project} 행이라 다른 PC에는 아예 없거나
 * 다른 고객사였다. 모르는 채로 조용히 남의 고객사를 가리키느니 모른다고 답하고 서버의
 * 기본 챗봇 경로를 그대로 둔다.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 프로젝트 이름 → 포털 slug. UUID는 PC마다 새로 생기지만 이름은 고객사 자체의 것이라
 * 어느 PC에서도 같다. 관광을 이름으로 판별하던 기존 방식(아래)과 같은 근거다.
 */
const PORTAL_SLUG_BY_NAME: Readonly<Record<string, string>> = {
  '중소벤처기업부': 'sme',
}

/** 온보딩 기록을 되짚을 때 훑을 slug. 이름 매핑이 없는 신규 고객사가 여기로 잡힌다. */
const PORTAL_SLUGS: readonly string[] = ['sme']

const TOUR_PROJECT_NAME = '관광 포털'

/** 온보딩과 포털이 같은 키를 쓴다. 형식을 바꾸면 온보딩 쪽 기록도 함께 바꿔야 한다. */
export function portalProjectKey(slug: string): string {
  return `axms-portal-project:${slug}`
}

/**
 * 관리 화면이 보여줄 그 고객사의 포털 주소(AI02-021). 모르면 null — 억지로 만들지 않는다.
 * 쿼리를 실은 딥링크를 돌려주는 이유: 다른 브라우저에서 열어도 그 자리에서 연결이 복구된다.
 */
export function portalPathOf(projectId: string, projectName?: string | null): string | null {
  // 관광은 루트 포털이고 slug 매핑이 의도적으로 없다(위 주석) — 시드 프로젝트 이름으로 식별한다.
  if (projectName === TOUR_PROJECT_NAME) return '/'
  const slug = (projectName && PORTAL_SLUG_BY_NAME[projectName]) ?? storedSlugOf(projectId)
  return slug ? `/${slug}?project=${projectId}` : null
}

/** 이름 매핑에 없는 고객사는 온보딩이 이 브라우저에 남긴 기록으로만 찾을 수 있다. */
function storedSlugOf(projectId: string): string | undefined {
  for (const slug of PORTAL_SLUGS) {
    try {
      if (window.localStorage.getItem(portalProjectKey(slug)) === projectId) return slug
    }
    catch { /* 저장소가 막히면 이름 매핑만 남는다 */ }
  }
  return undefined
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
  catch { /* 저장소가 막힌 브라우저는 project 없이 간다 */ }
  return undefined
}

/**
 * 포털 안 이동에 현재 고객사를 실어 나른다.
 *
 * <p>검색·분야 이동이 매번 빈 {@code URLSearchParams}를 새로 만들던 탓에, 딥링크로 들어온
 * 방문자가 한 번만 움직여도 {@code project}가 사라졌다. 이동의 출발지 쿼리에서 값을 옮긴다.
 */
export function withProject(next: URLSearchParams, search: string): URLSearchParams {
  const current = new URLSearchParams(search).get('project')
  if (current && UUID.test(current)) next.set('project', current)
  return next
}

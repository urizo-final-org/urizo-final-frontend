import { PORTAL_TABS } from '../site/portal-meta'

/**
 * F6 탭 → 공개 질의의 `category` 값(= `category_id` 접두 배열).
 *
 * <p>매핑 원본은 `portal-meta.ts`의 `PORTAL_TABS.prefixes` 하나뿐이다. 화면(탭 버튼)과
 * 질의(필터)가 같은 값을 봐야 해서 여기서 다시 정의하지 않는다. `contenttypeid`는 쓰지 않는다
 * (함정 23 — AC05 캠핑 24건이 레포츠로 잡혀 숙박 탭에서 통째로 빠진다).
 *
 * <p>"전체" 탭과 모르는 탭 id는 `undefined`다 — 필드를 아예 보내지 않아 서버가 필터를 걸지 않는다.
 */
export function tabToCategory(tabId: string | null | undefined): string[] | undefined {
  const tab = PORTAL_TABS.find((item) => item.id === tabId)
  return tab?.prefixes ?? undefined
}

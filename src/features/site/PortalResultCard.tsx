import { Placeholder } from './portal-primitives'

/**
 * 검색 결과 카드 1건. `PortalSearch`의 인라인 `<article>`을 그대로 옮긴 것이고 마크업은 같다.
 *
 * <p>props 이름은 공개 챗봇 계약(`PublicCitation`)에 맞춰 뒀다. 지금은 `MOCK_RESULTS`가
 * 넘기고, I7 배선에서 citation 하나를 그대로 넘기게 된다.
 *
 * <p>`categoryLabel`은 라벨만 받는다("숙박 > 펜션/민박"). 백엔드가 `category_id` 접두를 빼고
 * 라벨만 싣기로 확정했고(9/5), 접두는 내부 분류 코드라 사용자 화면에 쓰지 않는다.
 *
 * <p>`address`는 계약에 없는 값이다. 배선 뒤에는 `addressLine(citation.excerpt)`으로 본문의
 * `[주소]` 줄에서 뽑아 넘긴다(`portal-meta.ts`). 지금은 목업이 따로 들고 있어 그대로 받는다.
 */
export function PortalResultCard({ title, excerpt, categoryLabel, address }: {
  title: string
  excerpt: string
  categoryLabel?: string
  /** TODO(R26): sourceUrl이 합성 주소라 실제로 열리지 않음. 처리 방침 확정 후 렌더 */
  sourceUrl?: string
  address?: string
}) {
  return <article className="grid grid-cols-[15rem_minmax(0,1fr)] overflow-hidden rounded-2xl border border-line-soft bg-panel max-[680px]:grid-cols-1">
    <Placeholder label={`사진 · ${title}`} className="h-full min-h-[12.25rem] w-60 max-[680px]:aspect-[16/9] max-[680px]:h-auto max-[680px]:min-h-0 max-[680px]:w-full" />
    <div className="flex flex-col gap-2 px-[1.625rem] py-[1.375rem]">
      {categoryLabel != null && <span className="self-start rounded-md border border-line px-2 py-1 text-[0.6875rem] font-bold text-primary">{categoryLabel}</span>}
      <strong className="text-[1.1875rem] font-extrabold tracking-[-.03em] text-ink">{title}</strong>
      {address != null && <span className="text-[0.8125rem] text-muted">{address}</span>}
      <span className="mt-1.5 line-clamp-2 text-[0.8125rem] leading-[1.6] text-body">{excerpt}</span>
    </div>
  </article>
}

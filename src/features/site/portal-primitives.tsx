import type { ReactNode } from 'react'

/**
 * 관광 포털 화면이 함께 쓰는 작은 조각들. `TourPortal`·`PortalResultCard`·`ChatWidget`이
 * 모두 필요로 해서 세 파일 사이의 순환 import를 피하려고 분리했다. 마크업은 옮기기 전과 같다.
 */

/** F5: 이미지 컬럼이 DB에 없어 Flyway가 선행이다. 그때까지 자리만 확보한 줄무늬 플레이스홀더. */
export function Placeholder({ label, className = '', children }: { label: string; className?: string; children?: ReactNode }) {
  return <div className={`relative grid place-items-center overflow-hidden bg-[repeating-linear-gradient(45deg,var(--site-ph)_0_12px,var(--site-ph-line)_12px_24px)] ${className}`}>
    <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap px-2 text-center font-mono text-[0.625rem] text-site-ph-ink">{label}</span>
    {children}
  </div>
}

/**
 * 정적 표본임을 밝히는 안내. 실재하는 이름을 쓰기 시작하면 오히려 실데이터로 보이므로 화면에
 * 구별 단서를 남긴다.
 *
 * <p>`label` 기본값은 검색·큐레이션이 쓰던 문구 그대로다. 챗봇처럼 미배선 대상이 다른 곳만
 * 문구를 넘기고, 부연이 필요 없으면 children을 생략한다.
 */
export function SampleNotice({ label = '샘플 데이터 · 검색 API 미배선', children, className = '' }: { label?: string; children?: ReactNode; className?: string }) {
  return <p className={`m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-[#efd8aa] bg-wait-bg px-3 py-2 text-[0.78125rem] leading-[1.6] text-wait-fg ${className}`} role="note">
    <b className="font-bold">{label}</b>
    {children && <span className="min-w-0 flex-1">{children}</span>}
  </p>
}

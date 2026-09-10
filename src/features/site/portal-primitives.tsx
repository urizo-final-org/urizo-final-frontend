import { useState, type ReactNode } from 'react'

/**
 * 관광 포털 화면이 함께 쓰는 작은 조각들. `TourPortal`·`PortalResultCard`·`ChatWidget`이
 * 모두 필요로 해서 세 파일 사이의 순환 import를 피하려고 분리했다.
 */

/** F5: 이미지 컬럼이 DB에 없어 Flyway가 선행이다. 그때까지 자리만 확보한 줄무늬 플레이스홀더. */
export function Placeholder({ label, className = '', children }: { label: string; className?: string; children?: ReactNode }) {
  return <div className={`relative grid place-items-center overflow-hidden bg-[repeating-linear-gradient(45deg,var(--site-ph)_0_12px,var(--site-ph-line)_12px_24px)] ${className}`}>
    <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap px-2 text-center font-mono text-[0.625rem] text-site-ph-ink">{label}</span>
    {children}
  </div>
}

/**
 * 원천 대표 사진 한 장. 사진이 없거나(코퍼스 500건 중 95건) 외부 CDN 로드가 실패하면
 * 기존 빗금 플레이스홀더로 되돌린다 — 시연 중 네트워크가 끊겨도 깨진 이미지 아이콘이 아니라
 * 빗금 상자가 남는다.
 *
 * <p>주소는 원천(TourAPI) 값 그대로라 http와 https가 섞여 있다. 스킴을 바꿔 적지 않는다:
 * 원천에 없는 주소를 지어내는 것이 되고, 틀린 사진은 사진이 없는 것보다 나쁘다.
 */
export function CardPhoto({ name, img, className = '', children }: {
  name: string; img?: string | null; className?: string; children?: ReactNode
}) {
  const [failed, setFailed] = useState(false)
  if (!img || failed) {
    return <Placeholder label={`사진 · ${name}`} className={className}>{children}</Placeholder>
  }
  return <div className={`relative overflow-hidden ${className}`}>
    <img src={img} alt={name} loading="lazy" onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-cover" />
    {children}
  </div>
}

/** 시안의 사진 자리 우상단 카메라 표식. 실사진이 붙기 전까지 그 자리의 성격을 밝힌다. */
export function PhotoTag() {
  return <span className="pointer-events-none absolute right-[0.625rem] top-[0.625rem] grid h-6 w-6 place-items-center rounded-md bg-[rgba(16,28,42,.42)]" aria-hidden="true">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.5">
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" /><circle cx="12" cy="13" r="3.2" />
    </svg>
  </span>
}

/**
 * 정적 표본임을 밝히는 안내. 실재하는 이름을 쓰기 시작하면 오히려 실데이터로 보이므로 화면에
 * 구별 단서를 남긴다.
 *
 * <p>거절·미배선은 오류가 아니므로 경고색을 쓰지 않는다 — 시안의 중립 톤(`--wait-*`) 그대로다.
 *
 * <p>`label` 기본값은 검색·큐레이션이 쓰던 문구 그대로다. 챗봇처럼 미배선 대상이 다른 곳만
 * 문구를 넘기고, 부연이 필요 없으면 children을 생략한다.
 */
export function SampleNotice({ label = '샘플 데이터 · 검색 API 미배선', children, className = '' }: { label?: string; children?: ReactNode; className?: string }) {
  return <p className={`m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[0.625rem] border border-[#efd8aa] bg-wait-bg px-[0.875rem] py-[0.625rem] text-[0.78125rem] leading-[1.6] text-wait-fg ${className}`} role="note">
    <span className="h-[5px] w-[5px] flex-none translate-y-[-1px] rounded-full bg-[#c99a4e]" aria-hidden="true" />
    <b className="font-bold">{label}</b>
    {children && <span className="min-w-0 flex-1">{children}</span>}
  </p>
}

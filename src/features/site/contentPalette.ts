/**
 * 본문에 쓸 수 있는 색.
 *
 * <p>**고정 목록으로 둔다.** 색을 자유롭게 입력받으면 임의의 CSS 값이 본문에 들어오고, 서버는
 * 그것이 안전한지 판단할 방법이 없다. 허용 목록을 두는 의미가 사라진다.
 *
 * <p>서버 `ContentBody`가 같은 값을 들고 있다. 저장소가 갈려 있어 한 벌을 공유할 수 없으므로
 * 한쪽을 고치면 다른 쪽도 고친다. 목록에 없는 값은 저장이 거부된다.
 */

/** 글자색. `기본`은 색을 지우는 것이라 값이 없다. */
export const TEXT_COLORS: readonly { name: string; value: string | null }[] = [
  { name: '기본', value: null },
  { name: '회색', value: '#6b7d84' },
  { name: '빨강', value: '#c0392b' },
  { name: '파랑', value: '#1d6fb8' },
  { name: '초록', value: '#2a7d55' },
  { name: '주황', value: '#c1701a' },
]

/** 형광펜. 글자가 위에 얹히므로 옅은 색만 둔다. */
export const HIGHLIGHT_COLORS: readonly { name: string; value: string }[] = [
  { name: '노랑', value: '#fff3a3' },
  { name: '초록', value: '#d5f2dd' },
  { name: '파랑', value: '#d8ecfb' },
  { name: '분홍', value: '#fbdce8' },
  { name: '회색', value: '#e6ebed' },
]

const TEXT_VALUES = new Set(TEXT_COLORS.map((color) => color.value).filter((v) => v !== null))
const HIGHLIGHT_VALUES = new Set(HIGHLIGHT_COLORS.map((color) => color.value))

/** 목록에 있는 색만 화면에 그린다. 읽는 쪽의 가드레일이다. */
export function textColor(value: unknown) {
  return typeof value === 'string' && TEXT_VALUES.has(value) ? value : undefined
}

export function highlightColor(value: unknown) {
  return typeof value === 'string' && HIGHLIGHT_VALUES.has(value) ? value : undefined
}

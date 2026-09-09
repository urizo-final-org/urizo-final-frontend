import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { highlightColor, textColor } from './contentPalette'

/**
 * 컨텐츠 본문의 생김새. 편집기·미리보기·사용자 사이트가 이 하나를 함께 쓴다.
 *
 * <p>세 곳이 각자 스타일을 들고 있으면 관리자에서 본 모양과 사이트에서 본 모양이 갈린다.
 * 지금까지 `RichText` 안에 인라인으로 박혀 있어 나눠 쓸 수가 없었다.
 *
 * <p>폭은 맞추지 않는다. 사이트 본문은 850px이고 관리자 폼은 그보다 좁아 줄바꿈 위치가 다르다.
 *
 * <p>`--brand`는 사용자 사이트가 템플릿 대표색으로 세우는 값이라 관리자 화면에는 없다. 기본값을
 * 함께 적지 않으면 관리자 편집기에서 링크와 목록 기호가 본문색 그대로 나온다.
 */
export const contentStyles = [
  // 앱 전체가 `font-synthesis: none`이라 UI 글자는 또렷하지만, 한글은 굵은 서체나 기울임 서체가
  // 없는 폰트로 떨어져 굵게와 기울임이 화면에 나타나지 않았다. 본문에서만 합성을 허용한다.
  'text-[1rem] leading-8 text-[#4a6167] [font-synthesis:style_weight]',
  '[&_h2]:mb-4 [&_h2]:mt-9 [&_h2]:text-[1.5625rem] [&_h2]:font-medium [&_h2]:tracking-[-.05em] [&_h2]:text-[#263e48]',
  '[&_h3]:mb-3 [&_h3]:mt-7 [&_h3]:text-[1.1875rem] [&_h3]:font-semibold [&_h3]:tracking-[-.04em] [&_h3]:text-[#263e48]',
  '[&_p]:my-3',
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6',
  '[&_li]:my-1 [&_li]:pl-1 [&_li]:marker:text-[var(--brand,#2a5f61)]',
  '[&_li>p]:my-0',
  // 굵게는 본문보다 진하게 둔다. 굵기만으로는 한글에서 차이가 잘 안 보인다.
  // 다만 색을 고른 글자 안에서는 그 색이 이겨야 한다. 색 마크가 만든 `<span style=color>` 안의
  // `<strong>`만 골라 색을 물려받게 한다. 편집기와 렌더러가 같은 모양을 만들어 양쪽에 걸린다.
  '[&_strong]:font-bold [&_strong]:text-[#263e48]',
  // 색을 고른 글자의 굵게는 그 색을 물려받아 한 단계 진하게 한다. 한글은 굵기 차이만으로 잘
  // 드러나지 않아 진하기가 실제 신호다. 획을 두껍게 하는 방법은 자소가 뭉개졌다.
  //
  // 색 값으로 규칙을 나누지 않는다. 편집기는 인라인 색을 hex로 두는데 렌더러는 React가
  // `rgb(...)`로 바꿔 적어, 값을 대조하면 두 화면이 서로 다르게 걸린다.
  // 글자색만 손댄다. `filter`로 어둡게 하면 형광펜 배경까지 함께 어두워진다.
  '[&_[style*=color]_strong]:[color:color-mix(in_srgb,currentColor_78%,black)]',
  '[&_em]:italic',
  '[&_s]:line-through [&_u]:underline [&_u]:underline-offset-2',
  // 인용선은 옅게 둔다. 인용은 본문을 밀어내는 것이 아니라 옆으로 물러난 덩어리라,
  // 선이 진하면 시선을 뺏는다. 대표색을 쓰면 링크 파랑에 색이 하나 더 늘어난다.
  '[&_blockquote]:my-6 [&_blockquote]:border-l-[3px] [&_blockquote]:border-[#d5dee0]',
  '[&_blockquote]:pl-5 [&_blockquote]:text-[#5a7178]',
  '[&_blockquote>p]:my-2',
  '[&_hr]:my-8 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-[#dde5e6]',
  // 형광펜 안에서도 글자색이 살아 있어야 한다. 브라우저 기본값이 검정이라 덮어쓴다.
  '[&_mark]:rounded-[0.15em] [&_mark]:px-[0.15em]',
  // 링크는 템플릿 대표색을 따르지 않고 파란색으로 고정한다. 본문 안에서 눌러서 나가는 곳임을
  // 알아보는 표시라 대표색과 섞이면 그냥 강조한 글자로 읽힌다.
  '[&_a]:text-[#0b63ce] [&_a]:underline [&_a]:underline-offset-2',
  '[&_img]:my-6 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded',
].join(' ')

/** 편집기가 만드는 문서의 부품. 렌더러가 아는 것만 그린다. */
type DocumentNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type?: string; attrs?: Record<string, unknown> }[]
  content?: DocumentNode[]
}

/**
 * 편집기 문서를 화면에 그린다.
 *
 * <p>Tiptap을 쓰지 않는다. 이 앱은 코드 분할이 없어 관리자 화면과 공개 사이트가 번들 하나다.
 * 변환기를 넣으면 로그인하지 않은 방문자까지 편집기 코드를 받는다.
 *
 * <p>**아는 부품만 그리고 모르는 것은 건너뛴다.** 읽는 쪽에 가드레일이 한 겹 더 생기고,
 * HTML 문자열을 만들지 않으므로 따로 걸러낼 것도 없다.
 */
export function ContentDocument({ body }: { body: string }) {
  const document = parse(body)
  if (!document) {
    // 서버가 읽는 입구에서 문서로 바꿔 주므로 여기까지 오지 않는다. 그래도 빈 화면은 만들지 않는다.
    return <div className={contentStyles}>{body}</div>
  }
  return <div className={contentStyles}>{children(document)}</div>
}

function parse(body: string): DocumentNode | null {
  try {
    const document: DocumentNode = JSON.parse(body)
    return document?.type === 'doc' ? document : null
  }
  catch {
    return null
  }
}

function children(node: DocumentNode): ReactNode {
  return (node.content ?? []).map((child, index) => <Fragment key={index}>{render(child)}</Fragment>)
}

function render(node: DocumentNode): ReactNode {
  switch (node.type) {
    case 'text':
      return marked(node)
    case 'hardBreak':
      return <br />
    case 'paragraph':
      return <p>{children(node)}</p>
    case 'heading':
      return node.attrs?.level === 3 ? <h3>{children(node)}</h3> : <h2>{children(node)}</h2>
    // 편집기가 만드는 것과 같은 태그를 쓴다. 그래야 한 벌의 스타일이 양쪽에 똑같이 걸린다.
    case 'bulletList':
      return <ul>{children(node)}</ul>
    case 'orderedList':
      return <ol>{children(node)}</ol>
    case 'listItem':
      return <li>{children(node)}</li>
    case 'blockquote':
      return <blockquote>{children(node)}</blockquote>
    case 'horizontalRule':
      return <hr />
    case 'image':
      return <img src={text(node.attrs?.src)} alt={text(node.attrs?.alt)} />
    default:
      // 모르는 부품은 그리지 않는다. 읽는 쪽의 가드레일이다.
      return null
  }
}

/** 글자에 붙은 서식. 서버 허용 목록(`ContentBody.MARKS`)과 같은 다섯 개를 안다. */
function marked(node: DocumentNode): ReactNode {
  let content: ReactNode = node.text ?? ''
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') content = <strong>{content}</strong>
    else if (mark.type === 'italic') content = <em>{content}</em>
    else if (mark.type === 'strike') content = <s>{content}</s>
    else if (mark.type === 'underline') content = <u>{content}</u>
    // 색은 팔레트에 있는 값만 쓴다. 값이 목록 밖이면 색 없이 글자만 남긴다.
    else if (mark.type === 'textStyle') {
      const color = textColor(mark.attrs?.color)
      if (color) content = <span style={{ color }}>{content}</span>
    }
    else if (mark.type === 'highlight') {
      const background = highlightColor(mark.attrs?.color)
      if (background) content = <mark style={highlightStyle(background)}>{content}</mark>
    }
    else if (mark.type === 'link') {
      const href = text(mark.attrs?.href)
      // 바깥으로 나가는 링크는 새 창으로 열고 참조자를 넘기지 않는다.
      content = href.startsWith('/')
        ? <a href={href}>{content}</a>
        : <a href={href} target="_blank" rel="noreferrer noopener">{content}</a>
    }
  }
  return content
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

/** 형광펜의 기본 글자색은 검정이다. 본문 색을 물려받게 해서 형광만 얹는다. */
function highlightStyle(background: string): CSSProperties {
  return { background, color: 'inherit' }
}

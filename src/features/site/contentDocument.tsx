import { Fragment, type ReactNode } from 'react'

/**
 * 컨텐츠 본문의 생김새. 편집기·미리보기·사용자 사이트가 이 하나를 함께 쓴다.
 *
 * <p>세 곳이 각자 스타일을 들고 있으면 관리자에서 본 모양과 사이트에서 본 모양이 갈린다.
 * 지금까지 `RichText` 안에 인라인으로 박혀 있어 나눠 쓸 수가 없었다.
 *
 * <p>폭은 맞추지 않는다. 사이트 본문은 850px이고 관리자 폼은 그보다 좁아 줄바꿈 위치가 다르다.
 */
export const contentStyles = {
  root: 'text-[1rem] leading-8 text-[#4a6167]',
  heading2: 'mb-4 mt-9 text-[1.5625rem] tracking-[-.05em] text-[#263e48]',
  heading3: 'mb-3 mt-7 text-[1.1875rem] font-semibold tracking-[-.04em] text-[#263e48]',
  paragraph: 'my-3',
  list: 'my-3 flex flex-col gap-2',
  listRow: 'flex gap-3',
  marker: 'shrink-0 text-[var(--brand)]',
  link: 'text-[var(--brand)] underline underline-offset-2',
  image: 'my-6 h-auto max-w-full rounded',
}

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
    return <div className={contentStyles.root}>{body}</div>
  }
  return <div className={contentStyles.root}>{children(document)}</div>
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
      return <p className={contentStyles.paragraph}>{children(node)}</p>
    case 'heading':
      return node.attrs?.level === 3
        ? <h3 className={contentStyles.heading3}>{children(node)}</h3>
        : <h2 className={contentStyles.heading2}>{children(node)}</h2>
    case 'bulletList':
    case 'orderedList':
      return <div className={contentStyles.list}>
        {(node.content ?? []).map((item, order) => <div className={contentStyles.listRow} key={order}>
          <span className={contentStyles.marker} aria-hidden="true">
            {node.type === 'orderedList' ? `${order + 1}.` : '●'}
          </span>
          <span className="min-w-0 flex-1">{children(item)}</span>
        </div>)}
      </div>
    case 'image':
      return <img className={contentStyles.image} src={text(node.attrs?.src)} alt={text(node.attrs?.alt)} />
    default:
      // 모르는 부품은 그리지 않는다. 읽는 쪽의 가드레일이다.
      return null
  }
}

/** 글자에 붙은 서식. 굵게·기울임·링크만 안다. */
function marked(node: DocumentNode): ReactNode {
  let content: ReactNode = node.text ?? ''
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') content = <strong>{content}</strong>
    else if (mark.type === 'italic') content = <em>{content}</em>
    else if (mark.type === 'link') {
      const href = text(mark.attrs?.href)
      // 바깥으로 나가는 링크는 새 창으로 열고 참조자를 넘기지 않는다.
      content = href.startsWith('/')
        ? <a className={contentStyles.link} href={href}>{content}</a>
        : <a className={contentStyles.link} href={href} target="_blank" rel="noreferrer noopener">{content}</a>
    }
  }
  return content
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

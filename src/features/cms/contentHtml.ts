import { HIGHLIGHT_COLORS, TEXT_COLORS } from '../site/contentPalette'

/**
 * 소스 편집으로 들어온 HTML을 다듬는다.
 *
 * <p>실제 변환은 Tiptap이 한다. 편집기가 켠 부품만 스키마를 통과하므로 모르는 것은 알아서
 * 사라진다. 여기서 하는 일은 둘이다.
 *
 * <ol>
 *   <li>무엇이 빠지는지 미리 세어 사람에게 알린다. 조용히 사라지면 붙여넣은 글이 반쯤 없어진
 *       것을 나중에 발견한다.</li>
 *   <li>팔레트 밖 색을 지운다. 그대로 두면 저장 단계에서 거부되는데, 그때는 어디가 문제인지
 *       찾기 어렵다. 가까운 색으로 바꾸지 않는다 — 한꺼번에 들어오는 글에서 색이 조용히
 *       달라지는 것보다 없는 편이 낫다.</li>
 * </ol>
 */

/**
 * 줄을 따로 쓰는 부품.
 *
 * <p>글 안에 섞여 흐르는 서식(굵게·링크 따위)은 제자리에 두고, 문단·제목·목록처럼 덩어리를
 * 이루는 것만 줄을 나눈다. 나누는 기준이 사람이 글을 보는 단위와 같아야 읽을 수 있다.
 */
const BLOCK = new Set(['P', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'IMG'])

/** 안에 또 덩어리를 담는 부품. 여기만 한 칸 더 들여쓴다. */
const NESTS = new Set(['UL', 'OL', 'LI', 'BLOCKQUOTE'])

/**
 * 소스 편집에 보여줄 HTML을 줄 단위로 나눈다.
 *
 * <p>`getHTML()`은 줄바꿈 없이 한 줄로 준다. 그대로 보여주면 글상자 폭에서 태그 가운데가
 * 끊겨 어디가 어디인지 알 수 없다.
 */
export function formatHtml(html: string) {
  const holder = document.createElement('div')
  holder.innerHTML = html
  return lines(holder, 0).join('\n')
}

function lines(parent: Element, depth: number): string[] {
  const pad = '  '.repeat(depth)
  const out: string[] = []
  let inline = ''

  const flush = () => {
    if (inline.trim().length > 0) out.push(pad + inline.trim())
    inline = ''
  }

  for (const node of parent.childNodes) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : null
    if (element === null || !BLOCK.has(element.tagName)) {
      inline += element?.outerHTML ?? node.textContent ?? ''
      continue
    }
    flush()
    const tag = element.tagName.toLowerCase()
    if (element.childNodes.length === 0) {
      out.push(pad + element.outerHTML)
      continue
    }
    if (!NESTS.has(element.tagName)) {
      out.push(pad + element.outerHTML)
      continue
    }
    out.push(`${pad}<${tag}${attributes(element)}>`)
    out.push(...lines(element, depth + 1))
    out.push(`${pad}</${tag}>`)
  }
  flush()
  return out
}

function attributes(element: Element) {
  return [...element.attributes].map((at) => ` ${at.name}="${at.value}"`).join('')
}

/** 편집기가 읽어 들일 수 있는 태그. 같은 뜻의 옛 태그도 Tiptap이 받아 주므로 함께 둔다. */
const KNOWN = new Set([
  'P', 'H2', 'H3', 'UL', 'OL', 'LI', 'A', 'IMG', 'BLOCKQUOTE', 'HR', 'BR',
  'STRONG', 'B', 'EM', 'I', 'U', 'INS', 'S', 'STRIKE', 'DEL', 'SPAN', 'MARK',
])

const TEXT_VALUES = new Set(TEXT_COLORS.map((color) => color.value).filter((v): v is string => v !== null))
const HIGHLIGHT_VALUES = new Set(HIGHLIGHT_COLORS.map((color) => color.value))

export type ImportedHtml = {
  html: string
  /** 빠지는 태그 이름. 같은 것은 한 번만 센다. */
  dropped: string[]
}

export function cleanImportedHtml(source: string): ImportedHtml {
  const holder = document.createElement('div')
  holder.innerHTML = source
  const dropped = new Set<string>()

  for (const node of [...holder.querySelectorAll('*')]) {
    if (!KNOWN.has(node.tagName)) {
      dropped.add(node.tagName.toLowerCase())
      continue
    }
    trimColours(node)
  }
  return { html: holder.innerHTML, dropped: [...dropped].sort() }
}

/**
 * 팔레트에 있는 색만 남긴다.
 *
 * <p>글자색은 `style="color"`로, 형광펜은 `style="background-color"`와 `data-color`로 온다.
 * 나머지 선언은 편집기가 어차피 버리므로 색만 보고 통째로 다시 적는다.
 */
function trimColours(node: Element) {
  const style = node.getAttribute('style')
  if (style === null) return

  const kept: string[] = []
  const colour = declaration(style, 'color')
  const background = declaration(style, 'background-color')
  if (colour !== null && TEXT_VALUES.has(colour)) kept.push(`color: ${colour}`)
  if (background !== null && HIGHLIGHT_VALUES.has(background)) {
    kept.push(`background-color: ${background}`)
  }

  if (kept.length > 0) node.setAttribute('style', kept.join('; '))
  else node.removeAttribute('style')

  const marked = node.getAttribute('data-color')
  if (marked !== null && !HIGHLIGHT_VALUES.has(marked.toLowerCase())) {
    node.removeAttribute('data-color')
  }
}

/** `style` 문자열에서 선언 하나를 읽는다. 값은 팔레트와 견줄 수 있게 hex로 맞춘다. */
function declaration(style: string, name: string) {
  for (const part of style.split(';')) {
    const at = part.indexOf(':')
    if (at < 0) continue
    if (part.slice(0, at).trim().toLowerCase() !== name) continue
    return hex(part.slice(at + 1).trim().toLowerCase())
  }
  return null
}

/**
 * 색 값을 hex로 맞춘다.
 *
 * <p>브라우저는 `style`을 다시 적을 때 `#c0392b`를 `rgb(192, 57, 43)`으로 바꾼다. 편집기가 쓴
 * 것을 DOM에 한 번 넣었다 꺼내면 표기가 달라지므로, 그대로 견주면 팔레트에 있는 색도
 * 없는 것으로 보고 지운다.
 */
function hex(value: string) {
  const rgb = value.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/)
  if (rgb === null) return value
  return '#' + rgb.slice(1, 4)
    .map((part) => Number(part).toString(16).padStart(2, '0'))
    .join('')
}

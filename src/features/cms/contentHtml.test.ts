import { expect, test } from 'vitest'
import { cleanImportedHtml, formatHtml } from './contentHtml'

test('아는 태그는 그대로 두고 모르는 것은 이름을 모은다', () => {
  const result = cleanImportedHtml(
    '<p>본문</p><table><tr><td>표</td></tr></table><script>alert(1)</script>')

  expect(result.html).toContain('<p>본문</p>')
  expect(result.dropped).toContain('table')
  expect(result.dropped).toContain('script')
})

/** 같은 태그가 여러 번 나와도 한 번만 알린다. 안내가 길어지면 읽지 않는다. */
test('같은 태그는 한 번만 센다', () => {
  const result = cleanImportedHtml('<div>하나</div><div>둘</div><div>셋</div>')

  expect(result.dropped).toEqual(['div'])
})

test('팔레트에 있는 색은 남긴다', () => {
  const result = cleanImportedHtml(
    '<p><span style="color: #c0392b">빨강</span>'
    + '<mark data-color="#fff3a3" style="background-color: #fff3a3">형광</mark></p>')

  expect(result.html).toContain('color: #c0392b')
  expect(result.html).toContain('background-color: #fff3a3')
  expect(result.html).toContain('data-color="#fff3a3"')
})

/**
 * 팔레트 밖 색은 가까운 색으로 바꾸지 않고 지운다.
 *
 * 한꺼번에 들어오는 글에서 색이 조용히 달라지는 것보다 없는 편이 낫다. 그대로 두면 저장
 * 단계에서 거부되는데 그때는 어디가 문제인지 찾기 어렵다.
 */
test('팔레트 밖 색과 나머지 선언은 지운다', () => {
  const result = cleanImportedHtml(
    '<p><span style="color: purple; font-size: 40px">보라</span>'
    + '<mark data-color="#ff00ff" style="background-color: #ff00ff">형광</mark></p>')

  expect(result.html).not.toContain('purple')
  expect(result.html).not.toContain('font-size')
  expect(result.html).not.toContain('#ff00ff')
  expect(result.html).toContain('보라')
  expect(result.html).toContain('형광')
})

/** Tiptap이 같은 뜻으로 받아 주는 옛 태그는 빠졌다고 알리지 않는다. */
test('b·i 같은 옛 태그는 빠진 것으로 세지 않는다', () => {
  const result = cleanImportedHtml('<p><b>굵게</b><i>기울임</i><s>취소선</s></p>')

  expect(result.dropped).toEqual([])
})

test('덩어리마다 줄을 나누고 안에 든 것은 들여쓴다', () => {
  const result = formatHtml(
    '<h2>제목</h2><p>문단 <strong>굵게</strong>입니다</p>'
    + '<ul><li><p>하나</p></li><li><p>둘</p></li></ul><hr>')

  expect(result).toBe([
    '<h2>제목</h2>',
    '<p>문단 <strong>굵게</strong>입니다</p>',
    '<ul>',
    '  <li>',
    '    <p>하나</p>',
    '  </li>',
    '  <li>',
    '    <p>둘</p>',
    '  </li>',
    '</ul>',
    '<hr>',
  ].join('\n'))
})

/** 글 안에 흐르는 서식은 제자리에 둔다. 줄을 나누면 문장이 끊겨 읽기 어렵다. */
test('글자 서식은 줄을 나누지 않는다', () => {
  const result = formatHtml('<p><strong>굵게</strong><em>기울임</em><a href="/a">링크</a></p>')

  expect(result).toBe('<p><strong>굵게</strong><em>기울임</em><a href="/a">링크</a></p>')
})

test('인용문 안의 문단도 들여쓴다', () => {
  const result = formatHtml('<blockquote><p>인용한 말</p></blockquote>')

  expect(result).toBe('<blockquote>\n  <p>인용한 말</p>\n</blockquote>')
})

/**
 * 브라우저는 `style`을 다시 적을 때 hex를 `rgb()`로 바꾼다. 표기가 달라졌다고 팔레트에 있는
 * 색을 지우면, 소스 편집을 열었다 닫는 것만으로 색이 사라진다.
 */
test('rgb로 적힌 팔레트 색도 남긴다', () => {
  const result = cleanImportedHtml('<p><span style="color: rgb(192, 57, 43)">빨강</span></p>')

  expect(result.html).toContain('#c0392b')
})

test('소스 편집을 열었다 닫아도 색이 그대로다', () => {
  const written = '<p><span style="color: #c0392b">빨강</span>'
    + '<mark data-color="#fff3a3" style="background-color: #fff3a3">형광</mark></p>'

  const result = cleanImportedHtml(formatHtml(written))

  expect(result.html).toContain('#c0392b')
  expect(result.html).toContain('#fff3a3')
  expect(result.dropped).toEqual([])
})

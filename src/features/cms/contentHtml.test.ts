import { expect, test } from 'vitest'
import { cleanImportedHtml } from './contentHtml'

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

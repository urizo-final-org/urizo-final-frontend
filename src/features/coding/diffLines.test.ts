import { expect, test } from 'vitest'
import { diffLines } from './diffLines'

test('한 덩어리의 줄 종류를 통합 diff 문법대로 나눈다', () => {
  const diff = [
    'diff --git a/App.tsx b/App.tsx',
    'index d49b1d8..036d664 100644',
    '--- a/App.tsx',
    '+++ b/App.tsx',
    '@@ -447,7 +447,7 @@ function Boards() {',
    ' 그대로인 줄',
    '-지운 줄',
    '+넣은 줄',
  ].join('\n')

  expect(diffLines(diff).map((line) => line.kind)).toEqual([
    'meta', 'meta', 'meta', 'meta', 'hunk', 'context', 'removed', 'added',
  ])
})

// `+++`와 `---`는 추가·삭제 줄과 첫 글자가 같다. 종류를 첫 글자로만 판정하면 파일 이름
// 두 줄이 통째로 초록·빨강으로 물들어, 바뀐 것이 없는 파일도 바뀐 것처럼 보인다.
test('파일 이름 줄을 추가·삭제로 착각하지 않는다', () => {
  const kinds = diffLines('--- a/App.tsx\n+++ b/App.tsx').map((line) => line.kind)

  expect(kinds).toEqual(['meta', 'meta'])
})

test('빈 diff 는 빈 줄 하나로 읽고 터지지 않는다', () => {
  expect(diffLines('')).toEqual([{ kind: 'context', text: '' }])
})

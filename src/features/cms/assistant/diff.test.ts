import { expect, test } from 'vitest'
import { hasChange, lineDiff } from './diff'

test('identical text produces no change', () => {
  const lines = lineDiff('첫 줄\n둘째 줄', '첫 줄\n둘째 줄')

  expect(lines.map((line) => line.kind)).toEqual(['same', 'same'])
  expect(hasChange(lines)).toBe(false)
})

test('an inserted line leaves the following lines untouched', () => {
  const lines = lineDiff('가\n나\n다', '가\n새 줄\n나\n다')

  expect(lines).toEqual([
    { kind: 'same', text: '가' },
    { kind: 'added', text: '새 줄' },
    { kind: 'same', text: '나' },
    { kind: 'same', text: '다' },
  ])
})

test('a removed line is marked without shifting the rest', () => {
  const lines = lineDiff('가\n나\n다', '가\n다')

  expect(lines).toEqual([
    { kind: 'same', text: '가' },
    { kind: 'removed', text: '나' },
    { kind: 'same', text: '다' },
  ])
})

test('a replaced line shows both sides', () => {
  const lines = lineDiff('가\n나\n다', '가\n라\n다')

  expect(lines.filter((line) => line.kind === 'removed')).toEqual([{ kind: 'removed', text: '나' }])
  expect(lines.filter((line) => line.kind === 'added')).toEqual([{ kind: 'added', text: '라' }])
  expect(hasChange(lines)).toBe(true)
})

test('empty text on either side is handled', () => {
  expect(lineDiff('', '새 줄')).toEqual([
    { kind: 'removed', text: '' },
    { kind: 'added', text: '새 줄' },
  ])
  expect(lineDiff('지울 줄', '').map((line) => line.kind)).toEqual(['removed', 'added'])
})

test('a paragraph moved to the end is not reported as a full rewrite', () => {
  const before = '머리말\n\n본문 하나\n\n본문 둘'
  const after = '머리말\n\n본문 둘\n\n본문 하나'
  const lines = lineDiff(before, after)

  expect(lines.filter((line) => line.kind === 'same').length).toBeGreaterThan(2)
})

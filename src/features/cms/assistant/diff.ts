export type DiffLine = { kind: 'same' | 'removed' | 'added'; text: string }

/**
 * 줄 단위 diff. LCS로 공통 줄을 먼저 찾고 나머지를 삭제·추가로 표시한다.
 *
 * 줄 번호만 맞대어 비교하면 한 줄만 끼워 넣어도 이후 줄이 전부 바뀐 것처럼 보인다.
 * 본문은 문단을 넣고 빼는 편집이 많아 그 차이가 크다.
 */
export function lineDiff(before: string, after: string): DiffLine[] {
  const left = before.split('\n')
  const right = after.split('\n')
  const lengths = lcsLengths(left, right)
  const lines: DiffLine[] = []

  let l = 0
  let r = 0
  while (l < left.length && r < right.length) {
    if (left[l] === right[r]) {
      lines.push({ kind: 'same', text: left[l] })
      l += 1
      r += 1
    }
    else if (lengths[l + 1][r] >= lengths[l][r + 1]) {
      lines.push({ kind: 'removed', text: left[l] })
      l += 1
    }
    else {
      lines.push({ kind: 'added', text: right[r] })
      r += 1
    }
  }
  for (; l < left.length; l += 1) lines.push({ kind: 'removed', text: left[l] })
  for (; r < right.length; r += 1) lines.push({ kind: 'added', text: right[r] })
  return lines
}

/** 뒤에서부터 채우는 LCS 길이표. `lengths[i][j]`는 `left[i..]`와 `right[j..]`의 공통 길이다. */
function lcsLengths(left: string[], right: string[]): number[][] {
  const lengths = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0))
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = left[i] === right[j]
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }
  return lengths
}

/** 바뀐 줄이 하나도 없으면 diff를 보여줄 필요가 없다. */
export function hasChange(lines: DiffLine[]): boolean {
  return lines.some((line) => line.kind !== 'same')
}

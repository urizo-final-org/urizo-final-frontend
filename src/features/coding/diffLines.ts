export type DiffLineKind = 'added' | 'removed' | 'meta' | 'hunk' | 'context'
export type DiffLine = { kind: DiffLineKind; text: string }

/**
 * 통합 diff 한 덩어리를 줄 종류로 나눈다.
 *
 * CMS 도우미의 `lineDiff`는 변경 전후 두 문자열을 받아 스스로 비교하지만, 코딩 Job은
 * 서버가 이미 만든 git 통합 diff를 그대로 받는다. 다시 비교할 것이 없고 첫 글자가
 * 이미 종류를 말하므로 여기서는 읽기만 한다.
 */
export function diffLines(diff: string): DiffLine[] {
  return diff.split('\n').map((text) => ({ kind: kindOf(text), text }))
}

function kindOf(text: string): DiffLineKind {
  // 파일 머리말이 먼저다. `+++`와 `---`는 추가·삭제 줄과 첫 글자가 같아서, 순서를
  // 바꾸면 파일 이름 두 줄이 통째로 초록·빨강으로 물든다.
  if (text.startsWith('+++') || text.startsWith('---')
    || text.startsWith('diff --git ') || text.startsWith('index ')
    || text.startsWith('new file mode ') || text.startsWith('deleted file mode ')
    || text.startsWith('rename ') || text.startsWith('similarity index ')) {
    return 'meta'
  }
  if (text.startsWith('@@')) return 'hunk'
  if (text.startsWith('+')) return 'added'
  if (text.startsWith('-')) return 'removed'
  return 'context'
}

import { describe, expect, it } from 'vitest'
import { secondaryButton, smallButton } from '../../shared/ui/primitives'
import { noHover } from './no-hover'

describe('noHover', () => {
  // 정규식이 빗나가면 hover가 조용히 남는다 — 화면으로만 확인하면 놓친다.
  it('공용 버튼 스타일에서 hover 규칙만 없앤다', () => {
    for (const style of [secondaryButton, smallButton]) {
      const stripped = noHover(style)
      expect(stripped).not.toMatch(/hover:/)
      // hover 말고는 그대로 남아야 한다. 지운 만큼만 짧아진다.
      expect(style.split(' ').filter((c) => !c.startsWith('enabled:hover:')).join(' ')).toBe(stripped)
    }
  })

  it('hover가 없는 스타일은 그대로 둔다', () => {
    expect(noHover('inline-flex h-8 bg-line')).toBe('inline-flex h-8 bg-line')
  })
})

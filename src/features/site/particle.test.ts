import { describe, expect, it } from 'vitest'
import { withParticle } from './particle'

describe('withParticle', () => {
  it('picks the with-final form after a syllable that has one', () => {
    expect(withParticle('자연', '과', '와')).toBe('과')
    expect(withParticle('전주 한옥마을', '과', '와')).toBe('과')
  })

  it('picks the without-final form after an open syllable', () => {
    expect(withParticle('전주', '과', '와')).toBe('와')
    expect(withParticle('전주 한옥스테이', '과', '와')).toBe('와')
  })

  // 라틴 문자·숫자는 읽는 사람마다 받침 판단이 갈려 근거가 없다. 받침 없는 쪽으로 고정한다.
  it('falls back to the without-final form for non-Hangul endings', () => {
    expect(withParticle('cafe', '과', '와')).toBe('와')
    expect(withParticle('', '과', '와')).toBe('와')
  })
})

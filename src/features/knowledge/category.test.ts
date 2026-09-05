import { describe, expect, it } from 'vitest'
import { PORTAL_TABS } from '../site/portal-meta'
import { tabToCategory } from './category'

describe('tabToCategory', () => {
  it('maps every content tab to its category_id prefixes', () => {
    expect(tabToCategory('attraction')).toEqual(['NA', 'HS', 'VE'])
    expect(tabToCategory('stay')).toEqual(['AC'])
    expect(tabToCategory('food')).toEqual(['FD'])
    expect(tabToCategory('leisure')).toEqual(['LS', 'EX'])
    expect(tabToCategory('course')).toEqual(['C01'])
    expect(tabToCategory('shopping')).toEqual(['SH'])
    expect(tabToCategory('event')).toEqual(['EV'])
  })

  // 빈 배열이면 "필터는 걸되 아무 접두도 없다"로 읽힌다. 전체 탭은 필드를 아예 안 보낸다.
  it('sends nothing for 전체', () => {
    expect(tabToCategory('all')).toBeUndefined()
  })

  it('sends nothing for an unknown or missing tab id', () => {
    expect(tabToCategory('nope')).toBeUndefined()
    expect(tabToCategory(null)).toBeUndefined()
    expect(tabToCategory(undefined)).toBeUndefined()
  })

  // 매핑 원본은 portal-meta 하나뿐이다. 여기에 사본이 생기면 화면과 질의가 갈라진다.
  it('reads the mapping from PORTAL_TABS rather than a copy', () => {
    for (const tab of PORTAL_TABS) {
      expect(tabToCategory(tab.id)).toBe(tab.prefixes ?? undefined)
    }
  })
})

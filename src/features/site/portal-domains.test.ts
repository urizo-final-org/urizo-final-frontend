import { expect, test } from 'vitest'
import { PORTAL_TABS } from './portal-meta'
import { SME_DOMAIN, TOUR_DOMAIN, portalDomainOf } from './portal-domains'

test('routes the sme paths to the sme domain and everything else to tour', () => {
  expect(portalDomainOf('/sme')).toBe(SME_DOMAIN)
  expect(portalDomainOf('/sme/search')).toBe(SME_DOMAIN)
  expect(portalDomainOf('/')).toBe(TOUR_DOMAIN)
  expect(portalDomainOf('/search')).toBe(TOUR_DOMAIN)
})

// WBS의 "탭 8종": 전체 + 7분야. 분야 값은 원천 라벨이 그대로 category라 접두가 라벨 자신이다.
test('sme domain carries the eight field tabs whose prefixes are the labels themselves', () => {
  expect(SME_DOMAIN.tabs).toHaveLength(8)
  expect(SME_DOMAIN.tabs[0].prefixes).toBeNull()
  for (const tab of SME_DOMAIN.tabs.slice(1)) {
    expect(tab.prefixes).toEqual([tab.label])
  }
})

// 관광 도메인은 기존 상수를 그대로 참조한다 — 값 복제가 생기면 두 곳이 어긋난다.
test('tour domain reuses the existing portal tabs by reference', () => {
  expect(TOUR_DOMAIN.tabs).toBe(PORTAL_TABS)
  expect(TOUR_DOMAIN.searchPath).toBe('/search')
  expect(SME_DOMAIN.searchPath).toBe('/sme/search')
})

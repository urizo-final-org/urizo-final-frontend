import { describe, expect, it } from 'vitest'
import { addressLine, homepageLine, PORTAL_TABS } from './portal-meta'

describe('PORTAL_TABS', () => {
  // 코퍼스 접두 10종(AC/C01/EV/EX/FD/HS/LS/NA/SH/VE)이 빠짐없이, 겹침 없이 배정돼야
  // 탭 어디에도 안 잡히는 문서가 생기지 않는다(조사에서 확인된 SH 46건·EX 24건 누락 방지).
  it('covers every corpus category_id prefix exactly once', () => {
    const prefixes = PORTAL_TABS.flatMap((tab) => tab.prefixes ?? [])
    expect([...prefixes].sort()).toEqual(['AC', 'C01', 'EV', 'EX', 'FD', 'HS', 'LS', 'NA', 'SH', 'VE'])
  })

  it('keeps 전체 as the only unfiltered tab', () => {
    expect(PORTAL_TABS.filter((tab) => tab.prefixes === null).map((tab) => tab.id)).toEqual(['all'])
  })
})

// 실측 코퍼스에서 확인된 형태를 그대로 사용한다.
describe('addressLine', () => {
  it('reads the address line', () => {
    expect(addressLine('[이름] 도원\n[주소] 전북특별자치도 전주시 완산구 팔달로 58-3 (서서학동)\n[개요]\n…'))
      .toBe('전북특별자치도 전주시 완산구 팔달로 58-3 (서서학동)')
  })

  it('returns null when the document has no address line', () => {
    expect(addressLine('[분류] 추천코스\n[개요]\n걷기 좋은 길입니다.')).toBeNull()
  })

  it('returns null when the address value is blank', () => {
    expect(addressLine('[주소]  \n[개요] 내용')).toBeNull()
  })
})

// 실측 코퍼스 303건의 `[홈페이지]` 줄에서 확인된 네 가지 형태를 그대로 쓴다(9/5).
describe('homepageLine', () => {
  it('reads an https url', () => {
    expect(homepageLine('[이름] 배꼽축제\n[홈페이지] https://ygcf.or.kr/Festival/\n[개요] …'))
      .toBe('https://ygcf.or.kr/Festival/')
  })

  // http 87건은 그대로 쓴다 — 상위 탐색 이동은 mixed content 차단 대상이 아니다.
  it('keeps an http url as it is', () => {
    expect(homepageLine('[홈페이지] http://www.hadong.go.kr')).toBe('http://www.hadong.go.kr')
  })

  it('drops a value with no scheme instead of guessing one', () => {
    expect(homepageLine('[홈페이지] www.gokseong.go.kr')).toBeNull()
    expect(homepageLine('[홈페이지] airbnb.co.kr/h/yangstay')).toBeNull()
  })

  // 설명이 앞에 붙은 줄은 URL 뒤에 한글이 공백 없이 이어지는 사례가 있어 통째로 버린다.
  it('drops a line that does not start with the url', () => {
    expect(homepageLine('[홈페이지] 공식 홈페이지 https://www.sangsangmadang.com/camping')).toBeNull()
  })

  it('returns null when the document has no homepage line', () => {
    expect(homepageLine('[분류] 추천코스\n[주소] 전북 전주시')).toBeNull()
  })
})

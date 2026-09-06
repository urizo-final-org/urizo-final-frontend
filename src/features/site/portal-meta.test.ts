import { describe, expect, it } from 'vitest'
import { addressLine, homepageLine, overviewText, PORTAL_TABS } from './portal-meta'

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

describe('overviewText', () => {
  const document = [
    '[분류] 숙박 > 펜션/민박',
    '[유형] 숙박',
    '[이름] 더 한옥',
    '[주소] 전북특별자치도 전주시 완산구 은행로 68-15 (교동)',
    '[홈페이지] http://thehanok.modoo.at',
    '[개요]',
    '더한옥은 한옥마을 최중심지에 위치한다.',
    '조식으로 가래떡과 제철 과일을 대접한다.',
    '[상세정보]',
    '- 객실 수: 7',
  ].join('\n')

  // excerpt는 원문 앞 500자를 자른 값이라 라벨이 전부 섞여 있다. 그대로 본문에 넣으면
  // 화면에 '[분류] 숙박 > 펜션/민박 [유형] 숙박 …'이 보인다(9/6 실호출에서 확인).
  it('keeps only the overview and drops every label line', () => {
    const text = overviewText(document)
    expect(text).toBe('더한옥은 한옥마을 최중심지에 위치한다.\n조식으로 가래떡과 제철 과일을 대접한다.')
    for (const label of ['[분류]', '[유형]', '[이름]', '[주소]', '[홈페이지]', '[상세정보]']) {
      expect(text).not.toContain(label)
    }
  })

  it('reads an overview written on the label line itself', () => {
    expect(overviewText('[이름] 도원\n[개요] 한옥독채스테이다.')).toBe('한옥독채스테이다.')
  })

  // 개요가 없는 문서(대동고택 등)에서 본문을 통째로 비우지 않는다 — 라벨이 섞여도 내용이 낫다.
  it('falls back to the raw excerpt when there is no overview', () => {
    const raw = '[분류] 숙박 > 펜션/민박\n[주소] 전북 전주시'
    expect(overviewText(raw)).toBe(raw)
    expect(overviewText('[개요]\n[상세정보]')).toBe('[개요]\n[상세정보]')
  })
})

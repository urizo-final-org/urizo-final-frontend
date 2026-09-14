import { describe, expect, it, test } from 'vitest'
import { addressLine, categoryBadge, festivalBadge, highlightTitles, homepageLine, overviewText, PORTAL_TABS } from './portal-meta'

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

describe('categoryBadge', () => {
  // 실측값이다. 실수집 코퍼스에서 실제로 내려온 코드만 쓴다.
  it('turns source classification codes into the tab name', () => {
    expect(categoryBadge('EV03')).toBe('축제·행사')
    expect(categoryBadge('AC03')).toBe('숙박')
    expect(categoryBadge('FD02')).toBe('음식')
    expect(categoryBadge('NA01')).toBe('관광지')
    expect(categoryBadge('SH05')).toBe('쇼핑')
    // 추천코스는 접두가 세 글자다 — C0112도 C01로 걸린다.
    expect(categoryBadge('C0112')).toBe('추천코스')
  })

  // 픽스처 코퍼스는 한글 라벨을 보낸다. 그쪽은 아무것도 달라지면 안 된다.
  it('leaves a human label untouched', () => {
    expect(categoryBadge('숙박 > 펜션/민박')).toBe('숙박 > 펜션/민박')
    expect(categoryBadge('축제/공연/행사(유효)')).toBe('축제/공연/행사(유효)')
    expect(categoryBadge(undefined)).toBeUndefined()
  })

  // 모르는 코드를 감추면 무엇이 새로 들어왔는지 화면에서 알 길이 없어진다.
  it('keeps an unknown code visible instead of hiding it', () => {
    expect(categoryBadge('ZZ99')).toBe('ZZ99')
  })

  // 탭과 뱃지가 같은 원본을 본다는 것이 이 방식의 근거다. 복사본이 생기면 어긋난다.
  it('reads the mapping from PORTAL_TABS rather than a copy', () => {
    for (const tab of PORTAL_TABS) {
      for (const prefix of tab.prefixes ?? []) {
        expect(categoryBadge(`${prefix}01`)).toBe(tab.label)
      }
    }
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

  // 실수집 축제 본문은 `제목 + 라벨 줄`뿐이라 개요가 없다. 원문을 그대로 돌려주던 예전 계약은
  // 이 형태에서 곧 라벨 노출이었다 — 카드에 `[전화] …`가 보이고 제목이 두 번 나왔다.
  it('drops label lines and the repeated title when there is no overview', () => {
    const festival = [
      '가든 나이트 마켓',
      '[전화] 052-255-1823',
      '[주소] 울산광역시 남구 대공원로 94 (옥동)',
      '[행사시작] 20260729',
      '[행사종료] 20260829',
    ].join('\n')
    expect(overviewText(festival, '가든 나이트 마켓')).toBe('')
    expect(overviewText('[분류] 숙박 > 펜션/민박\n[주소] 전북 전주시')).toBe('')
  })

  // 비우는 것이 목적이 아니라 라벨을 걷어내는 것이 목적이다. 산문이 있으면 그대로 남는다.
  it('keeps prose that sits next to the labels', () => {
    expect(overviewText('대동고택\n[주소] 전주시\n한옥 독채 스테이입니다.', '대동고택'))
      .toBe('한옥 독채 스테이입니다.')
  })

  // `[개요]`는 있는데 값이 비는 경우는 근거가 달라지지 않았다 — 원문을 그대로 둔다.
  it('keeps the raw excerpt when the overview label itself is empty', () => {
    expect(overviewText('[개요]\n[상세정보]')).toBe('[개요]\n[상세정보]')
  })

  // 「울산 12경」 실측. 개요 본문이 대괄호 소제목으로 시작하면 예전에는 그 줄을 라벨로 오인해
  // 수집을 멈췄고, 개요가 비어 폴백이 원문을 돌려주는 바람에 카드에 라벨이 그대로 보였다.
  it('treats a bracketed sub-heading inside the overview as body, not a label', () => {
    const document = [
      '울산 12경',
      '[분류] 자연·관광지',
      '[주소] 울산광역시 남구 태화동',
      '[개요]',
      '[울산 1경 : 태화강 국가정원 십리대숲]',
      '우리나라 제2호 국가정원으로 십리대숲이 어우러진다.',
      '[상세정보]',
      '- 문의: 052-000-0000',
    ].join('\n')
    const text = overviewText(document, '울산 12경')

    expect(text).toBe('[울산 1경 : 태화강 국가정원 십리대숲]\n우리나라 제2호 국가정원으로 십리대숲이 어우러진다.')
    // 진짜 라벨은 여전히 수집을 멈춘다 — [상세정보] 뒤는 본문이 아니다.
    for (const label of ['[분류]', '[주소]', '[상세정보]', '문의']) {
      expect(text).not.toContain(label)
    }
  })
})

test('a festival badge is computed from the period, not frozen into the copy', () => {
  const during = new Date(2026, 8, 10)
  expect(festivalBadge('2026-05-01', '2026-11-01', during)).toBe('진행 중')
  expect(festivalBadge('2026-10-03', '2026-10-18', during)).toBe('D-23')
  expect(festivalBadge('2026-08-28', '2026-08-30', during)).toBe('종료')
  // 시작일·종료일 당일은 아직 진행 중이다.
  expect(festivalBadge('2026-09-10', '2026-09-10', during)).toBe('진행 중')
})

test('a summary bolds only the cited titles and keeps the segments glued together', () => {
  const answer = '전주에서는 객리단길의 한옥 독채 스테이 도원이 근거 문서에서 확인됩니다. 대동고택도 참고하세요.'
  const parts = highlightTitles(answer, ['도원', '대동고택', '없는문서'])
  // 이어 붙이면 원문 그대로여야 한다 — 조사 앞에 공백이 생기면 "도원 이"가 된다.
  expect(parts.map((part) => part.text).join('')).toBe(answer)
  expect(parts.filter((part) => part.bold).map((part) => part.text)).toEqual(['도원', '대동고택'])
})

test('a title that only appears inside a longer word is left alone', () => {
  // 실호출 사례 — 인용 제목은 "도원"인데 답변 문장은 "다가도원은"으로 시작한다.
  const parts = highlightTitles('다가도원은 객리단길에 위치한 한옥독채스테이다.', ['도원'])
  expect(parts.some((part) => part.bold)).toBe(false)
  // 조사는 그대로 붙는다 — 낱말 첫머리의 제목은 계속 굵어져야 한다.
  expect(highlightTitles('도원은 한옥이다.', ['도원']).filter((part) => part.bold)).toEqual([{ text: '도원', bold: true }])
})

test('a summary with no cited title in it stays one plain segment', () => {
  expect(highlightTitles('근거를 찾지 못했습니다.', ['도원'])).toEqual([{ text: '근거를 찾지 못했습니다.', bold: false }])
})

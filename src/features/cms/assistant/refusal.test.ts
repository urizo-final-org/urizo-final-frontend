import { describe, expect, test } from 'vitest'
import { GUARDRAIL_REFUSAL, refusalGuide, refusalMessage } from './refusal'

describe('refusalGuide', () => {
  test('메뉴 화면의 게시글 요청은 게시판 관리로 안내한다', () => {
    expect(refusalGuide('자유게시판에 "공지합니다"라는 제목으로 글 등록해줘', '메뉴 관리'))
      .toBe('이 요청은 게시판 관리 화면에서 할 수 있어요.')
  })

  test('메뉴 낱말이 함께 있어도 다른 화면 낱말을 먼저 본다', () => {
    expect(refusalGuide('메뉴에 걸린 게시판에 글 하나 올려줘', '메뉴 관리'))
      .toBe('이 요청은 게시판 관리 화면에서 할 수 있어요.')
  })

  test('지금 화면 자신은 안내 대상이 아니다', () => {
    expect(refusalGuide('메뉴를 정리해줘', '메뉴 관리'))
      .toBe('메뉴 관리 화면에서 할 수 있는 요청으로 바꿔 주세요.')
  })

  test('짚이는 화면이 없으면 지금 화면으로 되돌린다', () => {
    expect(refusalGuide('그냥 알아서 해줘', '컨텐츠 관리'))
      .toBe('컨텐츠 관리 화면에서 할 수 있는 요청으로 바꿔 주세요.')
  })
})

describe('refusalMessage', () => {
  /**
   * 가드레일이 막은 것은 모델 문장을 쓰지 않는다. 「이 화면은 …할 수 없습니다」로 오면
   * 기능 한계처럼 들려, 관리자가 스스로 켤 수 있는 설정이라는 것이 드러나지 않는다.
   */
  test('가드레일이 막았으면 설정 때문이라고 말한다', () => {
    expect(refusalMessage(
      GUARDRAIL_REFUSAL,
      '이 화면은 삭제를 할 수 없습니다.',
      '이 메뉴 지워줘',
      '메뉴 관리'))
      .toBe('방금 요청은 가드레일 설정에 의해 막혀 있습니다. 다른 요청을 해 주세요.')
  })

  test('범위 밖 요청은 모델이 쓴 사유를 그대로 쓴다', () => {
    expect(refusalMessage(
      null,
      '이 화면은 게시판 생성만 가능하며, 글 작성은 할 수 없습니다.',
      '자유게시판에 글 써줘',
      '게시판 관리'))
      .toBe('이 화면은 게시판 생성만 가능하며, 글 작성은 할 수 없습니다.')
  })

  /**
   * 사유가 없는 Job도 있다. 이 화면이 오래 쓰던 추측이 그때의 되돌아갈 자리다.
   * 그 추측은 가드레일이 닫은 동작에서 반드시 틀리므로 위 두 갈래가 먼저 잡는다.
   */
  test('사유가 없으면 예전 추측으로 되돌아간다', () => {
    expect(refusalMessage(null, null, '자유게시판에 글 등록해줘', '메뉴 관리'))
      .toBe('이 요청은 게시판 관리 화면에서 할 수 있어요.')
  })

  test('빈 문자열은 사유가 아니다', () => {
    expect(refusalMessage(null, '   ', '그냥 알아서 해줘', '컨텐츠 관리'))
      .toBe('컨텐츠 관리 화면에서 할 수 있는 요청으로 바꿔 주세요.')
  })
})

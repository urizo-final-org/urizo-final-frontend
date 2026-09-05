import { describe, expect, test } from 'vitest'
import { refusalGuide } from './refusal'

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

import { describe, expect, it } from 'vitest'

import { NEW_BOARD_TARGET, postTargetId } from './CmsAiAssistant'

/**
 * 서버가 게시물을 알아보는 유일한 단서가 이 id 형식이다.
 *
 * 게시물은 별도 Resource 타입이 아니라 `BOARD` 안에서 id 모양으로 갈리고, 소속 게시판도
 * 이 문자열이 담는다. 형식이 어긋나면 서버는 게시판 대상으로 읽고 숫자 id 검사에서 멈춘다.
 * Backend의 `NaturalCmsResourceService.POST_ID`와 같은 식을 여기에 박아 둔다.
 */
const SERVER_POST_ID = /^board:([1-9][0-9]*):post:(new|[1-9][0-9]*)$/

describe('게시판 화면의 대상 id', () => {
  it('게시물은 소속 게시판을 함께 담는다', () => {
    expect(postTargetId(4, 12)).toBe('board:4:post:12')
    expect(SERVER_POST_ID.test(postTargetId(4, 12))).toBe(true)
  })

  it('게시물 등록은 게시물 자리에 new를 쓴다', () => {
    expect(postTargetId(4, 'new')).toBe('board:4:post:new')
    expect(SERVER_POST_ID.test(postTargetId(4, 'new'))).toBe(true)
  })

  it('게시판 등록 표식은 게시물 형식과 겹치지 않는다', () => {
    expect(NEW_BOARD_TARGET.id).toBe('new')
    expect(SERVER_POST_ID.test(NEW_BOARD_TARGET.id)).toBe(false)
  })

  it('게시판 대상은 숫자 id 그대로여서 게시물로 읽히지 않는다', () => {
    expect(SERVER_POST_ID.test('4')).toBe(false)
  })
})

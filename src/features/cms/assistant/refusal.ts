/**
 * 범위 밖 요청은 거부가 아니라 안내다.
 *
 * 서버가 사유를 실어 보내면 그것을 쓴다. 아래 추측은 사유가 없을 때만 쓰는 되돌아갈 자리다.
 * 오래 이것뿐이었던 이유는 판정 사유가 Handler 결과에만 남고 Job에 실리지 않아서였다.
 */
import { operationLabel, operationRank } from './guardrailLabels'

/** 관리자가 가드레일에서 끈 것. 「요청을 고치세요」가 아니라 「관리자에게 문의하세요」다. */
export const GUARDRAIL_REFUSAL = 'CMS_OPERATION_NOT_ALLOWED'

/**
 * 받침이 있으면 「이」, 없으면 「가」.
 *
 * 「삭제가」와 「수정이」가 갈린다. 「이(가)」로 적으면 화면이 서식 안내문처럼 읽힌다.
 */
function subjectParticle(word: string): string {
  const last = word.charCodeAt(word.length - 1)
  const hangul = last >= 0xac00 && last <= 0xd7a3
  return hangul && (last - 0xac00) % 28 !== 0 ? '이' : '가'
}

/**
 * 화면에 띄울 한 문장.
 *
 * 가드레일이 막은 것은 우리가 정한 고정 문장을 쓴다. 모델이 쓴 사유는 「이 화면은 …할 수
 * 없습니다」처럼 기능 한계를 말하는 투라, 관리자가 스스로 켤 수 있는 설정이라는 것이 드러나지
 * 않는다. 범위 밖 요청은 모델 문장이 이미 정확해 그대로 쓴다.
 *
 * 무엇이 막혔는지까지 말한다. 「금지됩니다」만으로는 관리자가 같은 요청을 표현만 바꿔
 * 되풀이한다. 서버는 동작 키만 싣고 한글은 설정 화면과 같은 라벨로 여기서 붙인다.
 */
export function refusalMessage(
  refusalCode: string | null,
  refusalReason: string | null,
  requestText: string,
  section: string,
  refusedOperations: readonly string[] = [],
): string {
  if (refusalCode === GUARDRAIL_REFUSAL) {
    const named = [...refusedOperations]
      .sort((left, right) => operationRank(left) - operationRank(right))
      .map(operationLabel)
    if (named.length === 0) {
      // 서버가 동작을 싣지 못했을 때. 「무엇이」만 빠지고 나머지 문장은 같게 둔다.
      return '방금 요청은 가드레일 설정에 의해 금지됩니다. 다른 요청을 해 주세요.'
    }
    const listed = named.join(', ')
    return `방금 요청은 가드레일 설정에 의해 ${listed}${subjectParticle(listed)}`
      + ' 금지됩니다. 다른 요청을 해 주세요.'
  }
  const reason = refusalReason?.trim()
  return reason ? reason : refusalGuide(requestText, section)
}
const SCREENS: readonly { section: string; words: readonly string[] }[] = [
  // 게시판을 먼저 본다. "게시판에 글 등록"처럼 메뉴 화면 낱말과 겹쳐 들어오는 경우가 있다.
  { section: '게시판 관리', words: ['게시글', '게시물', '게시판', '댓글', '글 등록', '글등록', '글 작성'] },
  { section: '컨텐츠 관리', words: ['컨텐츠', '콘텐츠', '본문', '페이지 내용'] },
  { section: '템플릿 관리', words: ['템플릿', '디자인', '레이아웃', '색상', '헤더', '푸터', '배너'] },
  { section: '회원 관리', words: ['회원', '계정', '비밀번호', '권한'] },
  { section: '메뉴 관리', words: ['메뉴'] },
]

/** 지금 화면이 아닌 곳의 낱말이 보이면 그 화면 이름을 알려준다. 이동 버튼은 만들지 않는다. */
export function refusalGuide(requestText: string, section: string): string {
  const elsewhere = SCREENS.find((screen) => screen.section !== section
    && screen.words.some((word) => requestText.includes(word)))
  return elsewhere
    ? `이 요청은 ${elsewhere.section} 화면에서 할 수 있어요.`
    : `${section} 화면에서 할 수 있는 요청으로 바꿔 주세요.`
}

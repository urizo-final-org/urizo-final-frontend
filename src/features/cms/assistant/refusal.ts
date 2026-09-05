/**
 * 범위 밖 요청은 거부가 아니라 안내다.
 *
 * 어느 화면에서 되는지는 화면이 계산한다. 되묻기 후보를 화면이 만드는 것과 같은 자리다.
 * 파이프라인은 판정 사유를 Handler 결과에만 남기고 Job에는 싣지 않으므로 화면이 읽을 수 없다.
 */
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

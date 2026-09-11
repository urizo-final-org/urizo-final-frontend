import type { NaturalCmsGuardrailResourceKey } from './guardrailApi'

/**
 * 서버가 주는 키를 사람이 읽는 이름으로 바꾼다.
 *
 * LLM Ops 울타리가 폴더 경로마다 라벨을 두는 것과 같은 이유다. 라벨이 없으면 `targetId`가
 * 그대로 관리자 앞에 놓인다. 서버 계약은 영문 키를 쓰고 화면은 한글로만 말한다.
 *
 * 이름을 모르는 키는 키 자체를 보여준다. 감추는 것보다 낫다. 대상이나 필드가 새로 열리면
 * 화면은 서버 목록을 그대로 그리므로, 라벨만 여기에 더하면 된다.
 */

export const RESOURCE_LABELS: Record<NaturalCmsGuardrailResourceKey, string> = {
  MENU: '메뉴',
  BOARD: '게시판',
  // 게시판 안에 있다는 것을 이름으로 보인다. 경로가 게시판과 같아서 경로로는 갈리지 않는다.
  BOARD_POST: '└ 게시물',
  CONTENT: '컨텐츠',
}

/** 이 설정이 적용되는 관리 화면. LLM Ops 탭이 폴더 경로를 보여주는 자리와 같다. */
export const RESOURCE_SCREENS: Record<NaturalCmsGuardrailResourceKey, string> = {
  MENU: '/admin/menus',
  BOARD: '/admin/boards',
  BOARD_POST: '/admin/boards',
  CONTENT: '/admin/contents',
}

/**
 * 명령의 `fields` 키에 붙는 이름.
 *
 * 대상마다 같은 키가 다른 뜻일 수 있어 `대상:키`로 적는다. 지금은 겹치는 것이 없지만
 * 게시물과 컨텐츠가 둘 다 `title`·`body`를 쓰므로 앞으로 갈릴 여지가 있다.
 */
const FIELD_LABELS: Record<string, string> = {
  'MENU:name': '이름',
  'MENU:path': '주소',
  'MENU:parentId': '상위 메뉴',
  'MENU:displayOrder': '정렬 순서',
  'MENU:position': '위치',
  'MENU:targetType': '연결 종류',
  'MENU:targetId': '연결 대상',
  'BOARD:name': '이름',
  'BOARD:description': '설명',
  'BOARD_POST:title': '제목',
  'BOARD_POST:body': '본문',
  'CONTENT:title': '제목',
  'CONTENT:body': '본문',
}

/**
 * 닫으면 그 대상의 등록이 막히는 필드.
 *
 * 등록은 현재 값이 없어 필수 필드를 못 보내면 항상 실패한다. 수정은 보내지 않은 필드에
 * 현재 값을 채우므로 영향이 없다. 서버 계약의 `@NotBlank`와 같은 목록이며, 어긋나면
 * 화면이 막히지 않는다고 말하는 사이 등록이 죽는다.
 */
const REQUIRED_FIELDS: Record<string, true> = {
  'MENU:name': true,
  'MENU:path': true,
  'MENU:targetType': true,
  'BOARD:name': true,
  'BOARD_POST:title': true,
  'BOARD_POST:body': true,
  'CONTENT:title': true,
  'CONTENT:body': true,
}

export function fieldLabel(resourceKey: NaturalCmsGuardrailResourceKey, name: string): string {
  return FIELD_LABELS[`${resourceKey}:${name}`] ?? name
}

export function isRequiredField(
  resourceKey: NaturalCmsGuardrailResourceKey, name: string,
): boolean {
  return REQUIRED_FIELDS[`${resourceKey}:${name}`] === true
}

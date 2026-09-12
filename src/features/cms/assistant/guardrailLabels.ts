import type { NaturalCmsGuardrailResourceKey } from './guardrailApi'

/**
 * 서버가 주는 키를 사람이 읽는 이름으로 바꾼다.
 *
 * LLM Ops 가드레일이 폴더 경로마다 라벨을 두는 것과 같은 이유다. 라벨이 없으면 `BOARD_POST`나
 * `targetId`가 그대로 관리자 앞에 놓인다. 서버 계약은 영문 키를 쓰고 화면은 한글로만 말한다.
 *
 * 이름을 모르는 키는 키 자체를 보여준다. 감추는 것보다 낫다. 대상이나 동작이 새로 열리면
 * 화면은 서버 목록을 그대로 그리므로, 라벨만 여기에 더하면 된다.
 */

export const RESOURCE_LABELS: Record<NaturalCmsGuardrailResourceKey, string> = {
  MENU: '메뉴',
  BOARD: '게시판',
  BOARD_POST: '게시물',
  CONTENT: '컨텐츠',
}

/** 이 설정이 적용되는 대상을 사람이 직접 관리하는 화면. 여기는 가드레일이 걸리지 않는다. */
export const RESOURCE_SCREENS: Record<NaturalCmsGuardrailResourceKey, string> = {
  MENU: '/admin/menus',
  BOARD: '/admin/boards',
  BOARD_POST: '/admin/boards',
  CONTENT: '/admin/contents',
}

const OPERATION_LABELS: Record<string, string> = {
  CREATE: '등록',
  UPDATE: '수정',
  DELETE: '삭제',
}

/** 켜고 끄는 순서를 고정한다. 서버는 정렬해 내려주므로 등록·삭제·수정이 된다. */
const OPERATION_ORDER = ['CREATE', 'UPDATE', 'DELETE']

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

export function operationLabel(name: string): string {
  return OPERATION_LABELS[name] ?? name
}

/** 등록 · 수정 · 삭제 순으로 세운다. 모르는 동작은 뒤에 붙여 사라지지 않게 한다. */
export function operationRank(name: string): number {
  const rank = OPERATION_ORDER.indexOf(name)
  return rank === -1 ? OPERATION_ORDER.length : rank
}

export function fieldLabel(resourceKey: NaturalCmsGuardrailResourceKey, name: string): string {
  return FIELD_LABELS[`${resourceKey}:${name}`] ?? name
}

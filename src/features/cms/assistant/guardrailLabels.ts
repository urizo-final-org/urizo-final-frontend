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

/**
 * 닿을 수 없는 대상의 이름.
 *
 * 설정 대상 넷에 템플릿이 더해진다. 템플릿은 켜고 끌 수 없지만 「여기서 템플릿을 바꿀 수
 * 있나」는 관리자가 실제로 하는 질문이라 목록에는 나와야 한다.
 */
export function resourceLabel(key: string): string {
  return (RESOURCE_LABELS as Record<string, string>)[key] ?? (key === 'TEMPLATE' ? '템플릿' : key)
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

/**
 * 그 대상에만 걸리는 제약의 문구.
 *
 * 조건이 되는 부분만 굵게 한다. 문장이 길어 핵심이 어디인지 훑어지지 않으면, 카드 세 칸
 * 중에서 이 칸만 읽고 넘어가지 못한다. 문자열을 잘라 찾지 않고 조각으로 선언한다 —
 * 같은 낱말이 문장에 두 번 나오면 자르는 쪽은 엉뚱한 데를 굵게 한다.
 *
 * 숫자는 서버가 실어 보낸다. 화면이 상한을 적어 두면 코드가 그 값을 바꿀 때 화면이 거짓말을
 * 한다. 모르는 키는 키를 그대로 보여준다 — 감추면 제약이 사라진 것처럼 보인다.
 */
export type LockPart = string | { strong: string }

const LOCK_LABELS: Record<string, (value: number | null) => LockPart[]> = {
  MENU_DELETE_CASCADE: (value) => [
    '하위를 포함해 ', { strong: `한 번에 ${value ?? '?'}개까지만` }, ' 삭제'],
  MENU_POSITION_ORDINAL: () => ['자리는 형제 안의 ', { strong: '순서로만' }, ' 말함'],
  MENU_LINK_TARGET_ONLY: () => [
    { strong: '연결 대상은 고르기만 함.' }, ' 그 컨텐츠·게시판을 고치지는 못함'],
  BOARD_DELETE_EMPTY_ONLY: () => [
    { strong: '비어 있는 게시판만' }, ' 삭제. 사람은 글이 있어도 지울 수 있음'],
  POST_BOARD_BOUND: () => [
    '고른 ', { strong: '게시판에 속한 글만' }, ' 다룸. 소속을 서버가 대조'],
  POST_NO_BOARD_MOVE: () => ['글을 ', { strong: '다른 게시판으로 옮길 수 없음' }],
  CONTENT_BODY_ALLOWLIST: () => [
    '본문은 ', { strong: '지정된 서식 · 색 10개' }, '만. 저장 전에 서버가 검증'],
  CONTENT_IMAGE_SOURCE: () => ['사진은 ', { strong: '본문에 있거나 첨부된 것' }, '만'],
}

export function lockLabel(key: string, value: number | null): LockPart[] {
  const write = LOCK_LABELS[key]
  return write ? write(value) : [key]
}

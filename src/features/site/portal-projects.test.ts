import { afterEach, expect, test } from 'vitest'
import { portalPathOf, portalProjectKey, projectIdOf, withProject } from './portal-projects'

const NEW_ID = '11111111-2222-3333-4444-555555555555'
const LINKED = '99999999-8888-7777-6666-555555555555'
const OTHER_PC = '95725d1e-eeb2-45a8-9065-8118928fddd6'

afterEach(() => window.localStorage.removeItem(portalProjectKey('sme')))

// 회귀: 예전에는 여기서 작성자 PC의 런타임 UUID로 떨어졌다. 그 값은 다른 PC에 없는
// 고객사라 조회가 실패하거나, 있으면 남의 고객사 답변을 보여줬다.
test('resolves to nothing when no project is linked', () => {
  expect(projectIdOf('/sme')).toBeUndefined()
  expect(projectIdOf('/sme/search')).toBeUndefined()
})

// 매핑에 없는 경로는 projectId를 싣지 않는다 — 서버의 기본(관광) 챗봇 경로가 그대로 남는다.
test('leaves unmapped paths on the default chatbot route', () => {
  expect(projectIdOf('/')).toBeUndefined()
  expect(projectIdOf('/search')).toBeUndefined()
  expect(projectIdOf('/support/notices')).toBeUndefined()
})

// 라이브 등록 직후의 새 UUID가 잡혀야 촬영 흐름이 끊기지 않는다.
test('prefers the onboarding-recorded project', () => {
  window.localStorage.setItem(portalProjectKey('sme'), LINKED)
  expect(projectIdOf('/sme')).toBe(LINKED)
})

test('prefers an explicit deep-link query over everything', () => {
  window.localStorage.setItem(portalProjectKey('sme'), LINKED)
  expect(projectIdOf('/sme', `?project=${NEW_ID}`)).toBe(NEW_ID)
})

// 관리 화면의 포털 주소 표기(AI02-021). 고객사 식별은 이름으로 한다 — UUID는 PC마다
// 새로 생기지만 이름은 어느 PC에서도 같다.
test('portalPathOf hands the admin a working deep link', () => {
  expect(portalPathOf(NEW_ID, '중소벤처기업부')).toBe(`/sme?project=${NEW_ID}`)
  expect(portalPathOf(NEW_ID, '관광 포털')).toBe('/')
  expect(portalPathOf(NEW_ID, '이름 매핑도 등록 기록도 없음')).toBeNull()
})

// 이름 매핑에 없는 신규 고객사는 온보딩이 남긴 기록으로 찾는다.
test('portalPathOf falls back to the onboarding record', () => {
  window.localStorage.setItem(portalProjectKey('sme'), LINKED)
  expect(portalPathOf(LINKED, '온보딩으로 갓 만든 고객사')).toBe(`/sme?project=${LINKED}`)
})

// 쿼리·기록이 UUID 꼴이 아니면 무시한다 — 깨진 값으로 서버 400을 만들지 않는다.
test('ignores malformed identifiers and resolves to nothing', () => {
  window.localStorage.setItem(portalProjectKey('sme'), 'not-a-uuid')
  expect(projectIdOf('/sme')).toBeUndefined()
  expect(projectIdOf('/sme', '?project=garbage')).toBeUndefined()
})

// 회귀의 핵심: 포털 안을 이동해도 고객사가 따라와야 한다.
test('withProject carries the current customer through a move', () => {
  const next = withProject(new URLSearchParams('q=창업'), `?project=${NEW_ID}`)
  expect(next.get('project')).toBe(NEW_ID)
  expect(next.get('q')).toBe('창업')
})

test('withProject adds nothing when the move starts without a project', () => {
  expect(withProject(new URLSearchParams('q=창업'), '').has('project')).toBe(false)
  expect(withProject(new URLSearchParams(), '?project=garbage').has('project')).toBe(false)
})

// 이동한 뒤 다시 읽어도 같은 고객사여야 한다. 두 함수가 한 쌍으로 동작하는지 본다.
test('a move keeps the deep-linked customer resolvable', () => {
  const moved = withProject(new URLSearchParams('q=수출'), `?project=${OTHER_PC}`).toString()
  expect(projectIdOf('/sme/search', `?${moved}`)).toBe(OTHER_PC)
})

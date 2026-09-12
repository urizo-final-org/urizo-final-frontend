import { afterEach, expect, test } from 'vitest'
import { portalProjectKey, projectIdOf } from './portal-projects'

const NEW_ID = '11111111-2222-3333-4444-555555555555'
const LINKED = '99999999-8888-7777-6666-555555555555'

afterEach(() => window.localStorage.removeItem(portalProjectKey('sme')))

test('resolves the sme portal and its sub paths to the sme project', () => {
  const home = projectIdOf('/sme')
  expect(home).toBeDefined()
  expect(projectIdOf('/sme/search')).toBe(home)
})

// 매핑에 없는 경로는 projectId를 싣지 않는다 — 서버의 기본(관광) 챗봇 경로가 그대로 남는다.
test('leaves unmapped paths on the default chatbot route', () => {
  expect(projectIdOf('/')).toBeUndefined()
  expect(projectIdOf('/search')).toBeUndefined()
  expect(projectIdOf('/support/notices')).toBeUndefined()
})

// 라이브 등록 직후의 새 UUID가 상수보다 먼저 잡혀야 촬영 흐름이 끊기지 않는다.
test('prefers the onboarding-recorded project over the constant', () => {
  window.localStorage.setItem(portalProjectKey('sme'), LINKED)
  expect(projectIdOf('/sme')).toBe(LINKED)
})

test('prefers an explicit deep-link query over everything', () => {
  window.localStorage.setItem(portalProjectKey('sme'), LINKED)
  expect(projectIdOf('/sme', `?project=${NEW_ID}`)).toBe(NEW_ID)
})

// 쿼리·기록이 UUID 꼴이 아니면 무시한다 — 깨진 값으로 서버 400을 만들지 않는다.
test('ignores malformed identifiers and falls through', () => {
  window.localStorage.setItem(portalProjectKey('sme'), 'not-a-uuid')
  const constant = projectIdOf('/sme')
  expect(constant).toBeDefined()
  expect(constant).not.toBe('not-a-uuid')
  expect(projectIdOf('/sme', '?project=garbage')).toBe(constant)
})

import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { OpsRouteId } from '../../app/routes'
import OpsWorkspace from './OpsWorkspace'

/** Static mockups, so a render plus its heading is the whole contract worth pinning. */
const screens: [OpsRouteId, string][] = [
  ['home', '안녕하세요, 일반 관리자님'],
  ['agents', 'Agent 관리'],
  ['models', '모델 및 Provider 관리'],
  ['rag', 'RAG 관리'],
  ['devops', 'LLM DevOps'],
  ['approvals', '승인 관리'],
  ['runs', '실행 이력'],
  ['settings', '설정'],
]

test.each(screens)('the %s mockup renders its heading', (route, heading) => {
  render(<OpsWorkspace route={route} actorName="일반 관리자" roleLabel="일반관리자" />)
  expect(screen.getByRole('heading', { name: heading, level: 1 })).toBeInTheDocument()
})

test('every mockup says its data is not real', () => {
  for (const [route] of screens) {
    const view = render(<OpsWorkspace route={route} actorName="일반 관리자" roleLabel="일반관리자" />)
    expect(view.container.textContent).toMatch(/데모|Mock|목업/)
    view.unmount()
  }
})

test('the home mockup greets the signed-in operator, not a fixed name', () => {
  render(<OpsWorkspace route="home" actorName="최고 관리자" roleLabel="최고관리자" />)
  expect(screen.getByRole('heading', { name: '안녕하세요, 최고 관리자님', level: 1 })).toBeInTheDocument()
})

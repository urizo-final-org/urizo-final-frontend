import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import NaturalCmsGuardrailPanel from './NaturalCmsGuardrailPanel'
import type {
  NaturalCmsGuardrailApi, NaturalCmsGuardrailResourceKey, NaturalCmsGuardrailView,
} from './guardrailApi'

/**
 * 정하는 단위는 `대상 × 동작`이다. 여기서 고정하는 것은 셋이다 — 대상마다 따로 닫히는지,
 * 관리자가 몰랐을 법한 상태만 알리는지, 저장 전에 무엇이 바뀌는지 보여주는지.
 */

/** 서버는 동작을 정렬해 내려준다. 화면이 등록·수정·삭제로 다시 세우는지도 여기서 본다. */
function resource(key: NaturalCmsGuardrailResourceKey, on: string[], fields: string[]) {
  return {
    resourceKey: key,
    operations: ['CREATE', 'DELETE', 'UPDATE'].map((name) => ({
      name, enabled: on.includes(name),
    })),
    fields,
    excludes: ['MENU', 'BOARD', 'BOARD_POST', 'CONTENT', 'TEMPLATE'].filter((it) => it !== key),
  }
}

function view(...resources: NaturalCmsGuardrailView['resources']): NaturalCmsGuardrailView {
  return { configured: true, resources }
}

const ALL = ['CREATE', 'UPDATE', 'DELETE']

function open(): NaturalCmsGuardrailView {
  return view(
    resource('MENU', ALL, ['name', 'path']),
    resource('CONTENT', ALL, ['title', 'body']))
}

/**
 * 대상 이름은 카드 제목에도 제외 목록에도 나온다. 본문 글자로 찾으면 갈리지 않으므로
 * 카드의 접근 가능한 이름으로 집는다.
 */
function menuCard() {
  return screen.findByRole('region', { name: '메뉴 가드레일' })
}

function api(current: NaturalCmsGuardrailView, saved = current): NaturalCmsGuardrailApi {
  return {
    guardrail: vi.fn(async () => current),
    saveGuardrail: vi.fn(async () => saved),
  } as unknown as NaturalCmsGuardrailApi
}

test('목록은 서버가 여는 대상과 동작에서 나온다', async () => {
  render(<NaturalCmsGuardrailPanel api={api(open())} />)

  const menu = await menuCard()
  expect(screen.getByRole('region', { name: '컨텐츠 가드레일' })).toBeInTheDocument()
  // 동작은 한 대상 안에서 등록 · 수정 · 삭제 순으로 선다. 서버 정렬은 알파벳순이다.
  expect(within(menu).getAllByRole('checkbox')
    .map((box) => box.closest('label')?.textContent?.trim()))
    .toEqual(['등록', '수정', '삭제'])
  // 필드는 체크박스가 아니라 그 대상이 무엇을 다루는지 알려 주는 표시다.
  expect(within(menu).getByText('이름 · 주소')).toBeInTheDocument()
})

/**
 * 닿을 수 없는 대상은 서버가 준다. 화면이 목록을 갖고 있으면 서버가 새 대상을 열 때
 * 화면이 거짓말을 한다 — 메뉴 제외 목록이 빠져 있던 것을 찾아 고친 그 문제다.
 */
test('넘어갈 수 없는 대상을 서버 목록 그대로 보여준다', async () => {
  render(<NaturalCmsGuardrailPanel api={api(open())} />)
  await menuCard()
  const excludes = within(screen.getByRole('list', { name: '메뉴에서 넘어갈 수 없는 곳' }))

  // 설정 대상이 아닌 템플릿도 나온다. 「여기서 템플릿을 바꿀 수 있나」는 실제로 나오는 질문이다.
  expect(excludes.getByText('템플릿')).toBeInTheDocument()
  expect(excludes.getByText('컨텐츠')).toBeInTheDocument()
  // 자기 자신은 자기 목록에 없다.
  expect(excludes.queryByText('메뉴')).not.toBeInTheDocument()
})

/**
 * 전역 스위치 하나였을 때는 한 대상을 잠그려다 넷이 함께 잠겼다.
 * 이 테스트가 그 회귀를 막는다.
 */
test('저장은 대상마다 따로 담아 보낸다', async () => {
  const client = api(open())
  render(<NaturalCmsGuardrailPanel api={client} />)
  await menuCard()

  // 메뉴 삭제만 끈다.
  fireEvent.click(screen.getAllByRole('checkbox')[2])
  fireEvent.click(screen.getByRole('button', { name: '저장' }))
  fireEvent.click(await screen.findByRole('button', { name: '확인하고 저장' }))

  await waitFor(() => expect(client.saveGuardrail).toHaveBeenCalled())
  const sent = vi.mocked(client.saveGuardrail).mock.calls[0][0]
  // 켠 것만 보내면 나머지가 "선택된 적 없음"인지 "꺼짐"인지 서버가 구분할 수 없다.
  expect(sent.operations).toHaveLength(6)
  expect(sent.operations).toContainEqual(
    { resourceKey: 'MENU', operation: 'DELETE', enabled: false })
  expect(sent.operations).toContainEqual(
    { resourceKey: 'CONTENT', operation: 'DELETE', enabled: true })
})

test('저장 전에 무엇이 바뀌는지 보여주고 한 번 더 받는다', async () => {
  const client = api(open())
  render(<NaturalCmsGuardrailPanel api={client} />)
  await menuCard()

  fireEvent.click(screen.getAllByRole('checkbox')[0])
  fireEvent.click(screen.getAllByRole('checkbox')[2])
  fireEvent.click(screen.getByRole('button', { name: '저장' }))

  // 관리 하나가 한 줄이다. 동작마다 한 줄씩 쌓으면 같은 이름이 세 번 나온다.
  expect(await screen.findByText('등록 · 삭제를 끕니다')).toBeInTheDocument()
  // 확인에서 물러서면 아무것도 보내지 않는다.
  fireEvent.click(screen.getByRole('button', { name: '취소' }))
  expect(client.saveGuardrail).not.toHaveBeenCalled()
})

/** 삭제만 남은 대상은 만들지도 고치지도 못하면서 지우기만 한다. 실수로 만들어지기 쉽다. */
test('삭제만 남으면 경고한다', async () => {
  render(<NaturalCmsGuardrailPanel api={api(view(
    resource('MENU', ['DELETE'], ['name']),
    resource('CONTENT', ALL, ['title'])))} />)

  expect(await screen.findByText(/메뉴 는 삭제만 켜져 있습니다/)).toBeInTheDocument()
})

/** 관리자가 알고 끈 것일 수 있다. 다만 어시스턴트 버튼은 그대로 떠 있다. */
test('동작이 모두 꺼진 대상은 쓸 수 없다고 알린다', async () => {
  render(<NaturalCmsGuardrailPanel api={api(view(
    resource('MENU', [], ['name']),
    resource('CONTENT', ALL, ['title'])))} />)

  expect(await screen.findByText(/메뉴 는 자연어 CMS 를 쓸 수 없습니다/)).toBeInTheDocument()
  // 닫힌 대상을 두고 「삭제만 켜짐」까지 말하지 않는다. 같은 카드를 두 번 말하는 셈이다.
  expect(screen.queryByText(/삭제만 켜져 있습니다/)).not.toBeInTheDocument()
})

test('모든 대상이 닫히면 기능 자체가 멎었다고 알린다', async () => {
  render(<NaturalCmsGuardrailPanel api={api(view(
    resource('MENU', [], ['name']),
    resource('CONTENT', [], ['title'])))} />)

  expect(await screen.findByText(/할 수 있는 일이 없습니다/)).toBeInTheDocument()
  // 대상마다 한 줄씩 쌓지 않는다. 같은 규칙의 두 크기라 한 문장이 커진다.
  expect(screen.queryByText(/메뉴 · 컨텐츠 는 자연어 CMS/)).not.toBeInTheDocument()
})

test('바꾼 것이 없으면 저장할 수 없다', async () => {
  render(<NaturalCmsGuardrailPanel api={api(open())} />)
  await menuCard()

  expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
})

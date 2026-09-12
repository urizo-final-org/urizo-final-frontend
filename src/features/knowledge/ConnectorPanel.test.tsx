import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { KnowledgeAdminApi } from './admin-api'
import type { Connector } from './admin-types'
import { ConnectorPanel, PRESETS, buildCreateRequest, parseMetadata } from './ConnectorPanel'

function connector(overrides: Partial<Connector> = {}): Connector {
  return {
    schemaVersion: '1.0', traceId: 't-1', projectId: 'p-1',
    connectorId: 'c-1', connectorVersionId: 'cv-1', name: 'LOCAL_FIXTURE',
    status: 'DRAFT', configDigest: `sha256:${'a'.repeat(64)}`,
    createdAt: '2026-09-12T03:00:00.000Z', ...overrides,
  }
}

function api(overrides: Partial<Record<keyof KnowledgeAdminApi, unknown>> = {}) {
  return {
    listConnectors: vi.fn().mockResolvedValue({ items: [connector()] }),
    createConnector: vi.fn().mockResolvedValue(connector()),
    previewConnector: vi.fn(),
    activateConnectorVersion: vi.fn().mockResolvedValue(connector({ status: 'ACTIVE' })),
    ...overrides,
  } as unknown as KnowledgeAdminApi
}

test('중기부 기본값이 확정 표 그대로 계약 본문이 된다', () => {
  const request = buildCreateRequest(PRESETS.sme.form)

  expect(request.baseUrl).toBe('https://apis.data.go.kr/1421000/bizinfo')
  expect(request.endpoint).toBe('/pblancBsnsService')
  expect(request.method).toBe('GET')
  expect(request.authentication).toEqual({
    type: 'API_KEY', location: 'QUERY', name: 'serviceKey',
    secretRef: 'cms-secret://sme-support-api',
  })
  expect(request.pagination).toEqual({
    type: 'PAGE', pageParameter: 'pageNo', pageSizeParameter: 'numOfRows',
    startPage: 1, pageSize: 100,
  })
  // `00`은 문자열이어야 한다 — 숫자로 바꾸면 0이 되어 원본 resultCode와 영영 어긋난다.
  expect(request.response.successValues).toEqual(['00'])
  expect(request.documentMapping.content).toBe('$.bsnsSumryCn')
})

test('프리셋 secretRef가 백엔드 Secret 이름 규칙을 지킨다', () => {
  // ConnectorSecretResolver의 이름 규칙이다. 슬래시·점·대문자가 들어가면 등록은 통과하고
  // 미리보기·수집에서 IllegalStateException으로 죽는다 — 화면에는 성공한 커넥터로 보인다.
  const name = /^cms-secret:\/\/[a-z0-9][a-z0-9-]{0,63}$/
  expect(PRESETS.sme.form.secretRef).toMatch(name)
  expect(PRESETS.fixture.form.secretRef).toMatch(/^fixture:\/\/.+/)
})

test('metadata는 적은 순서를 표시 순서로 지킨다', () => {
  // 02번 문서가 정한 순서다. 객체 키 순서가 깨지면 화면 라벨 순서가 그대로 뒤집힌다.
  expect(Object.keys(buildCreateRequest(PRESETS.sme.form).documentMapping.metadata ?? {}))
    .toEqual(['신청기간', '지원대상', '소관기관', '수행기관', '신청방법', '문의처'])
})

test('metadata는 첫 = 에서만 자르고 빈 줄을 버린다', () => {
  expect(parseMetadata('신청기간=$.a\n\n  깨진줄  \n비고=$.b=c')).toEqual({
    신청기간: '$.a', 비고: '$.b=c',
  })
  // 한 줄도 없으면 키 자체를 만들지 않는다 — 빈 객체를 보내면 의미 없는 키가 계약에 남는다.
  expect(parseMetadata('   ')).toBeUndefined()
})

test('비어 있는 선택 항목은 키 자체가 빠진다', () => {
  const request = buildCreateRequest(PRESETS.fixture.form)
  const body = JSON.parse(JSON.stringify(request))

  // 빈 문자열을 그대로 보내면 백엔드 JSONPath 검사(`^\$`)에서 400이 난다.
  expect(body.response).not.toHaveProperty('successCodePath')
  expect(body.response).not.toHaveProperty('successValues')
  expect(body.documentMapping).not.toHaveProperty('sourceUpdatedAt')
  expect(body.documentMapping).not.toHaveProperty('metadata')
  expect(body.response.itemsPath).toBe('$.items')
})

test('일반 관리자에게는 등록·미리보기·활성화가 이미 잠겨 있다', async () => {
  render(<ConnectorPanel api={api()} projectId="p-1" mayWrite={false} />)
  await screen.findByText('LOCAL_FIXTURE')

  // 눌러서 403을 받는 게 아니라 세션 역할로 미리 판별한다.
  expect(screen.getByRole('button', { name: /커넥터 등록/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: /미리보기/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: /활성화/ })).toBeDisabled()
})

test('폼에는 secretRef만 있고 키 값을 받는 입력이 없다', async () => {
  render(<ConnectorPanel api={api()} projectId="p-1" mayWrite />)
  fireEvent.click(await screen.findByRole('button', { name: /커넥터 등록/ }))

  expect(screen.getByDisplayValue('cms-secret://sme-support-api')).toBeInTheDocument()
  // 비밀번호 입력도, API Key 값을 받는 칸도 없다. 화면에 남을 수 있는 것은 참조 문자열뿐이다.
  expect(document.querySelectorAll('input[type="password"]')).toHaveLength(0)
  expect(screen.queryByText(/API Key 값은 여기에 넣지 않습니다/)).toBeInTheDocument()
})

test('초안 저장이 성공하면 목록을 다시 읽고 폼을 닫는다', async () => {
  const client = api()
  render(<ConnectorPanel api={client} projectId="p-1" mayWrite />)
  fireEvent.click(await screen.findByRole('button', { name: /커넥터 등록/ }))
  fireEvent.click(screen.getByRole('button', { name: '초안 저장' }))

  await waitFor(() => expect(client.createConnector).toHaveBeenCalledWith('p-1', buildCreateRequest(PRESETS.sme.form)))
  // 눌렀는데 아무 일도 안 일어난 것처럼 보이지 않게 하는 유일한 증거가 목록 재조회다.
  await waitFor(() => expect(client.listConnectors).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole('button', { name: '초안 저장' })).not.toBeInTheDocument()
})

test('저장이 실패하면 서버 문장을 그대로 보이고 폼을 지우지 않는다', async () => {
  const client = api({
    createConnector: vi.fn().mockRejectedValue(
      new Error('The local profile accepts only HTTPS fixture.invalid connector origins.'),
    ),
  })
  render(<ConnectorPanel api={client} projectId="p-1" mayWrite />)
  fireEvent.click(await screen.findByRole('button', { name: /커넥터 등록/ }))
  fireEvent.click(screen.getByRole('button', { name: '초안 저장' }))

  // 화면이 자체 판정으로 다시 쓰지 않는다 — 422 사유는 서버만 안다.
  await screen.findByText(/fixture.invalid/)
  expect(screen.getByRole('button', { name: '초안 저장' })).toBeInTheDocument()
})

test('목록 조회가 실패해도 패널은 서 있고 다시 시도할 수 있다', async () => {
  const client = api({ listConnectors: vi.fn().mockRejectedValue(new Error('down')) })
  render(<ConnectorPanel api={client} projectId="p-1" mayWrite />)

  // 커넥터 목록 하나 때문에 RAG 화면 전체가 오류로 덮이면 안 된다.
  fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }))
  await waitFor(() => expect(client.listConnectors).toHaveBeenCalledTimes(2))
})

test('미리보기는 건수와 문서를 함께 보인다', async () => {
  const client = api({
    previewConnector: vi.fn().mockResolvedValue({
      schemaVersion: '1.0', traceId: 't-2', connectorId: 'c-1', itemCount: 5, totalCount: 5,
      documents: [{ documentId: 'd-1', title: '청년창업 지원사업', content: '지원 내용입니다.', category: ['창업'] }],
      truncated: true, checkedAt: '2026-09-12T03:10:00.000Z',
    }),
  })
  render(<ConnectorPanel api={client} projectId="p-1" mayWrite />)
  fireEvent.click(await screen.findByRole('button', { name: /미리보기/ }))

  // 건수만 보이면 매핑이 틀려 제목이 비어도 성공으로 읽힌다. 문서를 함께 보인다.
  expect(await screen.findByText('청년창업 지원사업')).toBeInTheDocument()
  expect(screen.getByText(/표본 5건/)).toBeInTheDocument()
  expect(screen.getByText(/더 있음/)).toBeInTheDocument()
  // 계약 상한이 20이다. 화면이 먼저 잘라서 400을 만들지 않는다.
  expect(client.previewConnector).toHaveBeenCalledWith('c-1', 5)
})

test('totalCount를 원천 전체 건수로 읽지 않는다', async () => {
  const client = api({
    previewConnector: vi.fn().mockResolvedValue({
      schemaVersion: '1.0', traceId: 't-3', connectorId: 'c-1', itemCount: 3, totalCount: 3,
      documents: [{ documentId: 'd-1', title: '지원사업', content: '본문' }],
      truncated: false, checkedAt: '2026-09-12T03:10:00.000Z',
    }),
  })
  render(<ConnectorPanel api={client} projectId="p-1" mayWrite />)
  fireEvent.click(await screen.findByRole('button', { name: /미리보기/ }))
  await screen.findByText(/표본 3건/)

  // 실제 원천에서 totalCount는 "이번에 받아온 건수"다. 픽스처에서만 진짜 전체라
  // 응답만으로는 구분할 수 없어, 건수를 전체라고 주장하는 문구를 두지 않는다.
  // (아래 안내문은 "원천 전체가 아니다"라고 말하는 쪽이라 걸리면 안 된다.)
  expect(screen.queryByText(/원천 전체 \d/)).not.toBeInTheDocument()
  expect(screen.getByText(/표시 건수는 원천 전체가 아닙니다/)).toBeInTheDocument()
  expect(screen.queryByText(/더 있음/)).not.toBeInTheDocument()
})

test('첫 빌드 버튼은 활성 커넥터에만 달린다', async () => {
  const onFirstBuild = vi.fn()
  const client = api({
    listConnectors: vi.fn().mockResolvedValue({
      items: [connector({ connectorId: 'c-draft', name: 'DRAFT_ONE', status: 'DRAFT' })],
    }),
  })
  const view = render(<ConnectorPanel api={client} projectId="p-1" mayWrite onFirstBuild={onFirstBuild} />)
  await screen.findByText('DRAFT_ONE')
  // 백엔드가 ACTIVE 아닌 버전으로는 빌드를 거절한다(409). 눌러서 받지 않고 아예 두지 않는다.
  expect(screen.queryByRole('button', { name: /첫 빌드/ })).not.toBeInTheDocument()

  view.unmount()
  const live = api({
    listConnectors: vi.fn().mockResolvedValue({
      items: [connector({ connectorVersionId: 'cv-9', status: 'ACTIVE' })],
    }),
  })
  render(<ConnectorPanel api={live} projectId="p-1" mayWrite onFirstBuild={onFirstBuild} />)
  fireEvent.click(await screen.findByRole('button', { name: /첫 빌드/ }))
  // 빌드는 이 패널이 실행하지 않는다 — 어느 커넥터인지만 올려 보낸다.
  expect(onFirstBuild).toHaveBeenCalledWith(expect.objectContaining({ connectorVersionId: 'cv-9' }))
  expect(live.previewConnector).not.toHaveBeenCalled()
})

test('첫 빌드를 시작할 수 없는 상황이면 버튼 자체가 없다', async () => {
  // onFirstBuild를 넘기지 않는 것이 곧 "지금은 첫 빌드가 아니다"다(버전이 이미 있거나 조회 중).
  render(<ConnectorPanel api={api({
    listConnectors: vi.fn().mockResolvedValue({ items: [connector({ status: 'ACTIVE' })] }),
  })} projectId="p-1" mayWrite />)
  await screen.findByText('LOCAL_FIXTURE')
  expect(screen.queryByRole('button', { name: /첫 빌드/ })).not.toBeInTheDocument()
})

test('프로젝트가 정해지기 전에는 목록을 읽지 않는다', () => {
  const client = api()
  render(<ConnectorPanel api={client} projectId={null} mayWrite />)
  expect(client.listConnectors).not.toHaveBeenCalled()
})

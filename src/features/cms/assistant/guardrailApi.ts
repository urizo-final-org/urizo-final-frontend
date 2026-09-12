import { ProductApiError } from '../../../shared/api/error'
import { fetchWithSessionRefresh, type AdminSession } from '../../../shared/api/session'

/**
 * 자연어 CMS 울타리 설정.
 *
 * 어시스턴트가 쓰는 Job API와 같은 폴더에 두되 클라이언트는 나눈다. 이쪽은 최고 관리자
 * 전용 설정이고 어시스턴트는 일반 관리자가 쓰는 실행 경로라, 한 클라이언트에 합치면
 * 어시스턴트가 쓰지도 않는 관리자 메서드를 들고 다니게 된다.
 *
 * 계약과 설정 패널은 여기 있고, `features/coding/`에는 그 패널을 거는 탭 한 줄만 남는다.
 * 울타리 화면이 LLM Ops와 탭을 공유할 뿐 자연어 CMS 설정의 소유는 이쪽이다.
 */

/** 필드 선택의 저장 단위. 게시물은 계약상 BOARD지만 필드를 따로 연다. */
export type NaturalCmsGuardrailResourceKey = 'MENU' | 'BOARD' | 'BOARD_POST' | 'CONTENT'

export interface NaturalCmsGuardrailField {
  name: string
  enabled: boolean
}

/**
 * 한 대상이 지금 여는 동작과 필드.
 *
 * 서버가 Handler에서 읽어 내려주는 목록이다. 화면이 대상·필드를 갖고 있지 않으므로
 * 서버가 필드를 늘리면 저절로 나타나고, 없앤 필드가 옛 목록에서 계속 제공되지 않는다.
 */
export interface NaturalCmsGuardrailResource {
  resourceKey: NaturalCmsGuardrailResourceKey
  operations: string[]
  fields: NaturalCmsGuardrailField[]
}

/**
 * @param configured 한 번이라도 저장했는가. false면 아직 코드 기본값을 따른다.
 * @param allowDelete 삭제 명령을 여는가. 대상과 무관한 전역 값이다.
 */
export interface NaturalCmsGuardrailView {
  configured: boolean
  allowDelete: boolean
  resources: NaturalCmsGuardrailResource[]
}

export interface NaturalCmsGuardrailFieldSelection {
  resourceKey: NaturalCmsGuardrailResourceKey
  fieldName: string
  enabled: boolean
}

/**
 * 저장은 선택을 통째로 바꾼다.
 *
 * 켠 것만 보내면 나머지가 "선택된 적 없음"인지 "꺼짐"인지 서버가 알 수 없다.
 * 목록에 있는 필드를 전부 담아 보낸다.
 */
export interface NaturalCmsGuardrailSaveRequest {
  allowDelete: boolean
  fields: NaturalCmsGuardrailFieldSelection[]
}

async function responseBody<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as {
      code?: string
      message?: string
      error?: { code?: string; message?: string }
    }
    throw new ProductApiError({
      status: response.status,
      code: body.code ?? body.error?.code ?? `HTTP_${response.status}`,
      message: body.message ?? body.error?.message ?? '가드레일 설정을 처리하지 못했습니다.',
    })
  }
  return response.json() as Promise<T>
}

export class NaturalCmsGuardrailApi {
  constructor(
    private token: string,
    private readonly onRefreshed: (session: AdminSession) => void,
    private readonly onExpired: () => void,
  ) {}

  private async request<T>(init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    headers.set('X-Trace-Id', crypto.randomUUID())
    if (init.body !== undefined) headers.set('Content-Type', 'application/json')
    const response = await fetchWithSessionRefresh(
      '/api/admin/cms/guardrail', { ...init, headers }, this.token, {
        onSessionRefreshed: (session) => {
          this.token = session.sessionToken
          this.onRefreshed(session)
        },
        onSessionExpired: this.onExpired,
      })
    return responseBody<T>(response)
  }

  guardrail = () => this.request<NaturalCmsGuardrailView>()

  saveGuardrail = (request: NaturalCmsGuardrailSaveRequest) =>
    this.request<NaturalCmsGuardrailView>({
      method: 'PUT',
      body: JSON.stringify(request),
    })
}

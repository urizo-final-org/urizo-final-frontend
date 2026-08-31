import { ProductApiError } from '../../shared/api/error'
import { fetchWithSessionRefresh, type AdminSession } from '../../shared/api/session'
import type { SiteTemplate } from '../cms/api'

export type CmsSiteSettings = {
  defaultSiteKey: string
  defaultTemplateKey: string
  updatedAt: string
}

export type CmsSite = {
  key: string
  name: string
  publicPath: string
  templateKey: string
  enabled: boolean
  defaultSite: boolean
  updatedAt: string
}

export type CmsSiteUpdate = Pick<CmsSite, 'name' | 'publicPath' | 'templateKey' | 'enabled'>

export interface CmsSiteSettingsApiClient {
  settings(): Promise<CmsSiteSettings>
  saveSettings(value: Pick<CmsSiteSettings, 'defaultSiteKey' | 'defaultTemplateKey'>): Promise<CmsSiteSettings>
  sites(): Promise<CmsSite[]>
  saveSite(key: string, value: CmsSiteUpdate): Promise<CmsSite>
  templates(): Promise<SiteTemplate[]>
}

async function responseBody<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string; detail?: string; error?: { code?: string; message?: string } }
    throw new ProductApiError({
      status: response.status,
      code: body.error?.code ?? `HTTP_${response.status}`,
      message: body.detail ?? body.message ?? body.error?.message ?? 'CMS 사이트 설정 요청을 처리하지 못했습니다.',
    })
  }
  return response.json() as Promise<T>
}

export class CmsSiteSettingsApi implements CmsSiteSettingsApiClient {
  constructor(
    private token: string,
    private readonly onRefreshed: (session: AdminSession) => void,
    private readonly onExpired: () => void,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    headers.set('X-Trace-Id', crypto.randomUUID())
    if (init.body !== undefined) headers.set('Content-Type', 'application/json')
    const response = await fetchWithSessionRefresh(path, { ...init, headers }, this.token, {
      onSessionRefreshed: (session) => {
        this.token = session.sessionToken
        this.onRefreshed(session)
      },
      onSessionExpired: this.onExpired,
    })
    return responseBody<T>(response)
  }

  settings = () => this.request<CmsSiteSettings>('/api/admin/cms/settings')

  saveSettings = ({ defaultSiteKey, defaultTemplateKey }: Pick<CmsSiteSettings, 'defaultSiteKey' | 'defaultTemplateKey'>) => this.request<CmsSiteSettings>(
    '/api/admin/cms/settings',
    { method: 'PUT', body: JSON.stringify({ defaultSiteKey, defaultTemplateKey }) },
  )

  sites = () => this.request<CmsSite[]>('/api/admin/cms/sites')

  saveSite = (key: string, value: CmsSiteUpdate) => this.request<CmsSite>(
    `/api/admin/cms/sites/${encodeURIComponent(key)}`,
    { method: 'PUT', body: JSON.stringify({ siteName: value.name, publicPath: value.publicPath, templateKey: value.templateKey, enabled: value.enabled }) },
  )

  templates = () => this.request<SiteTemplate[]>('/api/cms/templates')
}

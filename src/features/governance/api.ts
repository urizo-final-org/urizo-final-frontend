import { ProductApiError } from '../../shared/api/error'
import { fetchWithSessionRefresh, type AdminSession } from '../../shared/api/session'

export type ApprovalDomain = 'RAG' | 'LLM_OPS' | 'NATURAL_CMS'
export type RunCategory = 'ALL' | 'CMS' | 'AI'
export type HistoryEntry = {
  id: string; domain: string; kind: string; title: string
  targetType: string; targetId: string | null; jobId: string | null
  status: string; jobStatus: string | null; stage: string | null
  attempt: number | null; stateVersion: number | null
  actorId: string | null; actorName: string | null; actorRole: string | null
  createdAt: string | null; occurredAt: string | null; startedAt: string | null
  updatedAt: string | null; finishedAt: string | null
  feedback: string | null; errorCode: string | null; coverage: string
}
export type HistoryPage = { items: HistoryEntry[]; nextCursor: string | null; observedAt: string }
export type HistoryOptions = { query?: string; cursor?: string; signal?: AbortSignal }
export interface HistoryClient {
  approvals(domain: ApprovalDomain, options?: HistoryOptions): Promise<HistoryPage>
  runs(category: RunCategory, options?: HistoryOptions): Promise<HistoryPage>
}

/** Deliberately read-only: no decision, retry, cancel or domain state mutation API. */
export class HistoryApi implements HistoryClient {
  constructor(private token: string, private readonly onRefreshed: (session: AdminSession) => void, private readonly onExpired: () => void) {}
  private async read(path: string, key: string, value: string, options: HistoryOptions): Promise<HistoryPage> {
    const params = new URLSearchParams({ [key]: value, limit: '25' })
    if (options.query) params.set('query', options.query)
    if (options.cursor) params.set('cursor', options.cursor)
    const response = await fetchWithSessionRefresh(`/api/admin/governance/${path}?${params}`, {
      method: 'GET', cache: 'no-store', signal: options.signal,
      headers: { Accept: 'application/json', 'X-Trace-Id': crypto.randomUUID() },
    }, this.token, {
      onSessionRefreshed: (session) => { this.token = session.sessionToken; this.onRefreshed(session) },
      onSessionExpired: this.onExpired,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
      throw new ProductApiError({ status: response.status, code: body.error?.code ?? `HTTP_${response.status}`, message: body.error?.message ?? '이력을 조회하지 못했습니다.' })
    }
    return response.json() as Promise<HistoryPage>
  }
  approvals = (domain: ApprovalDomain, options: HistoryOptions = {}) => this.read('approvals', 'domain', domain, options)
  runs = (category: RunCategory, options: HistoryOptions = {}) => this.read('runs', 'category', category, options)
}

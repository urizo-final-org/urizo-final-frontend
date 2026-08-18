import { ProductApiError } from '../../shared/api/error'

export type ProviderName = 'OPENAI' | 'GOOGLE_GENAI' | 'ANTHROPIC'

export type CredentialState =
  | 'STORED'
  | 'VERIFIED'
  | 'BILLING_BLOCKED'
  | 'INVALID_CREDENTIAL'
  | 'PROVIDER_UNAVAILABLE'

export interface ProviderStatus {
  provider: ProviderName
  configured: boolean
  state: CredentialState | null
  fingerprintSuffix: string | null
  updatedAt: string | null
  lastTestedAt: string | null
}

export interface CredentialOverview {
  csrfToken: string
  providers: ProviderStatus[]
  checkedAt: string
}

export interface ConnectionTestResult {
  provider: ProviderName
  modelId: string
  state: CredentialState
  inferenceExecuted: boolean
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
  testedAt: string
  safeCode: string
}

interface SafeError {
  code?: string
  message?: string
}

/**
 * Platform credential operations are reserved for the delivery-company role, so every call carries
 * the session the server authorizes against. The CSRF token stays: it guards a different thing,
 * namely a request the browser was tricked into making.
 */
function authorized(sessionToken: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${sessionToken}`, ...extra }
}

/**
 * Carries the status so a caller can tell a dead session apart from an ordinary failure. Plain
 * Error lost that distinction, which left an expired session looking like a backend outage.
 */
async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & SafeError
  if (!response.ok) {
    throw new ProductApiError({
      status: response.status,
      code: body.code ?? `HTTP_${response.status}`,
      message: body.message ?? body.code ?? `요청에 실패했습니다. (${response.status})`,
    })
  }
  return body
}

export async function fetchOverview(sessionToken: string): Promise<CredentialOverview> {
  const response = await fetch('/internal/dev/provider-credentials', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: authorized(sessionToken),
  })
  return readJson<CredentialOverview>(response)
}

export async function storeCredential(
  provider: ProviderName,
  credential: string,
  csrfToken: string,
  sessionToken: string,
): Promise<ProviderStatus> {
  const response = await fetch(`/internal/dev/provider-credentials/${provider}`, {
    method: 'PUT',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: authorized(sessionToken, {
      'Content-Type': 'application/json',
      'X-AXMS-CSRF': csrfToken,
    }),
    body: JSON.stringify({ credential }),
  })
  return readJson<ProviderStatus>(response)
}

export async function testConnection(
  provider: ProviderName,
  csrfToken: string,
  sessionToken: string,
): Promise<ConnectionTestResult> {
  const response = await fetch(`/internal/dev/provider-credentials/${provider}/test`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: authorized(sessionToken, {
      'X-AXMS-CSRF': csrfToken,
    }),
  })
  return readJson<ConnectionTestResult>(response)
}

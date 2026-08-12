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

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & SafeError
  if (!response.ok) {
    throw new Error(body.message ?? body.code ?? `Request failed (${response.status})`)
  }
  return body
}

export async function fetchOverview(): Promise<CredentialOverview> {
  const response = await fetch('/internal/dev/provider-credentials', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  })
  return readJson<CredentialOverview>(response)
}

export async function storeCredential(
  provider: ProviderName,
  credential: string,
  csrfToken: string,
): Promise<ProviderStatus> {
  const response = await fetch(`/internal/dev/provider-credentials/${provider}`, {
    method: 'PUT',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-AXMS-CSRF': csrfToken,
    },
    body: JSON.stringify({ credential }),
  })
  return readJson<ProviderStatus>(response)
}

export async function testConnection(
  provider: ProviderName,
  csrfToken: string,
): Promise<ConnectionTestResult> {
  const response = await fetch(`/internal/dev/provider-credentials/${provider}/test`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'X-AXMS-CSRF': csrfToken,
    },
  })
  return readJson<ConnectionTestResult>(response)
}

export type Uuid = string

export type Fetcher = typeof fetch
export type UuidFactory = () => string

export function defaultFetcher(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(input, init)
}

export function defaultUuidFactory(): string {
  return globalThis.crypto.randomUUID()
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

export async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined
  return response.json().catch(() => undefined)
}

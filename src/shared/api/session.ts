import { ProductApiError, type PublicErrorEnvelope } from './error'
import { asRecord, defaultFetcher, defaultUuidFactory, parseBody, type Fetcher, type UuidFactory, type Uuid } from './http'

export const SCHEMA_VERSION = '1.0'

export type AdminRole = 'SUPER_ADMIN' | 'GENERAL_ADMIN'

/** Korean UI names for the two fixed roles of the Auth/RBAC MVP. */
export const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: '최고관리자',
  GENERAL_ADMIN: '일반관리자',
}

/**
 * Authority the server derived from the session.
 *
 * <p>Nothing here is chosen by the client. The backend repeats every check, so this exists to shape
 * the navigation, not to grant anything.
 */
export interface Actor {
  actorId: Uuid
  role: AdminRole
  assignedProjectIds: Uuid[]
}

export interface AdminSession {
  /** Returned once at login. Persistence keeps only a digest, so it cannot be read back. */
  sessionToken: string
  expiresAt: string
  actor: Actor
}

function readActor(body: Record<string, unknown>): Actor {
  const actor = asRecord(body.actor)
  const role = actor.role
  if (role !== 'SUPER_ADMIN' && role !== 'GENERAL_ADMIN') {
    throw new ProductApiError({
      status: 500,
      code: 'SESSION_RESPONSE_INVALID',
      message: '세션 응답에 알 수 없는 역할이 있습니다.',
    })
  }
  return {
    actorId: String(actor.actorId ?? ''),
    role,
    assignedProjectIds: Array.isArray(actor.assignedProjectIds)
      ? actor.assignedProjectIds.filter((id): id is string => typeof id === 'string')
      : [],
  }
}

function failure(status: number, body: Record<string, unknown>, fallback: string): ProductApiError {
  const envelope = body as PublicErrorEnvelope
  return new ProductApiError({
    status,
    code: envelope.error?.code ?? envelope.code ?? `HTTP_${status}`,
    message: envelope.error?.message ?? envelope.message ?? fallback,
    traceId: envelope.traceId,
  })
}

/**
 * Exchanges administrator credentials for a session.
 *
 * <p>The server answers the same 401 for an unknown login id, a wrong password, and a disabled
 * account, so this reports one message for all three rather than guessing which one it was.
 */
export async function login(
  loginId: string,
  passwordValue: string,
  fetcher: Fetcher = defaultFetcher,
  uuidFactory: UuidFactory = defaultUuidFactory,
): Promise<AdminSession> {
  const response = await fetcher('/api/auth/login', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Trace-Id': uuidFactory(),
      'Idempotency-Key': uuidFactory(),
    },
    body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, loginId, passwordValue }),
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const body = asRecord(await parseBody(response))
  if (!response.ok) {
    throw response.status === 401
      ? new ProductApiError({
        status: 401,
        code: 'AUTHENTICATION_REQUIRED',
        message: '아이디 또는 비밀번호가 올바르지 않습니다.',
        traceId: (body as PublicErrorEnvelope).traceId,
      })
      : failure(response.status, body, '로그인에 실패했습니다.')
  }

  const sessionToken = body.sessionToken
  if (typeof sessionToken !== 'string' || sessionToken.length < 8) {
    throw new ProductApiError({
      status: 500,
      code: 'SESSION_RESPONSE_INVALID',
      message: '로그인 응답에 사용할 수 있는 세션이 없습니다.',
    })
  }

  return {
    sessionToken,
    expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : '',
    actor: readActor(body),
  }
}

/**
 * Reads the actor behind a stored token.
 *
 * <p>Used on reload: the token survives in storage but the authority behind it must be confirmed
 * with the server, because the account may have been disabled or the session revoked meanwhile.
 *
 * @throws ProductApiError with status 401 when the session is no longer usable
 */
export async function fetchCurrentSession(
  sessionToken: string,
  fetcher: Fetcher = defaultFetcher,
  uuidFactory: UuidFactory = defaultUuidFactory,
): Promise<AdminSession> {
  const response = await fetcher('/api/auth/me', {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${sessionToken}`,
      'X-Trace-Id': uuidFactory(),
    },
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const body = asRecord(await parseBody(response))
  if (!response.ok) {
    throw failure(response.status, body, '세션을 확인할 수 없습니다.')
  }
  return {
    sessionToken,
    expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : '',
    actor: readActor(body),
  }
}

/**
 * Revokes the session on the server.
 *
 * <p>Never throws. A caller signs out locally no matter what the server says, so a transport failure
 * must not strand the operator in a signed-in shell holding a token they meant to discard.
 */
export async function logout(
  sessionToken: string,
  fetcher: Fetcher = defaultFetcher,
  uuidFactory: UuidFactory = defaultUuidFactory,
): Promise<void> {
  try {
    await fetcher('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${sessionToken}`,
        'X-Trace-Id': uuidFactory(),
        'Idempotency-Key': uuidFactory(),
      },
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch {
    // Deliberately ignored; the local sign-out proceeds either way.
  }
}

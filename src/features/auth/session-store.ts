const ACCESS_TOKEN_KEY = 'axms.auth.access-token'
const LEGACY_TOKEN_KEY = 'axms.auth.session-token'
const EXPLICIT_SIGN_OUT_KEY = 'axms.auth.explicit-sign-out'

/**
 * Keeps only the short-lived access JWT across a page reload.
 *
 * <p>{@code sessionStorage} rather than {@code localStorage}: the token disappears when the tab
 * closes, which keeps it out of storage on a shared machine for longer than the operator is
 * actually working. A reload still survives, so refreshing does not force a second sign-in.
 *
 * <p>Storage can be unavailable or full, and it is not worth failing a sign-in over. Every function
 * degrades to in-memory behavior instead of throwing.
 */
export function readStoredToken(): string | null {
  try {
    const token = window.sessionStorage.getItem(ACCESS_TOKEN_KEY)
      ?? window.sessionStorage.getItem(LEGACY_TOKEN_KEY)
    return token && token.length >= 8 ? token : null
  } catch {
    return null
  }
}

export function storeToken(token: string): void {
  try {
    window.sessionStorage.setItem(ACCESS_TOKEN_KEY, token)
    window.sessionStorage.removeItem(LEGACY_TOKEN_KEY)
  } catch {
    // A session that only lasts until reload is better than a blocked sign-in.
  }
}

export function clearStoredToken(): void {
  try {
    window.sessionStorage.removeItem(ACCESS_TOKEN_KEY)
    window.sessionStorage.removeItem(LEGACY_TOKEN_KEY)
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/**
 * Prevents a persistent HttpOnly refresh cookie from undoing an explicit local sign-out.
 *
 * <p>The marker intentionally lives in {@code localStorage}: unlike the access JWT in
 * {@code sessionStorage}, it must survive a tab close. It contains no identity or credential and is
 * cleared only after a successful credential login.
 */
export function hasExplicitSignOutMarker(): boolean {
  try {
    return window.localStorage.getItem(EXPLICIT_SIGN_OUT_KEY) === '1'
  } catch {
    return false
  }
}

export function markExplicitSignOut(): void {
  try {
    window.localStorage.setItem(EXPLICIT_SIGN_OUT_KEY, '1')
  } catch {
    // Best effort: storage failure must not block local sign-out.
  }
}

export function clearExplicitSignOut(): void {
  try {
    window.localStorage.removeItem(EXPLICIT_SIGN_OUT_KEY)
  } catch {
    // A successful login remains usable even when marker cleanup is unavailable.
  }
}

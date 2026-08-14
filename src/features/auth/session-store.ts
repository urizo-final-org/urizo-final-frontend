const TOKEN_KEY = 'axms.auth.session-token'

/**
 * Keeps the session token across a page reload.
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
    const token = window.sessionStorage.getItem(TOKEN_KEY)
    return token && token.length >= 8 ? token : null
  } catch {
    return null
  }
}

export function storeToken(token: string): void {
  try {
    window.sessionStorage.setItem(TOKEN_KEY, token)
  } catch {
    // A session that only lasts until reload is better than a blocked sign-in.
  }
}

export function clearStoredToken(): void {
  try {
    window.sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

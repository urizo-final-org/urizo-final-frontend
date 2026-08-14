import { FormEvent, useState } from 'react'
import { describeFailure } from '../../shared/api/error'
import { login, type AdminSession } from '../../shared/api/session'

interface LoginScreenProps {
  /** Why the operator is back here, when they did not choose to sign out. */
  notice?: string | null
  onSignedIn: (session: AdminSession) => void
}

export default function LoginScreen({ notice, onSignedIn }: LoginScreenProps) {
  const [loginId, setLoginId] = useState('')
  const [passwordValue, setPasswordValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setFailure(null)
    try {
      const session = await login(loginId.trim(), passwordValue)
      // The password leaves state before the shell renders, so a later inspection of this
      // component cannot recover what was typed.
      setPasswordValue('')
      onSignedIn(session)
    } catch (error) {
      setFailure(describeFailure(error))
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand-lockup">
          <span className="brand-symbol" aria-hidden="true">AX</span>
          <div><strong>MODULE STUDIO</strong><span>ADMIN CONSOLE</span></div>
        </div>

        <div className="login-heading">
          <p className="section-label">SIGN IN</p>
          <h1>관리자 로그인</h1>
          <p>운영 계정으로 로그인하면 역할에 따라 사용할 수 있는 기능이 정해집니다.</p>
        </div>

        <label className="field">
          <span>아이디</span>
          <input
            name="loginId"
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>

        <label className="field">
          <span>비밀번호</span>
          <input
            name="passwordValue"
            type="password"
            value={passwordValue}
            onChange={(event) => setPasswordValue(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {notice && !failure ? <p className="login-notice" role="status">{notice}</p> : null}
        {failure ? <p className="login-failure" role="alert">{failure}</p> : null}

        <button
          className="button button--primary"
          type="submit"
          disabled={submitting || loginId.trim() === '' || passwordValue === ''}
        >
          {submitting ? '확인 중…' : '로그인'}
        </button>

        <p className="login-note">내부망 전용 콘솔입니다. 계정 발급은 담당자에게 문의하세요.</p>
      </form>
    </div>
  )
}

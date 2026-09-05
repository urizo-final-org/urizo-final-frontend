import { FormEvent, useState } from 'react'
import { describeFailure } from '../../shared/api/error'
import { login, type AdminSession } from '../../shared/api/session'
import { NoticePanel } from '../../shared/ui/primitives'

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
    <div className="grid min-h-screen place-items-center bg-[linear-gradient(160deg,var(--sb-bg)_0%,#1d3450_55%,#22405d_100%)] px-5 py-8 text-white">
      <form
        className="grid w-full max-w-[25.75rem] gap-4 rounded-lg bg-panel px-[1.875rem] pb-[1.625rem] pt-[1.875rem] shadow-[0_24px_60px_rgba(11,17,30,0.42)]"
        onSubmit={onSubmit}
      >
        <div className="flex items-center gap-3 border-b border-line pb-[1.125rem]">
          <span
            className="flex h-[2.375rem] w-[2.375rem] flex-none items-center justify-center rounded-[0.625rem] bg-primary font-mono text-[0.8125rem] font-extrabold leading-none tracking-[-0.08em] text-accent"
            aria-hidden="true"
          >
            AX
          </span>
          <div className="grid gap-1">
            <strong className="text-sm text-ink">AX Module Studio</strong>
            <span className="text-[0.625rem] text-muted-2">LOCAL DEMO CMS</span>
          </div>
        </div>

        <div className="grid gap-[0.3125rem]">
          <p className="m-0 font-mono text-[0.625rem] font-extrabold uppercase leading-[1.4] tracking-[0.13em] text-link">SIGN IN</p>
          <h1 className="mt-[0.125rem] mb-0 text-[1.5625rem] leading-[1.2] tracking-[-0.03em] text-ink">CMS 로그인</h1>
          <p className="m-0 text-xs leading-[1.65] text-muted">사이트 운영을 위한 관리자 전용 화면입니다.</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            ['최고관리자', 'super-admin', 'axms-super-admin-demo'],
            ['일반관리자', 'general-admin', 'axms-general-admin-demo'],
          ].map(([label, id, password]) => (
            <button key={id} className="rounded-lg border border-field-line bg-run-bg p-2 text-[0.625rem] font-bold text-run-fg" type="button" onClick={() => { setLoginId(id); setPasswordValue(password) }}>
              {label}
            </button>
          ))}
        </div>

        <label className="grid min-w-0 gap-[0.4375rem]">
          <span className="text-[0.625rem] font-bold text-body">아이디</span>
          <input
            className="w-full min-w-0 rounded-lg border border-field-line bg-field px-[0.6875rem] py-[0.625rem] text-ink"
            name="loginId"
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>

        <label className="grid min-w-0 gap-[0.4375rem]">
          <span className="text-[0.625rem] font-bold text-body">비밀번호</span>
          <input
            className="w-full min-w-0 rounded-lg border border-field-line bg-field px-[0.6875rem] py-[0.625rem] text-ink"
            name="passwordValue"
            type="password"
            value={passwordValue}
            onChange={(event) => setPasswordValue(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {notice && !failure ? <NoticePanel tone="warning" icon="triangle-alert" title="다시 로그인해 주세요" role="status">{notice}</NoticePanel> : null}
        {failure ? <NoticePanel tone="danger" icon="triangle-alert" title="로그인하지 못했습니다" role="alert">{failure}</NoticePanel> : null}

        <button
          className="min-h-[2.375rem] rounded-lg border border-transparent bg-primary px-[0.8125rem] text-[0.625rem] font-extrabold whitespace-nowrap text-white shadow-[0_4px_12px_rgba(23,59,91,0.18)] enabled:hover:bg-[#12314c]"
          type="submit"
          disabled={submitting || loginId.trim() === '' || passwordValue === ''}
        >
          {submitting ? '확인 중…' : '로그인'}
        </button>

        <p className="m-0 text-center text-[0.625rem] text-muted-2">로컬 발표용 시연 계정입니다.</p>
      </form>
    </div>
  )
}

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
    <div className="grid min-h-screen place-items-center bg-[linear-gradient(160deg,var(--navy)_0%,var(--navy-soft)_55%,#2a4660_100%)] px-5 py-8">
      <form
        className="grid w-full max-w-[412px] gap-4 rounded-2xl bg-panel px-[30px] pb-[26px] pt-[30px] shadow-[0_24px_60px_rgba(11,17,30,0.42)]"
        onSubmit={onSubmit}
      >
        <div className="flex items-center gap-3 border-b border-line pb-[18px]">
          <span
            className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-accent font-mono text-[13px] font-extrabold leading-none tracking-[-0.08em] text-navy shadow-[0_8px_22px_rgba(54,127,135,0.28)]"
            aria-hidden="true"
          >
            AX
          </span>
          <div className="grid gap-1">
            <strong className="text-sm text-[#151b27]">AX Module Studio</strong>
            <span className="text-[10px] text-[#7e8ba0]">LOCAL DEMO CMS</span>
          </div>
        </div>

        <div className="grid gap-[5px]">
          <p className="m-0 font-mono text-[10px] font-extrabold uppercase leading-[1.4] tracking-[0.13em] text-accent-ink">SIGN IN</p>
          <h1 className="mt-[2px] mb-0 text-[25px] leading-[1.2] tracking-[-0.03em] text-[#151b27]">CMS 로그인</h1>
          <p className="m-0 text-xs leading-[1.65] text-muted">사이트 운영을 위한 관리자 전용 화면입니다.</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            ['최고관리자', 'super-admin', 'axms-super-admin-demo'],
            ['일반관리자', 'general-admin', 'axms-general-admin-demo'],
          ].map(([label, id, password]) => (
            <button key={id} className="rounded-lg border border-[#cfe8ea] bg-[#eef7f7] p-2 text-[10px] font-bold text-accent-ink" type="button" onClick={() => { setLoginId(id); setPasswordValue(password) }}>
              {label}
            </button>
          ))}
        </div>

        <label className="grid min-w-0 gap-[7px]">
          <span className="text-[10px] font-bold text-[#667085]">아이디</span>
          <input
            className="w-full min-w-0 rounded-lg border border-[#dce5e9] bg-white px-[11px] py-[10px] text-[#252b38]"
            name="loginId"
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>

        <label className="grid min-w-0 gap-[7px]">
          <span className="text-[10px] font-bold text-[#667085]">비밀번호</span>
          <input
            className="w-full min-w-0 rounded-lg border border-[#dce5e9] bg-white px-[11px] py-[10px] text-[#252b38]"
            name="passwordValue"
            type="password"
            value={passwordValue}
            onChange={(event) => setPasswordValue(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {notice && !failure ? (
          <p className="m-0 rounded-[9px] border border-[#ead9be] bg-amber-soft px-3 py-[10px] text-[11px] leading-[1.55] text-amber" role="status">
            {notice}
          </p>
        ) : null}
        {failure ? (
          <p className="m-0 rounded-[9px] border border-[#f2d5d3] bg-red-soft px-3 py-[10px] text-[11px] leading-[1.55] text-red" role="alert">
            {failure}
          </p>
        ) : null}

        <button
          className="min-h-[38px] rounded-lg border border-transparent bg-primary px-[13px] text-[10px] font-extrabold whitespace-nowrap text-white shadow-[0_4px_12px_rgba(23,59,91,0.18)] enabled:hover:bg-primary-dark"
          type="submit"
          disabled={submitting || loginId.trim() === '' || passwordValue === ''}
        >
          {submitting ? '확인 중…' : '로그인'}
        </button>

        <p className="m-0 text-center text-[10px] text-[#8a94a5]">로컬 발표용 시연 계정입니다.</p>
      </form>
    </div>
  )
}

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
    <div className="grid min-h-screen place-items-center bg-[linear-gradient(160deg,var(--navy)_0%,var(--navy-soft)_55%,#232f45_100%)] px-5 py-8">
      <form
        className="grid w-full max-w-[412px] gap-4 rounded-2xl bg-panel px-[30px] pb-[26px] pt-[30px] shadow-[0_24px_60px_rgba(11,17,30,0.42)]"
        onSubmit={onSubmit}
      >
        <div className="flex items-center gap-3 border-b border-line pb-[18px]">
          <span
            className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,#7d6bf1,#4b39cc)] font-mono text-[13px] font-extrabold leading-none tracking-[-0.08em] text-white shadow-[0_8px_22px_rgba(86,65,213,0.35)]"
            aria-hidden="true"
          >
            AX
          </span>
          <div className="grid gap-1">
            <strong className="text-[13px] tracking-[0.1em] text-[#151b27]">MODULE STUDIO</strong>
            <span className="text-[9px] tracking-[0.08em] text-[#7e8ba0]">ADMIN CONSOLE</span>
          </div>
        </div>

        <div className="grid gap-[5px]">
          <p className="m-0 font-mono text-[10px] font-extrabold uppercase leading-[1.4] tracking-[0.13em] text-purple">SIGN IN</p>
          <h1 className="mt-[2px] mb-0 text-[25px] leading-[1.2] tracking-[-0.03em] text-[#151b27]">관리자 로그인</h1>
          <p className="m-0 text-xs leading-[1.65] text-muted">운영 계정으로 로그인하면 역할에 따라 사용할 수 있는 기능이 정해집니다.</p>
        </div>

        <label className="grid min-w-0 gap-[7px]">
          <span className="text-[10px] font-bold text-[#667085]">아이디</span>
          <input
            className="w-full min-w-0 rounded-lg border border-[#d6dce5] bg-white px-[11px] py-[10px] text-[#252b38]"
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
            className="w-full min-w-0 rounded-lg border border-[#d6dce5] bg-white px-[11px] py-[10px] text-[#252b38]"
            name="passwordValue"
            type="password"
            value={passwordValue}
            onChange={(event) => setPasswordValue(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {notice && !failure ? (
          <p className="m-0 rounded-[9px] border border-[#e8d5a8] bg-[#fffaf0] px-3 py-[10px] text-[11px] leading-[1.55] text-[#7a5b12]" role="status">
            {notice}
          </p>
        ) : null}
        {failure ? (
          <p className="m-0 rounded-[9px] border border-[#e6b8c0] bg-[#fff7f8] px-3 py-[10px] text-[11px] leading-[1.55] text-[#a93242]" role="alert">
            {failure}
          </p>
        ) : null}

        <button
          className="min-h-[38px] rounded-lg border border-transparent bg-purple px-[13px] text-[10px] font-extrabold whitespace-nowrap text-white shadow-[0_4px_12px_rgba(105,87,232,0.18)] enabled:hover:bg-purple-dark"
          type="submit"
          disabled={submitting || loginId.trim() === '' || passwordValue === ''}
        >
          {submitting ? '확인 중…' : '로그인'}
        </button>

        <p className="m-0 text-center text-[10px] text-[#8a94a5]">내부망 전용 콘솔입니다. 계정 발급은 담당자에게 문의하세요.</p>
      </form>
    </div>
  )
}

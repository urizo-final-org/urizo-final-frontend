import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ProductApiError } from '../../shared/api/error'
import {
  fetchOverview,
  storeCredential,
  testConnection,
  type ConnectionTestResult,
  type CredentialOverview,
  type ProviderName,
  type ProviderStatus,
} from './api'

interface ProviderDefinition {
  id: ProviderName
  name: string
  shortName: string
  accent: string
  testDescription: string
}

const ACCENT_COLORS: Record<string, { accent: string; soft: string }> = {
  mint: { accent: '#0da77b', soft: '#e7f8f2' },
  blue: { accent: '#4f78da', soft: '#ebf1ff' },
  coral: { accent: '#da6853', soft: '#fff0ed' },
}

const providers: ProviderDefinition[] = [
  {
    id: 'OPENAI',
    name: 'OpenAI',
    shortName: 'OA',
    accent: 'mint',
    testDescription: 'gpt-5.4-nano · 최대 16 output token의 최소 추론',
  },
  {
    id: 'GOOGLE_GENAI',
    name: 'Google Gemini',
    shortName: 'G',
    accent: 'blue',
    testDescription: 'gemini-3.5-flash-lite · 최대 8 output token의 최소 추론',
  },
  {
    id: 'ANTHROPIC',
    name: 'Anthropic Claude',
    shortName: 'A',
    accent: 'coral',
    testDescription: 'Models API 인증만 확인 · 유료 추론 호출 없음',
  },
]

type BusyAction = 'save' | 'test' | null

function statusLabel(status?: ProviderStatus): string {
  if (!status?.configured) return '미등록'
  switch (status.state) {
    case 'STORED': return '저장됨'
    case 'VERIFIED': return '연결 확인'
    case 'BILLING_BLOCKED': return '결제 필요'
    case 'INVALID_CREDENTIAL': return '키 확인 필요'
    case 'PROVIDER_UNAVAILABLE': return '일시 확인 불가'
    default: return '상태 확인 중'
  }
}

const STATUS_PILL_BASE =
  'inline-flex w-fit items-center rounded-full border px-2 py-[5px] font-mono text-[9px] font-extrabold leading-none tracking-[0.04em]'

function statusPillClasses(state?: ProviderStatus['state']): string {
  switch (state) {
    case 'VERIFIED':
      return `${STATUS_PILL_BASE} border-[#bfeadb] bg-[#e8f8f2] text-[#087b5b]`
    case 'STORED':
    case 'BILLING_BLOCKED':
      return `${STATUS_PILL_BASE} border-[#f0dba7] bg-[#fff7e4] text-[#8a5a03]`
    case 'INVALID_CREDENTIAL':
    case 'PROVIDER_UNAVAILABLE':
      return `${STATUS_PILL_BASE} border-[#efc4cb] bg-[#fff0f2] text-[#b33243]`
    default:
      return `${STATUS_PILL_BASE} border-[#d7dce5] bg-[#f4f6f9] text-[#606b7e]`
  }
}

function formatTime(value: string | null | undefined): string {
  if (!value) return '아직 없음'
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function ProviderCard({
  provider,
  status,
  csrfToken,
  sessionToken,
  onSessionExpired,
  onStatusChange,
}: {
  provider: ProviderDefinition
  status?: ProviderStatus
  csrfToken: string
  sessionToken: string
  onSessionExpired: () => void
  onStatusChange: (status: ProviderStatus) => void
}) {
  const [credential, setCredential] = useState('')
  const [busy, setBusy] = useState<BusyAction>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy('save')
    setMessage(null)
    try {
      const next = await storeCredential(provider.id, credential, csrfToken, sessionToken)
      setCredential('')
      setTestResult(null)
      onStatusChange(next)
      setMessage('암호화 저장이 완료됐습니다. 원문은 다시 표시되지 않습니다.')
    } catch (failure) {
      if (failure instanceof ProductApiError && failure.status === 401) {
        onSessionExpired()
        return
      }
      setMessage(failure instanceof Error ? failure.message : '저장에 실패했습니다.')
    } finally {
      setBusy(null)
    }
  }

  async function runTest() {
    setBusy('test')
    setMessage(null)
    try {
      const result = await testConnection(provider.id, csrfToken, sessionToken)
      setTestResult(result)
      onStatusChange({
        ...(status ?? {
          provider: provider.id,
          configured: true,
          state: result.state,
          fingerprintSuffix: null,
          updatedAt: null,
          lastTestedAt: null,
        }),
        configured: true,
        state: result.state,
        lastTestedAt: result.testedAt,
      })
      setMessage(result.state === 'VERIFIED'
        ? '공식 Provider API 연결이 확인됐습니다.'
        : `연결 판정: ${result.safeCode}`)
    } catch (failure) {
      if (failure instanceof ProductApiError && failure.status === 401) {
        onSessionExpired()
        return
      }
      setMessage(failure instanceof Error ? failure.message : '연결 테스트에 실패했습니다.')
    } finally {
      setBusy(null)
    }
  }

  const { accent, soft } = ACCENT_COLORS[provider.accent] ?? { accent: '#6957e8', soft: '#f0edff' }

  return (
    <article
      className="relative overflow-hidden rounded-[13px] border border-line bg-white p-[19px] shadow-[0_7px_28px_rgba(31,43,65,0.04)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--accent)]"
      style={{ ['--accent' as string]: accent, ['--accent-soft' as string]: soft }}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[13px] max-[560px]:grid-cols-[auto_1fr]">
        <span
          className="flex h-[39px] w-[39px] items-center justify-center rounded-[9px] bg-[var(--accent-soft)] font-mono text-[10px] font-extrabold leading-none text-[var(--accent)]"
          aria-hidden="true"
        >
          {provider.shortName}
        </span>
        <div>
          <h3 className="m-0 mb-1 text-sm">{provider.name}</h3>
          <p className="m-0 font-mono text-[9px] leading-[1.5] text-[#7b8697]">{provider.testDescription}</p>
        </div>
        <span className={`${statusPillClasses(status?.state)} max-[560px]:col-start-2`}>
          {statusLabel(status)}
        </span>
      </div>

      <form onSubmit={save} className="mt-[17px]">
        <label className="mb-[6px] block text-[10px] font-bold text-[#667085]" htmlFor={`${provider.id}-credential`}>
          API Key
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 max-[820px]:grid-cols-2">
          <input
            className="w-full min-w-0 rounded-lg border border-[#d6dce5] bg-white px-[11px] py-[10px] text-[#252b38] max-[820px]:col-span-2"
            id={`${provider.id}-credential`}
            type="password"
            value={credential}
            onChange={(event) => setCredential(event.target.value)}
            placeholder="브라우저에서 직접 입력"
            minLength={8}
            maxLength={4096}
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
            disabled={busy !== null}
            required
          />
          <button
            className="min-h-[38px] rounded-lg border border-transparent bg-purple px-[13px] text-[10px] font-extrabold whitespace-nowrap text-white shadow-[0_4px_12px_rgba(105,87,232,0.18)] enabled:hover:bg-purple-dark"
            type="submit"
            disabled={busy !== null || credential.length < 8}
          >
            {busy === 'save' ? '저장 중…' : status?.configured ? '키 교체' : '암호화 저장'}
          </button>
          <button
            className="min-h-[38px] rounded-lg border border-[#d8dee7] bg-[#f7f8fa] px-[13px] text-[10px] font-extrabold whitespace-nowrap text-[#4c5669] enabled:hover:bg-[#eef1f5]"
            type="button"
            onClick={runTest}
            disabled={busy !== null || !status?.configured}
          >
            {busy === 'test' ? '확인 중…' : '연결 테스트'}
          </button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap gap-4 font-mono text-[9px] leading-[1.5] text-[#8993a4]">
        <span>Fingerprint <strong className="font-bold text-[#596476]">{status?.fingerprintSuffix ? `…${status.fingerprintSuffix}` : '—'}</strong></span>
        <span>최근 테스트 <strong className="font-bold text-[#596476]">{formatTime(status?.lastTestedAt)}</strong></span>
        {testResult && <span>응답 <strong className="font-bold text-[#596476]">{testResult.latencyMs} ms</strong></span>}
      </div>

      {message && <p className="mb-0 mt-[11px] text-[10px] text-[var(--accent)]" role="status">{message}</p>}
    </article>
  )
}

export default function ProviderSettings({
  sessionToken,
  onSessionExpired,
}: {
  sessionToken: string
  onSessionExpired: () => void
}) {
  const [overview, setOverview] = useState<CredentialOverview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchOverview(sessionToken)
      .then((result) => active && setOverview(result))
      .catch((failure) => {
        if (failure instanceof ProductApiError && failure.status === 401) {
          onSessionExpired()
          return
        }
        if (active) {
          setLoadError(failure instanceof Error ? failure.message : 'Backend CMS에 연결할 수 없습니다.')
        }
      })
    return () => { active = false }
  }, [sessionToken, onSessionExpired])

  const statusMap = useMemo(() => new Map(
    overview?.providers.map((status) => [status.provider, status]) ?? [],
  ), [overview])

  function updateStatus(next: ProviderStatus) {
    setOverview((current) => current ? {
      ...current,
      providers: current.providers.map((status) => status.provider === next.provider ? next : status),
    } : current)
  }

  return (
    <div>
      <section className="mb-6 flex items-start justify-between gap-7 max-[820px]:grid">
        <div>
          <p className="m-0 font-mono text-[10px] font-extrabold uppercase leading-[1.4] tracking-[0.13em] text-purple">Settings · Local Provider Gate</p>
          <h1 className="my-1 mb-[9px] text-[clamp(29px,4vw,43px)] leading-[1.07] tracking-[-0.045em] text-[#151b27]">LLM Provider 연결 준비</h1>
          <p className="m-0 max-w-[760px] text-[13px] leading-[1.7] text-muted">기존 Stage 2 loopback CMS입니다. 저장된 Key 원문은 다시 표시하지 않습니다.</p>
        </div>
        <span className="rounded-full border border-[#bfeadb] bg-[#e6f8f1] px-[10px] py-[7px] font-mono text-[9px] font-bold leading-none tracking-[0.08em] text-[#087d5d]">
          DEV · LOOPBACK ONLY
        </span>
      </section>

      <section className="mb-[18px] flex items-center gap-[13px] rounded-[10px] border border-[#d7e8e2] bg-[#f1f7f5] px-[17px] py-[15px] text-[11px] leading-[1.6] text-[#586477]" aria-label="보안 안내">
        <span className="text-[21px] text-[#0c9b73]" aria-hidden="true">⌁</span>
        <div>
          <strong className="text-[#253c35]">채팅·명령행·소스에 키를 붙여넣지 마세요.</strong>
          <span> 이 페이지의 password input만 사용하며, 저장 성공 즉시 브라우저 입력값을 비웁니다.</span>
        </div>
      </section>

      {loadError && (
        <section
          className="grid min-h-[260px] place-items-center gap-3 rounded-2xl border border-dashed border-[#e6b8c0] bg-[#fff7f8] p-9 text-center text-xs text-[#a93242]"
          role="alert"
        >
          <strong>Backend CMS 연결 실패</strong>
          <span>{loadError}</span>
        </section>
      )}

      {!overview && !loadError && (
        <section
          className="grid min-h-[260px] place-items-center gap-3 rounded-2xl border border-dashed border-[#cfd6e1] bg-white p-9 text-center text-xs text-[#707b8d]"
          aria-live="polite"
        >
          로컬 Secret Store를 확인하는 중입니다…
        </section>
      )}

      {overview && (
        <section className="grid gap-3" aria-label="LLM Provider 키 관리">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              status={statusMap.get(provider.id)}
              csrfToken={overview.csrfToken}
              sessionToken={sessionToken}
              onSessionExpired={onSessionExpired}
              onStatusChange={updateStatus}
            />
          ))}
        </section>
      )}
    </div>
  )
}

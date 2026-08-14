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

  return (
    <article className={`provider-card provider-card--${provider.accent}`}>
      <div className="provider-heading">
        <span className="provider-mark" aria-hidden="true">{provider.shortName}</span>
        <div>
          <h3>{provider.name}</h3>
          <p>{provider.testDescription}</p>
        </div>
        <span className={`status-pill status-pill--${status?.state?.toLowerCase() ?? 'empty'}`}>
          {statusLabel(status)}
        </span>
      </div>

      <form onSubmit={save} className="credential-form">
        <label htmlFor={`${provider.id}-credential`}>API Key</label>
        <div className="credential-row">
          <input
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
          <button className="button button--primary" type="submit" disabled={busy !== null || credential.length < 8}>
            {busy === 'save' ? '저장 중…' : status?.configured ? '키 교체' : '암호화 저장'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={runTest}
            disabled={busy !== null || !status?.configured}
          >
            {busy === 'test' ? '확인 중…' : '연결 테스트'}
          </button>
        </div>
      </form>

      <div className="provider-meta">
        <span>Fingerprint <strong>{status?.fingerprintSuffix ? `…${status.fingerprintSuffix}` : '—'}</strong></span>
        <span>최근 테스트 <strong>{formatTime(status?.lastTestedAt)}</strong></span>
        {testResult && <span>응답 <strong>{testResult.latencyMs} ms</strong></span>}
      </div>

      {message && <p className="card-message" role="status">{message}</p>}
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
    <div className="provider-settings">
      <section className="page-heading">
        <div>
          <p className="section-label">Settings · Local Provider Gate</p>
          <h1>LLM Provider 연결 준비</h1>
          <p>기존 Stage 2 loopback CMS입니다. 저장된 Key 원문은 다시 표시하지 않습니다.</p>
        </div>
        <span className="environment-chip">DEV · LOOPBACK ONLY</span>
      </section>

      <section className="security-note" aria-label="보안 안내">
        <span className="security-icon" aria-hidden="true">⌁</span>
        <div>
          <strong>채팅·명령행·소스에 키를 붙여넣지 마세요.</strong>
          <span> 이 페이지의 password input만 사용하며, 저장 성공 즉시 브라우저 입력값을 비웁니다.</span>
        </div>
      </section>

      {loadError && (
        <section className="load-state load-state--error" role="alert">
          <strong>Backend CMS 연결 실패</strong>
          <span>{loadError}</span>
        </section>
      )}

      {!overview && !loadError && (
        <section className="load-state" aria-live="polite">로컬 Secret Store를 확인하는 중입니다…</section>
      )}

      {overview && (
        <section className="provider-grid" aria-label="LLM Provider 키 관리">
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

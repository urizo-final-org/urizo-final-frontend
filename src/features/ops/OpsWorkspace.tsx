import { useEffect, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { OpsRouteId } from '../../app/routes'
import { describeFailure } from '../../shared/api/error'
import { Icon, type IconName } from '../../shared/ui/icons'
import {
  Badge, Callout, FilterChip, PageHead, Pagination, PanelTitle, SearchField, Tabs, Tag,
  control, panel, primaryButton, secondaryButton, smallButton, type Tone,
} from '../../shared/ui/primitives'
import type { ProfileVersion, ProfileVersionApiClient } from '../orchestration/api'
import { notifySiteUpdated, type SiteTemplate } from '../cms/api'
import type { CmsSite, CmsSiteSettings, CmsSiteSettingsApiClient } from '../site-settings/api'

/** Operations screens added on top of the CMS; only Profile-backed sections call an API. */
export default function OpsWorkspace({ route, actorName, roleLabel, profileApi, siteSettingsApi }: { route: OpsRouteId; actorName: string; roleLabel: string; profileApi: ProfileVersionApiClient; siteSettingsApi: CmsSiteSettingsApiClient }) {
  if (route === 'home') return <Home actorName={actorName} />
  if (route === 'agents') return <Agents />
  if (route === 'models') return <Models />
  if (route === 'rag') return <Rag />
  if (route === 'devops') return <Devops />
  if (route === 'approvals') return <Approvals />
  if (route === 'runs') return <Runs />
  if (route === 'system-settings') return <SystemSettings profileApi={profileApi} siteSettingsApi={siteSettingsApi} />
  if (route === 'sites') return <Sites api={siteSettingsApi} />
  return <Settings roleLabel={roleLabel} />
}

const grid = 'grid gap-3'
const headRow = 'bg-sub px-4 py-2 text-[0.6875rem] font-semibold text-muted-2 border-b border-line-soft grid'
const bodyRow = 'grid items-center border-b border-row-line px-4 py-[0.625rem] text-xs text-body'

function MockNote({ children }: { children: string }) {
  return <p className="mb-4 text-[0.71875rem] text-muted-2">{children}</p>
}

/* ------------------------------------------------------------------ 홈 */

function Home({ actorName }: { actorName: string }) {
  return <>
    <PageHead title={`안녕하세요, ${actorName}님`} description="현재 CMS와 AI Runtime의 연결 범위를 확인합니다.">
      <Badge tone="run" dot={false}>임시 목업</Badge>
    </PageHead>
    <RuntimeMockNotice>운영 통계·승인 목록·최근 실행 조회 API가 없어 가짜 수치를 표시하지 않습니다.</RuntimeMockNotice>

    <section className={panel}>
      <PanelTitle title="현재 연결 상태" sub="실제 저장·실행 계약 기준" />
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        <RuntimeFact label="CMS 관리 API" state="연결됨" tone="ok" description="회원·메뉴·컨텐츠·게시판·템플릿은 실제 CMS API를 사용합니다." />
        <RuntimeFact label="AI Job Runtime" state="Backend 구현" tone="ok" description="Job·Queue·Profile Version·Snapshot Runner 계약이 구현되어 있습니다." />
        <RuntimeFact label="운영 현황 조회" state="API 없음" tone="idle" description="통계·최근 실행·승인 목록은 조회 계약이 생긴 뒤 실제 데이터로 구현합니다." />
      </div>
    </section>
  </>
}

/* ------------------------------------------------------------------ Agent 관리 */

const agentCards: { icon: IconName; name: string; role: string; model: string; runs: string }[] = [
  { icon: 'search-check', name: 'Agent 1', role: '요구사항 분석', model: 'GPT-4o', runs: '42건' },
  { icon: 'code-2', name: 'Agent 2', role: '코드 작성·수정', model: 'Claude Sonnet', runs: '31건' },
  { icon: 'git-pull-request', name: 'Agent 3', role: '코드 리뷰·PR 요청', model: 'Gemini 1.5 Pro', runs: '28건' },
]

const agentRows: { name: string; role: string; model: string; color: string; at: string; tone: Tone; state: string }[] = [
  { name: 'Agent 1', role: '요구사항 분석', model: 'GPT-4o', color: '#4a97c4', at: '오늘 14:32', tone: 'ok', state: '활성' },
  { name: 'Agent 2', role: '코드 작성·수정', model: 'Claude Sonnet', color: '#c98a5e', at: '오늘 10:11', tone: 'ok', state: '활성' },
  { name: 'Agent 3', role: '코드 리뷰·PR 요청', model: 'Gemini 1.5 Pro', color: '#7b9ac4', at: '어제 18:04', tone: 'ok', state: '활성' },
  { name: 'Agent 4', role: '문서 요약 (실험)', model: '미배치', color: '#c2cad3', at: '2026.08.12', tone: 'idle', state: '중지' },
]

const agentColumns = 'grid-cols-[1.3fr_1fr_1fr_.8fr_.9fr_2.5rem]'

function Agents() {
  return <>
    <PageHead title="Agent 관리" description="요구분석·코딩·리뷰 역할을 수행하는 Agent와 배치된 모델을 관리합니다.">
      <button className={primaryButton}><Icon name="plus" />Agent 추가</button>
    </PageHead>
    <MockNote>정적 데모 화면입니다. 등록·수정·배치는 아직 연결되지 않았습니다.</MockNote>

    <div className={`${grid} mb-[0.875rem] md:grid-cols-3`}>
      {agentCards.map((agent) => <div key={agent.name} className={`${panel} px-4 py-[0.9375rem]`}>
        <div className="flex items-center gap-[0.5625rem]">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-run-bg text-run-fg"><Icon name={agent.icon} size={15} /></span>
          <span className="min-w-0 flex-1">
            <b className="block text-[0.8125rem] font-semibold">{agent.name}</b>
            <small className="block text-[0.6875rem] text-muted-2">{agent.role}</small>
          </span>
          <Badge tone="ok" dot={false}>활성</Badge>
        </div>
        <div className="mt-[0.875rem] grid grid-cols-2 gap-[0.625rem] border-t border-[#f0f2f5] pt-3">
          <span>
            <small className="block text-[0.65625rem] text-muted-3">배치 모델</small>
            <b className="mt-[0.1875rem] block text-xs font-semibold">{agent.model}</b>
          </span>
          <span>
            <small className="block text-[0.65625rem] text-muted-3">최근 7일 실행</small>
            <b className="mt-[0.1875rem] block text-xs font-semibold">{agent.runs}</b>
          </span>
        </div>
      </div>)}
    </div>

    <section className={panel}>
      <div className="flex flex-wrap items-center gap-[0.625rem] border-b border-line-soft px-4 py-3">
        <SearchField placeholder="Agent 이름 또는 역할 검색" className="min-w-[13.75rem] max-w-[20rem] flex-1" />
        {['역할 전체', '상태 전체', '모델 전체', '최근 수정순'].map((label, index) => <FilterChip key={label} label={label} active={index === 0} />)}
        <span className="ml-auto text-[0.71875rem] text-muted-2">전체 4건</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[47.5rem]">
          <div className={`${headRow} ${agentColumns}`}>
            <span>Agent</span><span>역할</span><span>배치 모델</span><span>상태</span><span>최근 수정</span><span />
          </div>
          {agentRows.map((agent) => <div key={agent.name} className={`${bodyRow} ${agentColumns}`}>
            <span className="flex items-center gap-2">
              <Icon name="bot" className="text-muted-2" />
              <b className="text-[0.78125rem] font-semibold text-ink">{agent.name}</b>
            </span>
            <span>{agent.role}</span>
            <span className="flex items-center gap-[0.375rem]"><i className="block h-[0.375rem] w-[0.375rem] rounded-sm" style={{ background: agent.color }} />{agent.model}</span>
            <span><Badge tone={agent.tone}>{agent.state}</Badge></span>
            <span className="text-[0.71875rem] text-muted-2">{agent.at}</span>
            <span className="flex justify-end text-muted-3"><Icon name="ellipsis" size={15} /></span>
          </div>)}
        </div>
      </div>
    </section>
  </>
}

/* ------------------------------------------------------------------ 모델 및 Provider */

const providers = [
  { initial: 'O', name: 'OpenAI', models: 7, agents: 1, key: 'TOUR-••••-9A2F', markBg: '#eef4f8', markFg: '#2c6d94' },
  { initial: 'A', name: 'Anthropic', models: 6, agents: 1, key: 'TOUR-••••-4C71', markBg: '#f8f1ea', markFg: '#a56a3c' },
  { initial: 'G', name: 'Google', models: 5, agents: 1, key: 'TOUR-••••-B0D3', markBg: '#f1f4f9', markFg: '#4a5f8a' },
]

const modelRows: { name: string; provider: string; placed: string; placedMuted: boolean; tag: string; at: string; color: string; tone: Tone; state: string }[] = [
  { name: 'GPT-4o', provider: 'OpenAI', placed: 'Agent 1 · 요구사항 분석', placedMuted: false, tag: '분석', at: '2026.08.24', color: '#4a97c4', tone: 'ok', state: '활성' },
  { name: 'GPT-4o mini', provider: 'OpenAI', placed: '미배치', placedMuted: true, tag: '경량', at: '2026.08.21', color: '#4a97c4', tone: 'idle', state: '대기' },
  { name: 'Claude Sonnet', provider: 'Anthropic', placed: 'Agent 2 · 코드 작성', placedMuted: false, tag: '코딩', at: '2026.08.24', color: '#c98a5e', tone: 'ok', state: '활성' },
  { name: 'Claude Haiku', provider: 'Anthropic', placed: '미배치', placedMuted: true, tag: '경량', at: '2026.08.18', color: '#c98a5e', tone: 'idle', state: '대기' },
  { name: 'Gemini 1.5 Pro', provider: 'Google', placed: 'Agent 3 · 코드 리뷰', placedMuted: false, tag: '리뷰', at: '2026.08.23', color: '#7b9ac4', tone: 'ok', state: '활성' },
  { name: 'Gemini 1.5 Flash', provider: 'Google', placed: '미배치', placedMuted: true, tag: '경량', at: '2026.08.16', color: '#7b9ac4', tone: 'idle', state: '대기' },
]

const modelColumns = 'grid-cols-[1.5fr_.9fr_1.1fr_.8fr_.9fr_.9fr]'

function Models() {
  return <>
    <PageHead title="모델 및 Provider 관리" description="LLM Provider를 등록하고 모델을 Agent 단계에 배치합니다.">
      <button className={secondaryButton}>Provider 등록</button>
      <button className={primaryButton}><Icon name="plus" />모델 추가</button>
    </PageHead>
    <MockNote>정적 데모 화면입니다. API Key는 마스킹된 예시 값입니다.</MockNote>

    <Tabs items={[{ label: 'Provider', count: '3' }, { label: '모델', count: '18' }, { label: 'Agent 배치', count: '3' }]} active={1} />

    <div className={`${grid} mb-[0.875rem] md:grid-cols-3`}>
      {providers.map((provider) => <div key={provider.name} className={`${panel} px-4 py-[0.9375rem]`}>
        <div className="flex items-center gap-[0.5625rem]">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-bold" style={{ background: provider.markBg, color: provider.markFg }}>{provider.initial}</span>
          <span className="min-w-0 flex-1">
            <b className="block text-[0.8125rem] font-semibold">{provider.name}</b>
            <small className="block text-[0.6875rem] text-muted-2">모델 {provider.models}개 · Agent {provider.agents}개 배치</small>
          </span>
          <Badge tone="ok">연결됨</Badge>
        </div>
        <div className="mt-[0.8125rem] flex items-center justify-between border-t border-[#f0f2f5] pt-[0.6875rem] text-[0.71875rem] text-muted">
          <span>API Key</span>
          <b className="font-mono font-medium text-body">{provider.key}</b>
        </div>
      </div>)}
    </div>

    <section className={panel}>
      <div className="flex flex-wrap items-center gap-[0.625rem] border-b border-line-soft px-4 py-3">
        <SearchField placeholder="모델명, Provider 검색" className="min-w-[13.75rem] max-w-[22.5rem] flex-1" />
        {['Provider 전체', '활성 상태', '배치 여부'].map((label, index) => <FilterChip key={label} label={label} active={index === 0} />)}
        <button className={`${smallButton} ml-auto`}><Icon name="sliders-horizontal" size={13} />표시 항목</button>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[55rem]">
          <div className={`${headRow} ${modelColumns}`}>
            <span>모델</span><span>Provider</span><span>Agent 배치</span><span>활성 상태</span><span>태그</span><span className="text-right">최근 수정일</span>
          </div>
          {modelRows.map((model) => <div key={model.name} className={`${bodyRow} ${modelColumns}`}>
            <span className="flex items-center gap-2">
              <i className="block h-[0.4375rem] w-[0.4375rem] rounded-sm" style={{ background: model.color }} />
              <b className="text-[0.78125rem] font-semibold text-ink">{model.name}</b>
            </span>
            <span>{model.provider}</span>
            <span className={model.placedMuted ? 'text-muted-3' : ''}>{model.placed}</span>
            <span><Badge tone={model.tone}>{model.state}</Badge></span>
            <span><Tag>{model.tag}</Tag></span>
            <span className="text-right text-[0.71875rem] text-muted-2">{model.at}</span>
          </div>)}
        </div>
      </div>
      <Pagination summary="전체 18건 중 1–6건" />
    </section>
  </>
}

/* ------------------------------------------------------------------ RAG 관리 */

const tree: { label: string; icon: IconName; count: string; indent: number; active?: boolean; strong?: boolean }[] = [
  { label: '한빛관광공사', icon: 'building-2', count: '', indent: 8, strong: true },
  { label: '관광지 공공데이터 API', icon: 'plug', count: '5', indent: 22, active: true, strong: true },
  { label: '관광지', icon: 'file-text', count: '4,120', indent: 36 },
  { label: '문화시설', icon: 'file-text', count: '1,870', indent: 36 },
  { label: '축제·행사', icon: 'file-text', count: '2,240', indent: 36 },
  { label: '숙박', icon: 'file-text', count: '2,010', indent: 36 },
  { label: '음식점', icon: 'file-text', count: '2,240', indent: 36 },
  { label: 'RAG 버전', icon: 'layers', count: '3', indent: 22, strong: true },
  { label: '수집 로그', icon: 'scroll-text', count: '128', indent: 22 },
]

const ragMeta = [
  { label: 'API Key', value: 'TOUR-••••-9A2F' },
  { label: '데이터 종류', value: '5종 · 관광지 외' },
  { label: '최근 수집', value: '12,480건 · 정상' },
  { label: '활성 버전', value: 'Tour-RAG v3' },
]

const buildSteps: { label: string; dur: string; kind: 'done' | 'run' | 'wait' }[] = [
  { label: '관광 데이터 수집', dur: '00:03:12', kind: 'done' },
  { label: '파싱·정제', dur: '00:05:40', kind: 'done' },
  { label: '청킹', dur: '00:02:18', kind: 'done' },
  { label: '임베딩', dur: '진행 중', kind: 'run' },
  { label: 'pgvector 저장·버전 생성', dur: '대기', kind: 'wait' },
]

const metrics = [
  { label: 'Recall@5', value: '91.3%', pct: 91.3 },
  { label: 'Hit@5', value: '93.1%', pct: 93.1 },
  { label: 'MRR@5', value: '0.88', pct: 88 },
  { label: '질문 성공률', value: '96.0%', pct: 96 },
]

const ragRows: { name: string; recall: string; hit: string; mrr: string; fail: string; active: boolean; tone: Tone; state: string }[] = [
  { name: 'Tour-RAG v1', recall: '78.2%', hit: '81.0%', mrr: '0.71', fail: '12', active: false, tone: 'ok', state: '완료' },
  { name: 'Tour-RAG v2', recall: '84.6%', hit: '87.5%', mrr: '0.79', fail: '8', active: false, tone: 'ok', state: '완료' },
  { name: 'Tour-RAG v3', recall: '91.3%', hit: '93.1%', mrr: '0.88', fail: '4', active: true, tone: 'run', state: '진행 중' },
]

const ragColumns = 'grid-cols-[1.4fr_.8fr_.8fr_.8fr_.8fr_.9fr]'
const stepSkin = { done: 'border-[#c9e2d4] bg-ok-bg text-ok-fg', run: 'border-[#cfe0ec] bg-run-bg text-run-fg', wait: 'border-line bg-white text-muted-4' }

function Rag() {
  return <>
    <PageHead title="RAG 관리" description="관광 공공데이터를 검색자료로 만들고 버전별 품질을 비교합니다.">
      <button className={secondaryButton}>데이터 소스 추가</button>
      <button className={primaryButton}><Icon name="play" size={13} />Build 시작</button>
    </PageHead>
    <MockNote>정적 데모 화면입니다. 모든 지표와 진행 상태는 예시 값입니다.</MockNote>

    <div className="grid items-start gap-[0.875rem] xl:grid-cols-[17rem_minmax(0,1fr)]">
      <section className={panel}>
        <div className="border-b border-line-soft px-[0.875rem] py-3">
          <SearchField placeholder="데이터 소스 검색" />
        </div>
        <div className="px-2 pb-3 pt-2">
          {tree.map((node) => <button
            key={node.label}
            type="button"
            className={`flex w-full items-center gap-2 rounded-[0.3125rem] py-[0.375rem] pr-2 text-left text-xs ${node.active ? 'bg-[#eef2f7] font-semibold text-primary' : node.strong ? 'font-semibold text-ink' : 'font-medium text-body'}`}
            style={{ paddingLeft: `${node.indent / 16}rem` }}
          >
            <Icon name={node.icon} className={node.active ? 'text-run-fg' : node.strong ? 'text-muted-2' : 'text-muted-4'} />
            <span className="flex-1 truncate">{node.label}</span>
            <small className="text-[0.65625rem] text-muted-3">{node.count}</small>
          </button>)}
        </div>
      </section>

      <div className="flex min-w-0 flex-col gap-[0.875rem]">
        <section className={panel}>
          <div className="flex items-start justify-between gap-4 border-b border-line-soft p-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">관광지 공공데이터 API</h2>
                <Badge tone="ok">등록 완료</Badge>
              </div>
              <p className="mt-[0.3125rem] text-xs text-muted-2">고객사 · 한빛관광공사 · 최근 수집 2026.08.23</p>
            </div>
            <button className={smallButton}>수집 설정</button>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4">
            {ragMeta.map((meta) => <div key={meta.label} className="border-r border-row-line px-4 py-[0.875rem]">
              <small className="block text-[0.65625rem] text-muted-3">{meta.label}</small>
              <b className="mt-[0.3125rem] block text-[0.78125rem] font-semibold">{meta.value}</b>
            </div>)}
          </div>
        </section>

        <div className="grid gap-[0.875rem] lg:grid-cols-2">
          <section className={panel}>
            <PanelTitle title="RAG Build 진행"><Badge tone="run">진행 중 · 3/5</Badge></PanelTitle>
            <div className="flex flex-col gap-[0.125rem] px-4 pb-4 pt-[0.875rem]">
              {buildSteps.map((step) => <div key={step.label} className={`flex items-center gap-[0.625rem] py-[0.5625rem] text-xs ${step.kind === 'wait' ? 'text-muted-3' : 'text-body'}`}>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[0.625rem] font-bold ${stepSkin[step.kind]}`}>
                  {step.kind === 'done' ? '✓' : step.kind === 'run' ? '•' : '—'}
                </span>
                <span className="flex-1">{step.label}</span>
                <small className="font-mono text-[0.6875rem] text-muted-3">{step.dur}</small>
              </div>)}
            </div>
          </section>

          <section className={panel}>
            <PanelTitle title="품질 지표 · Tour-RAG v3"><small className="text-[0.6875rem] text-muted-2">Mock 데이터</small></PanelTitle>
            <div className="flex flex-col gap-[0.875rem] px-4 pb-4 pt-[0.875rem]">
              {metrics.map((metric) => <div key={metric.label}>
                <div className="flex items-center justify-between text-[0.71875rem] text-muted">
                  <span>{metric.label}</span>
                  <b className="text-[0.78125rem] font-semibold text-ink">{metric.value}</b>
                </div>
                <div className="mt-[0.4375rem] h-[0.375rem] overflow-hidden rounded-[0.1875rem] bg-[#f0f2f5]">
                  <div className="h-[0.375rem] rounded-[0.1875rem] bg-run-fg" style={{ width: `${metric.pct}%` }} />
                </div>
              </div>)}
            </div>
          </section>
        </div>

        <section className={panel}>
          <PanelTitle title="RAG 버전" sub="모든 수치는 데모 데이터입니다.">
            <div className="flex gap-2">
              <button className={smallButton}>두 버전 비교</button>
              <button className={smallButton}>Rollback</button>
            </div>
          </PanelTitle>
          <div className="overflow-x-auto">
            <div className="min-w-[43.75rem]">
              <div className={`${headRow} ${ragColumns}`}>
                <span>버전</span><span>Recall@5</span><span>Hit@5</span><span>MRR@5</span><span>실패 질문</span><span className="text-right">빌드 상태</span>
              </div>
              {ragRows.map((version) => <div key={version.name} className={`${bodyRow} ${ragColumns}`}>
                <span className="flex items-center gap-2">
                  <b className="text-[0.78125rem] font-semibold text-ink">{version.name}</b>
                  {version.active && <span className="rounded bg-ok-bg px-[0.375rem] py-[0.125rem] text-[0.625rem] font-semibold text-ok-fg">현재 활성</span>}
                </span>
                <span className="font-mono">{version.recall}</span>
                <span className="font-mono">{version.hit}</span>
                <span className="font-mono">{version.mrr}</span>
                <span className="font-mono">{version.fail}</span>
                <span className="flex justify-end"><Badge tone={version.tone}>{version.state}</Badge></span>
              </div>)}
            </div>
          </div>
        </section>
      </div>
    </div>
  </>
}

/* ------------------------------------------------------------------ LLM DevOps */

const devopsStatus: { name: string; meta: string; tone: Tone; state: string }[] = [
  { name: 'Agent 1', meta: 'OpenAI · 요구사항 분석', tone: 'ok', state: '완료' },
  { name: 'Agent 2', meta: 'Anthropic · 코드 작성', tone: 'wait', state: '대기' },
  { name: 'Agent 3', meta: 'Google · 코드 리뷰', tone: 'wait', state: '대기' },
  { name: '최종 승인', meta: '일반관리자 검토', tone: 'wait', state: '대기' },
]

const checks = [
  { label: '지역 선택', kind: '필터' }, { label: '관광 유형 선택', kind: '필터' },
  { label: '검색 실행', kind: '동작' }, { label: '검색 결과 표시', kind: '화면' },
  { label: '검색 결과 없음 상태', kind: 'Empty State' },
]

const diff = [
  { n: '41', text: '  const [list, setList] = useState(tourList)', skin: 'bg-white text-muted' },
  { n: '42', text: '- // 관광지 목록 전체 표시', skin: 'bg-[#fdf1ef] text-fail-fg' },
  { n: '43', text: '+ // 지역·관광 유형 필터 적용 목록', skin: 'bg-[#f2faf5] text-ok-fg' },
  { n: '44', text: '+ const [region, setRegion] = useState("all")', skin: 'bg-[#f2faf5] text-ok-fg' },
  { n: '45', text: '+ const [type, setType] = useState("all")', skin: 'bg-[#f2faf5] text-ok-fg' },
  { n: '46', text: '+ // 검색 결과 없음 상태 추가', skin: 'bg-[#f2faf5] text-ok-fg' },
]

function Devops() {
  return <>
    <PageHead title="LLM DevOps" description="자연어 개발 요청을 분석하고 Agent 실행과 코드 변경을 검토합니다.">
      <button className={secondaryButton}>재작업 요청</button>
      <button className={primaryButton}>PR 요청</button>
    </PageHead>
    <MockNote>정적 데모 화면입니다. Diff는 저장되지 않고 PR도 생성되지 않습니다.</MockNote>

    <section className={`${panel} mb-[0.875rem]`}>
      <div className="flex flex-wrap items-start justify-between gap-5 p-4">
        <div>
          <div className="flex items-center gap-2 text-[0.71875rem] text-muted-2">
            <span className="font-mono">TOUR-2026-031</span><span>·</span><span>관광지 목록 화면</span>
          </div>
          <h2 className="mt-[0.4375rem] text-[1.0625rem] font-semibold">관광지 목록 필터 기능 추가</h2>
          <p className="mt-[0.3125rem] max-w-[47.5rem] text-[0.78125rem] leading-[1.6] text-muted">관광지 목록에서 지역과 관광 유형을 선택해 검색할 수 있도록 필터를 추가해줘.</p>
        </div>
        <Badge tone="wait">Agent 1 분석 완료 · 승인 대기</Badge>
      </div>
      <div className="grid border-t border-line-soft sm:grid-cols-2 xl:grid-cols-4">
        {devopsStatus.map((step) => <div key={step.name} className="border-r border-row-line px-4 py-[0.8125rem]">
          <Badge tone={step.tone}>{step.state}</Badge>
          <b className="mt-2 block text-[0.78125rem] font-semibold">{step.name}</b>
          <small className="mt-[0.125rem] block text-[0.6875rem] text-muted-2">{step.meta}</small>
        </div>)}
      </div>
    </section>

    <div className="grid gap-[0.875rem] xl:grid-cols-[1fr_1.15fr]">
      <section className={panel}>
        <PanelTitle title="요구사항 분석 결과"><Badge tone="ok">완료</Badge></PanelTitle>
        <div className="px-4 pb-4 pt-[0.375rem]">
          {checks.map((check) => <div key={check.label} className="flex items-center gap-[0.625rem] border-b border-row-line py-[0.6875rem] text-[0.78125rem] text-body">
            <span className="grid h-[1.125rem] w-[1.125rem] shrink-0 place-items-center rounded-full bg-ok-bg text-ok-fg"><Icon name="check" size={12} /></span>
            <span className="flex-1">{check.label}</span>
            <small className="text-[0.6875rem] text-muted-3">{check.kind}</small>
          </div>)}
          <div className="mt-[0.875rem]">
            <Callout tone="warn" icon="triangle-alert">추가 확인: 지역·관광 유형의 구체적인 선택 항목은 팀 논의가 필요합니다.</Callout>
          </div>
          <button className={`${primaryButton} mt-[0.875rem] w-full justify-center`}>분석 승인</button>
        </div>
      </section>

      <section className={panel}>
        <PanelTitle title="코드 변경 Diff" sub="app/tour/list/page.tsx">
          <Badge tone="run" dot={false}>Mock · 저장 안 함</Badge>
        </PanelTitle>
        <div className="p-4">
          <div className="overflow-x-auto rounded-[0.3125rem] border border-line font-mono text-[0.71875rem] leading-[2]">
            <div className="min-w-[26.25rem]">
              {diff.map((line) => <div key={line.n} className={`grid grid-cols-[2.125rem_1fr] border-b border-[#f4f6f8] ${line.skin}`}>
                <span className="bg-sub pr-[0.5625rem] text-right text-muted-4">{line.n}</span>
                <span className="whitespace-pre pl-[0.625rem]">{line.text}</span>
              </div>)}
            </div>
          </div>
          <div className="mt-[0.875rem]">
            <Callout tone="ok" icon="check-check">테스트 결과 · 12개 통과 · 데모 데이터</Callout>
          </div>
        </div>
      </section>
    </div>
  </>
}

/* ------------------------------------------------------------------ 승인 관리 */

function RuntimeMockNotice({ children }: { children: string }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-[#d9e6ef] bg-[#f4f9fc] px-3 py-2 text-[0.71875rem] text-run-fg">
    <Badge tone="run">임시 목업</Badge>
    <span>{children}</span>
  </div>
}

function RuntimeFact({ label, state, tone, description }: {
  label: string
  state: string
  tone: 'ok' | 'wait' | 'idle'
  description: string
}) {
  return <article className="rounded-md border border-line-soft bg-sub p-4">
    <div className="flex items-start gap-3">
      <b className="min-w-0 flex-1 text-[0.78125rem] font-semibold text-body">{label}</b>
      <Badge tone={tone} dot={tone !== 'idle'}>{state}</Badge>
    </div>
    <p className="mt-3 text-[0.6875rem] leading-5 text-muted-2">{description}</p>
  </article>
}

function Approvals() {
  return <>
    <PageHead title="승인 관리" description="현재 Runtime의 승인 대기 경계와 향후 연결 범위를 확인합니다.">
      <Badge tone="run" dot={false}>임시 목업</Badge>
    </PageHead>
    <RuntimeMockNotice>승인·반려 목록과 처리 이력 API가 없어 가짜 요청·건수·처리 버튼을 표시하지 않습니다.</RuntimeMockNotice>

    <section className={panel}>
      <PanelTitle title="현재 Runtime 연결 상태" sub="실제 Job 계약 기준" />
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        <RuntimeFact label="Spring Job 상태" state="구현됨" tone="ok" description="Job 상태에 WAITING_APPROVAL 경계가 있습니다." />
        <RuntimeFact label="Checkpoint 대기·재개" state="기반 있음" tone="wait" description="Runner의 checkpoint 경로는 있으나 공통 Approval Handler 연결은 후속 작업입니다." />
        <RuntimeFact label="승인 처리·이력 API" state="미연결" tone="idle" description="승인·반려 callback과 운영 이력 화면 계약은 아직 없습니다." />
      </div>
    </section>
  </>
}

/* ------------------------------------------------------------------ 실행 이력 */

function Runs() {
  return <>
    <PageHead title="실행 이력" description="현재 Runtime의 Job 실행 경계와 향후 조회 범위를 확인합니다.">
      <Badge tone="run" dot={false}>임시 목업</Badge>
    </PageHead>
    <RuntimeMockNotice>Job 조회·검색·통계 API가 없어 가짜 실행 기록, 로딩 수치, CSV 버튼을 표시하지 않습니다.</RuntimeMockNotice>

    <section className={panel}>
      <PanelTitle title="현재 Runtime 연결 상태" sub="Spring 소유 Job 기준" />
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        <RuntimeFact label="Job 상태 저장" state="구현됨" tone="ok" description="PostgreSQL Job이 실행 상태와 고정된 Profile Version을 소유합니다." />
        <RuntimeFact label="Queue·Runner 연결" state="구현됨" tone="ok" description="Queue는 jobId만 전달하고 Runner는 Claim Context로 Snapshot을 조회합니다." />
        <RuntimeFact label="이력 조회·통계 API" state="미연결" tone="idle" description="목록·필터·기간 통계·내보내기는 별도 조회 계약이 생긴 뒤 구현합니다." />
      </div>
    </section>
  </>
}

/* ------------------------------------------------------------------ 사이트 관리 */

function Sites({ api }: { api: CmsSiteSettingsApiClient }) {
  const [items, setItems] = useState<CmsSite[]>([])
  const [templates, setTemplates] = useState<SiteTemplate[]>([])
  const [selected, setSelected] = useState<CmsSite | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([api.sites(), api.templates()]).then(([nextSites, nextTemplates]) => {
      if (!active) return
      setItems(nextSites); setTemplates(nextTemplates); setSelected(nextSites[0] ?? null); setFailure(null)
    }).catch((error) => { if (active) setFailure(`사이트 설정을 불러오지 못했습니다. ${describeFailure(error)}`) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    setSaving(true); setFailure(null); setSuccess(null)
    try {
      const saved = await api.saveSite(selected.key, selected)
      setItems((current) => current.map((item) => item.key === saved.key ? saved : item))
      setSelected(saved); notifySiteUpdated(); setSuccess('사이트 설정을 저장하고 사용자 화면에 반영했습니다.')
    } catch (error) {
      setFailure(`사이트 설정을 저장하지 못했습니다. ${describeFailure(error)}`)
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageHead title="사이트 관리" description="사이트별 공개 경로와 적용 템플릿을 관리합니다.">
      <Badge tone="ok" dot={false}>API 연결</Badge>
    </PageHead>
    {failure && <Callout tone="warn" icon="triangle-alert">{failure}</Callout>}
    {success && <Callout tone="ok" icon="check-check">{success}</Callout>}

    <div className="grid items-start gap-[0.875rem] lg:grid-cols-[18rem_minmax(0,1fr)]">
      <section className={panel}>
        <PanelTitle title="사이트" sub={loading ? '불러오는 중' : `${items.length}개`} />
        <div className="grid gap-2 p-3">
          {items.map((site) => <button
            key={site.key}
            type="button"
            className={`rounded-md border p-3 text-left ${selected?.key === site.key ? 'border-primary bg-sub' : 'border-line-soft bg-white hover:bg-sub'}`}
            onClick={() => { setSelected(site); setFailure(null); setSuccess(null) }}
          >
            <span className="flex items-center gap-2"><b className="min-w-0 flex-1 truncate text-xs">{site.name}</b>{site.defaultSite && <Badge tone="run">기본</Badge>}</span>
            <small className="mt-2 block text-[0.6875rem] text-muted-2">{site.publicPath} · {site.enabled ? '사용' : '중지'}</small>
          </button>)}
          {!loading && items.length === 0 && <p className="p-3 text-xs text-muted-2">등록된 사이트가 없습니다.</p>}
        </div>
      </section>

      <form className={panel} onSubmit={save}>
        <PanelTitle title="사이트 설정" sub={selected ? selected.key : '선택 필요'} />
        {selected ? <div className="grid gap-4 p-4 md:grid-cols-2">
          <label className="text-xs font-semibold">사이트명
            <input className={`${control} mt-2`} value={selected.name} maxLength={100} required onChange={(event) => setSelected({ ...selected, name: event.target.value })} />
          </label>
          <label className="text-xs font-semibold">공개 경로
            <input className={`${control} mt-2`} value={selected.publicPath} maxLength={180} pattern="/(?:[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*)?" required onChange={(event) => setSelected({ ...selected, publicPath: event.target.value })} />
            <small className="mt-1 block font-normal text-muted-2">`/` 또는 `/campaign` 형식</small>
          </label>
          <label className="text-xs font-semibold">적용 템플릿
            <select className={`${control} mt-2`} value={selected.templateKey} required onChange={(event) => setSelected({ ...selected, templateKey: event.target.value })}>
              {templates.map((template) => <option key={template.key} value={template.key}>{template.key} · {template.layout}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end rounded-md border border-line-soft bg-sub px-3 py-[0.6875rem] text-xs font-semibold">
            <input type="checkbox" checked={selected.enabled} disabled={selected.defaultSite} onChange={(event) => setSelected({ ...selected, enabled: event.target.checked })} />
            사이트 사용
            {selected.defaultSite && <small className="ml-auto font-normal text-muted-2">기본 사이트는 중지할 수 없습니다.</small>}
          </label>
          <div className="flex justify-end md:col-span-2">
            <button className={primaryButton} disabled={saving || templates.length === 0}>{saving ? '저장 중…' : '사이트 설정 저장'}</button>
          </div>
        </div> : <p className="p-4 text-xs text-muted-2">편집할 사이트를 선택하세요.</p>}
      </form>
    </div>
  </>
}

/* ------------------------------------------------------------------ 시스템 설정 */

type SystemSettingsTabId = 'cms' | 'guardrail'

const systemSettingsTabs: { id: SystemSettingsTabId; label: string }[] = [
  { id: 'cms', label: 'CMS 기본 설정' },
  { id: 'guardrail', label: 'Guardrail Profile' },
]

function SystemSettings({ profileApi, siteSettingsApi }: { profileApi: ProfileVersionApiClient; siteSettingsApi: CmsSiteSettingsApiClient }) {
  const [activeTab, setActiveTab] = useState<SystemSettingsTabId>('cms')

  function moveTabFocus(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % systemSettingsTabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + systemSettingsTabs.length) % systemSettingsTabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = systemSettingsTabs.length - 1
    else return
    event.preventDefault()
    setActiveTab(systemSettingsTabs[next].id)
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  return <>
    <PageHead title="시스템 설정" description="CMS 기본값과 활성 Profile의 중앙 Guardrail을 관리합니다.">
      <Badge tone="ok" dot={false}>API 연결</Badge>
    </PageHead>

    <div className="mb-[1.125rem] flex gap-[1.375rem] overflow-x-auto border-b border-line" role="tablist" aria-label="시스템 설정 영역">
      {systemSettingsTabs.map((tab, index) => <button
        key={tab.id}
        type="button"
        role="tab"
        id={`system-settings-tab-${tab.id}`}
        aria-selected={activeTab === tab.id}
        tabIndex={activeTab === tab.id ? 0 : -1}
        className={`shrink-0 whitespace-nowrap bg-transparent px-[0.125rem] pb-[0.625rem] text-[0.8125rem] ${activeTab === tab.id ? 'font-semibold text-ink shadow-[inset_0_-2px_var(--primary)]' : 'font-medium text-muted'}`}
        onClick={() => setActiveTab(tab.id)}
        onKeyDown={(event) => moveTabFocus(event, index)}
      >
        {tab.label}
      </button>)}
    </div>

    {activeTab === 'cms' && <CmsDefaults api={siteSettingsApi} />}

    {activeTab === 'guardrail' && <GuardrailProfileStatus api={profileApi} />}
  </>
}

function CmsDefaults({ api }: { api: CmsSiteSettingsApiClient }) {
  const [value, setValue] = useState<CmsSiteSettings | null>(null)
  const [sites, setSites] = useState<CmsSite[]>([])
  const [templates, setTemplates] = useState<SiteTemplate[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([api.settings(), api.sites(), api.templates()]).then(([settings, nextSites, nextTemplates]) => {
      if (!active) return
      setValue(settings); setSites(nextSites); setTemplates(nextTemplates); setFailure(null)
    }).catch((error) => { if (active) setFailure(`CMS 기본 설정을 불러오지 못했습니다. ${describeFailure(error)}`) })
    return () => { active = false }
  }, [api])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!value) return
    setSaving(true); setFailure(null); setSuccess(null)
    try {
      const saved = await api.saveSettings(value)
      setValue(saved); setSites(await api.sites()); notifySiteUpdated(); setSuccess('CMS 기본 설정을 저장하고 사용자 화면에 반영했습니다.')
    } catch (error) {
      setFailure(`CMS 기본 설정을 저장하지 못했습니다. ${describeFailure(error)}`)
    } finally {
      setSaving(false)
    }
  }

  return <section id="system-settings-panel-cms" role="tabpanel" aria-labelledby="system-settings-tab-cms">
    {failure && <Callout tone="warn" icon="triangle-alert">{failure}</Callout>}
    {success && <Callout tone="ok" icon="check-check">{success}</Callout>}
    <form className={panel} onSubmit={save}>
      <PanelTitle title="CMS 기본 설정" sub="기본 사이트의 적용 템플릿을 함께 저장합니다." />
      {value ? <div className="grid gap-4 p-4 md:grid-cols-2">
        <label className="text-xs font-semibold">기본 사이트
          <select className={`${control} mt-2`} value={value.defaultSiteKey} required onChange={(event) => setValue({ ...value, defaultSiteKey: event.target.value })}>
            {sites.filter((site) => site.enabled).map((site) => <option key={site.key} value={site.key}>{site.name} · {site.publicPath}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">기본 템플릿
          <select className={`${control} mt-2`} value={value.defaultTemplateKey} required onChange={(event) => setValue({ ...value, defaultTemplateKey: event.target.value })}>
            {templates.map((template) => <option key={template.key} value={template.key}>{template.key} · {template.layout}</option>)}
          </select>
        </label>
        <p className="m-0 text-[0.6875rem] leading-5 text-muted-2 md:col-span-2">사이트명·공개 경로·사용 여부는 사이트 관리에서, 레이아웃·색상·Header·Hero·버튼·Footer는 템플릿 관리에서 변경합니다.</p>
        <div className="flex justify-end md:col-span-2"><button className={primaryButton} disabled={saving || sites.length === 0 || templates.length === 0}>{saving ? '저장 중…' : '기본 설정 저장'}</button></div>
      </div> : <p className="p-4 text-xs text-muted-2">CMS 기본 설정을 불러오는 중입니다…</p>}
    </form>
  </section>
}

function GuardrailProfileStatus({ api }: { api: ProfileVersionApiClient }) {
  const [versions, setVersions] = useState<ProfileVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void api.list().then((items) => {
      if (active) setVersions(items.filter((item) => item.status === 'ACTIVE'))
    }).catch((error: unknown) => {
      if (active) setFailure(describeFailure(error))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api])

  const centralKeys = [...new Set(versions.map((version) => version.snapshot.guardrailProfileKey))]

  return <section id="system-settings-panel-guardrail" role="tabpanel" aria-labelledby="system-settings-tab-guardrail">
    <Callout tone="ok" icon="shield-check">
      중앙 Guardrail 연결은 활성 Profile Snapshot에서 계산한 읽기 전용 상태입니다. 삭제·비활성화·정책 변경 기능은 제공하지 않습니다.
    </Callout>
    {failure && <div role="alert" className="mt-3 rounded border border-[#ead2d2] bg-fail-bg px-3 py-2 text-[0.71875rem] text-fail-fg">{failure}</div>}
    <article className={`${panel} mt-3`}>
      <PanelTitle title="활성 Guardrail Profile" sub="Profile Version API 조회 결과">
        <Badge tone={versions.length > 0 ? 'ok' : 'idle'} dot={false}>{loading ? '조회 중' : `${versions.length}개 활성 Profile`}</Badge>
      </PanelTitle>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {versions.map((version) => <RuntimeFact
          key={version.profileVersionId}
          label={`${version.profileKey} v${version.profileVersion}`}
          state={version.snapshot.guardrailProfileKey}
          tone="ok"
          description={`잠금 Guardrail Node ${lockedGuardrailCount(version)}개 · 삭제/비활성화 불가`}
        />)}
        {!loading && !failure && versions.length === 0 && <RuntimeFact label="활성 Profile" state="없음" tone="idle" description="활성 Profile Version을 확인해 주세요." />}
        <RuntimeFact label="중앙 Profile Key" state={centralKeys.join(', ') || '조회 결과 없음'} tone={centralKeys.length > 0 ? 'ok' : 'idle'} description="활성 Snapshot이 참조하는 Guardrail Profile Key입니다." />
      </div>
    </article>
  </section>
}

function lockedGuardrailCount(version: ProfileVersion): number {
  return version.snapshot.nodes.filter((node) => {
    if (!node || typeof node !== 'object') return false
    const value = node as { type?: unknown; config?: { locked?: unknown } }
    return value.type === 'guardrail' && value.config?.locked === true
  }).length
}

/* ------------------------------------------------------------------ 설정 */

function Settings({ roleLabel }: { roleLabel: string }) {
  return <>
    <PageHead title="설정" description="현재 CMS 인증 범위와 향후 설정 확장 지점을 확인합니다.">
      <Badge tone="run" dot={false}>임시 목업</Badge>
    </PageHead>
    <RuntimeMockNotice>조직·권한 정책·API Key·알림 저장 API가 없어 가짜 값과 저장 컨트롤을 표시하지 않습니다.</RuntimeMockNotice>

    <section className={panel}>
      <PanelTitle title="현재 연결 상태" sub={`현재 로그인 역할 · ${roleLabel}`} />
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        <RuntimeFact label="CMS 로그인·역할" state="구현됨" tone="ok" description="현재 세션과 CMS 역할에 따라 관리자 메뉴 접근을 제어합니다." />
        <RuntimeFact label="조직·권한 정책 설정" state="API 없음" tone="idle" description="현재 CMS MVP에는 별도 조직·권한 정책 저장 계약이 없습니다." />
        <RuntimeFact label="API Key·알림 설정" state="API 없음" tone="idle" description="필요성이 확정되면 해당 기능 소유 문서와 Runtime 계약을 먼저 정의합니다." />
      </div>
    </section>
  </>
}

import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { OpsRouteId } from '../../app/routes'
import { Icon, type IconName } from '../../shared/ui/icons'
import {
  Badge, Callout, EmptyState, FilterChip, PageHead, Pagination, PanelTitle, SearchField, Tabs, Tag,
  control, fieldLabel, panel, primaryButton, secondaryButton, smallButton, type Tone,
} from '../../shared/ui/primitives'

/**
 * Screens the design canvas adds on top of the CMS. They are static mockups: no API call, no
 * persistence. Every number here is demo data and the UI says so.
 */
export default function OpsWorkspace({ route, actorName, roleLabel }: { route: OpsRouteId; actorName: string; roleLabel: string }) {
  if (route === 'home') return <Home actorName={actorName} />
  if (route === 'agents') return <Agents />
  if (route === 'models') return <Models />
  if (route === 'rag') return <Rag />
  if (route === 'devops') return <Devops />
  if (route === 'approvals') return <Approvals />
  if (route === 'runs') return <Runs />
  if (route === 'system-settings') return <SystemSettings />
  if (route === 'sites') return <Sites />
  return <Settings roleLabel={roleLabel} />
}

const grid = 'grid gap-3'
const headRow = 'bg-sub px-4 py-2 text-[0.6875rem] font-semibold text-muted-2 border-b border-line-soft grid'
const bodyRow = 'grid items-center border-b border-row-line px-4 py-[0.625rem] text-xs text-body'

function MockNote({ children }: { children: string }) {
  return <p className="mb-4 text-[0.71875rem] text-muted-2">{children}</p>
}

/* ------------------------------------------------------------------ 홈 */

const stats: { icon: IconName; label: string; value: string; unit: string; delta: string; deltaClass: string }[] = [
  { icon: 'activity', label: '오늘 실행', value: '14', unit: '건', delta: '성공 11 · 진행 2 · 실패 1', deltaClass: 'text-muted' },
  { icon: 'shield-check', label: '승인 대기', value: '3', unit: '건', delta: '가장 오래된 요청 · 2시간 전', deltaClass: 'text-wait-fg' },
  { icon: 'database', label: 'RAG 활성 버전', value: 'v3', unit: 'Tour-RAG', delta: 'Recall@5 91.3% · 실패 질문 4', deltaClass: 'text-ok-fg' },
  { icon: 'boxes', label: '등록 모델', value: '18', unit: '개', delta: 'Provider 3곳 · Agent 배치 3개', deltaClass: 'text-muted' },
]

const recentRuns: { icon: IconName; title: string; id: string; agent: string; dur: string; at: string; tone: Tone; state: string }[] = [
  { icon: 'code-2', title: '관광지 목록 필터 기능 추가', id: 'TOUR-2026-031', agent: 'Agent 1 · OpenAI', dur: '00:04:12', at: '14:32', tone: 'wait', state: '승인 대기' },
  { icon: 'database', title: 'Tour-RAG v3 임베딩 빌드', id: 'RAG-2026-118', agent: 'Build · pgvector', dur: '00:21:47', at: '13:05', tone: 'ok', state: '성공' },
  { icon: 'file-text', title: '서울 전통문화 명소 메뉴 추가', id: 'CMS-2026-402', agent: 'Natural CMS', dur: '00:00:38', at: '11:49', tone: 'ok', state: '완료' },
  { icon: 'network', title: '축제·행사 상세 레이아웃 개선', id: 'TOUR-2026-030', agent: 'Agent 2 · Anthropic', dur: '00:07:02', at: '10:11', tone: 'run', state: '진행' },
  { icon: 'code-2', title: '음식점 목록 정렬 오류 수정', id: 'TOUR-2026-029', agent: 'Agent 3 · Google', dur: '00:02:55', at: '09:26', tone: 'fail', state: '실패' },
]

const chart = [['월', 62, 10, 0], ['화', 78, 14, 8], ['수', 54, 8, 0], ['목', 92, 12, 6], ['금', 70, 18, 0], ['토', 34, 6, 0], ['일', 46, 10, 5]] as const

const pending = [
  { title: '관광지 목록 필터 기능 추가', meta: 'LLM DevOps · Agent 1 분석 결과', at: '2시간 전' },
  { title: '서울 전통문화 명소 메뉴 추가', meta: '자연어 CMS · 메뉴 관리', at: '4시간 전' },
  { title: 'Tour-RAG v3 활성 버전 전환', meta: 'RAG 관리 · 버전 전환', at: '어제' },
]

const summary: { icon: IconName; label: string; value: string }[] = [
  { icon: 'bot', label: '활성 Agent', value: '3 / 4' },
  { icon: 'boxes', label: '연결된 Provider', value: '3곳' },
  { icon: 'file-text', label: '이번 주 CMS 변경', value: '12건' },
  { icon: 'repeat', label: '재작업 발생', value: '1 / 3회' },
]

const runsColumns = 'grid-cols-[1.7fr_1fr_.9fr_.9fr_.8fr]'

function Home({ actorName }: { actorName: string }) {
  return <>
    <PageHead title={`안녕하세요, ${actorName}님`} description="AX Module Studio의 Agent, RAG, 자연어 CMS, LLM DevOps 운영 현황입니다.">
      <button className={secondaryButton}><Icon name="history" />실행 이력</button>
      <button className={primaryButton}><Icon name="plus" />새 작업 요청</button>
    </PageHead>
    <MockNote>이 화면의 모든 수치는 정적 데모 데이터입니다. 실제 API를 호출하지 않습니다.</MockNote>

    <div className={`${grid} mb-[0.875rem] sm:grid-cols-2 xl:grid-cols-4`}>
      {stats.map((stat) => <div key={stat.label} className={`${panel} px-4 py-[0.9375rem]`}>
        <div className="flex items-center gap-[0.4375rem] text-[0.71875rem] font-semibold text-muted">
          <Icon name={stat.icon} className="text-muted-2" />{stat.label}
        </div>
        <div className="mt-[0.6875rem] flex items-end gap-[0.4375rem]">
          <b className="text-[1.5625rem] font-semibold leading-none tracking-[-.03em]">{stat.value}</b>
          <span className="pb-[0.125rem] text-[0.6875rem] text-muted-2">{stat.unit}</span>
        </div>
        <div className={`mt-[0.625rem] border-t border-[#f0f2f5] pt-[0.625rem] text-[0.6875rem] ${stat.deltaClass}`}>{stat.delta}</div>
      </div>)}
    </div>

    <div className="grid items-start gap-[0.875rem] xl:grid-cols-[minmax(0,1fr)_21.25rem]">
      <div className="flex min-w-0 flex-col gap-[0.875rem]">
        <section className={panel}>
          <PanelTitle title="최근 실행" sub="오케스트레이션 · LLM DevOps · RAG Build">
            <button className="bg-transparent text-[0.71875rem] font-semibold text-link">전체 보기</button>
          </PanelTitle>
          <div className="overflow-x-auto">
            <div className="min-w-[42.5rem]">
              <div className={`${headRow} ${runsColumns}`}>
                <span>작업</span><span>Agent · 모델</span><span>상태</span><span>소요</span><span className="text-right">시작</span>
              </div>
              {recentRuns.map((run) => <div key={run.id} className={`${bodyRow} ${runsColumns}`}>
                <span className="flex min-w-0 items-center gap-2">
                  <Icon name={run.icon} className="text-muted-2" />
                  <span className="min-w-0">
                    <b className="block truncate text-[0.78125rem] font-semibold text-ink">{run.title}</b>
                    <small className="block font-mono text-[0.65625rem] text-muted-3">{run.id}</small>
                  </span>
                </span>
                <span className="truncate">{run.agent}</span>
                <span><Badge tone={run.tone}>{run.state}</Badge></span>
                <span className="font-mono text-[0.71875rem]">{run.dur}</span>
                <span className="text-right text-[0.71875rem] text-muted-2">{run.at}</span>
              </div>)}
            </div>
          </div>
        </section>

        <section className={panel}>
          <PanelTitle title="주간 실행 현황" sub="최근 7일 · 정적 Mock 데이터">
            <div className="flex items-center gap-3 text-[0.6875rem] text-muted max-[560px]:hidden">
              <span className="inline-flex items-center gap-[0.3125rem]"><i className="block h-2 w-2 rounded-sm bg-run-fg" />성공</span>
              <span className="inline-flex items-center gap-[0.3125rem]"><i className="block h-2 w-2 rounded-sm bg-wait-dot" />대기</span>
              <span className="inline-flex items-center gap-[0.3125rem]"><i className="block h-2 w-2 rounded-sm bg-[#d18d86]" />실패</span>
            </div>
          </PanelTitle>
          <div className="flex h-[10.625rem] items-end gap-[1.125rem] px-[1.125rem] pb-[0.625rem] pt-5">
            {chart.map(([day, ok, wait, fail]) => <div key={day} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div className="flex h-full w-full max-w-[2.75rem] flex-col justify-end gap-[0.125rem]">
                <div className="rounded-t-sm bg-[#d18d86]" style={{ height: `${fail}%` }} />
                <div className="bg-wait-dot" style={{ height: `${wait}%` }} />
                <div className="rounded-b-sm bg-run-fg" style={{ height: `${ok}%` }} />
              </div>
              <small className="text-[0.65625rem] text-muted-3">{day}</small>
            </div>)}
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-[0.875rem]">
        <section className={panel}>
          <PanelTitle title="승인 대기" sub="일반관리자 확인이 필요한 항목" />
          {pending.map((item) => <div key={item.title} className="border-b border-row-line px-4 py-3">
            <div className="flex items-center gap-[0.4375rem]">
              <Badge tone="wait">승인 대기</Badge>
              <small className="ml-auto text-[0.65625rem] text-muted-3">{item.at}</small>
            </div>
            <b className="mt-[0.4375rem] block text-[0.78125rem] font-semibold">{item.title}</b>
            <small className="mt-[0.1875rem] block text-[0.6875rem] text-muted-2">{item.meta}</small>
          </div>)}
          <div className="px-4 py-3">
            <button className={`${secondaryButton} h-[1.875rem] w-full justify-center text-[0.71875rem]`}>승인 관리로 이동</button>
          </div>
        </section>

        <section className={panel}>
          <PanelTitle title="운영 요약" />
          <div className="px-4 pb-[0.875rem] pt-[0.375rem]">
            {summary.map((item) => <div key={item.label} className="flex items-center gap-[0.625rem] border-b border-row-line py-[0.625rem] text-xs">
              <Icon name={item.icon} className="text-muted-2" />
              <span className="flex-1 text-body">{item.label}</span>
              <b className="font-semibold">{item.value}</b>
            </div>)}
          </div>
        </section>
      </div>
    </div>
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

const approvals = [
  { title: '관광지 목록 필터 기능 추가', id: 'TOUR-2026-031', kind: 'LLM DevOps', by: '이은지', at: '오늘 14:32' },
  { title: '서울 전통문화 명소 메뉴 추가', id: 'CMS-2026-402', kind: '자연어 CMS', by: '이은지', at: '오늘 11:49' },
  { title: 'Tour-RAG v3 활성 버전 전환', id: 'RAG-2026-118', kind: 'RAG 관리', by: '김한빛', at: '어제 17:20' },
  { title: '음식점 목록 정렬 오류 수정 재작업', id: 'TOUR-2026-029', kind: 'LLM DevOps', by: '이은지', at: '어제 09:26' },
]

const approvalColumns = 'grid-cols-[1.8fr_1fr_.9fr_.9fr_10rem]'

function Approvals() {
  return <>
    <PageHead title="승인 관리" description="Agent 실행과 CMS 변경 요청의 승인·반려 이력을 확인합니다." />
    <MockNote>정적 데모 화면입니다. 승인·반려 버튼은 아직 동작하지 않습니다.</MockNote>

    <Tabs items={[{ label: '승인 대기', count: '3' }, { label: '승인 완료', count: '24' }, { label: '반려', count: '0' }, { label: '전체', count: '27' }]} active={0} />

    <section className={`${panel} mb-[0.875rem]`}>
      <div className="flex flex-wrap items-center gap-[0.625rem] border-b border-line-soft px-4 py-3">
        <SearchField placeholder="요청 제목, 요청자, 작업 ID 검색" className="min-w-[15rem] max-w-[25rem] flex-1" />
        {['유형 전체', '요청자 전체', '최근 30일'].map((label, index) => <FilterChip key={label} label={label} active={index === 0} />)}
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[52.5rem]">
          <div className={`${headRow} ${approvalColumns}`}>
            <span>요청</span><span>유형</span><span>요청자</span><span>요청일</span><span className="text-right">처리</span>
          </div>
          {approvals.map((item) => <div key={item.id} className={`${bodyRow} ${approvalColumns}`}>
            <span className="min-w-0">
              <b className="block truncate text-[0.78125rem] font-semibold text-ink">{item.title}</b>
              <small className="block font-mono text-[0.65625rem] text-muted-3">{item.id}</small>
            </span>
            <span><Tag>{item.kind}</Tag></span>
            <span>{item.by}</span>
            <span className="text-[0.71875rem] text-muted-2">{item.at}</span>
            <span className="flex justify-end gap-[0.4375rem]">
              <button className={smallButton}>반려</button>
              <button className="inline-flex h-7 items-center rounded-[0.3125rem] bg-primary px-3 text-[0.71875rem] font-semibold text-white">승인</button>
            </span>
          </div>)}
        </div>
      </div>
    </section>

    <section className={panel}>
      <PanelTitle title="반려 이력" sub="현재 필터 조건 · 최근 30일" />
      <EmptyState
        title="반려된 요청이 없습니다"
        description={<>선택한 기간에 반려 처리된 요청이 없습니다.<br />기간이나 필터 조건을 변경해 다시 확인해 보세요.</>}
      >
        <button className={secondaryButton}>필터 초기화</button>
        <button className={secondaryButton}>기간 90일로 변경</button>
      </EmptyState>
    </section>
  </>
}

/* ------------------------------------------------------------------ 실행 이력 */

const runRows: { icon: IconName; title: string; id: string; step: string; agent: string; dur: string; at: string; tone: Tone; state: string }[] = [
  { icon: 'code-2', title: '관광지 목록 필터 기능 추가', id: 'TOUR-2026-031', step: 'Agent 1 분석', agent: 'OpenAI · GPT-4o', dur: '00:04:12', at: '08.25 14:32', tone: 'wait', state: '승인 대기' },
  { icon: 'database', title: 'Tour-RAG v3 임베딩 빌드', id: 'RAG-2026-118', step: '임베딩', agent: 'Build · pgvector', dur: '00:21:47', at: '08.25 13:05', tone: 'run', state: '진행' },
  { icon: 'file-text', title: '서울 전통문화 명소 메뉴 추가', id: 'CMS-2026-402', step: '변경 반영', agent: 'Natural CMS', dur: '00:00:38', at: '08.25 11:49', tone: 'ok', state: '성공' },
  { icon: 'network', title: '축제·행사 상세 레이아웃 개선', id: 'TOUR-2026-030', step: 'Agent 2 작성', agent: 'Anthropic · Sonnet', dur: '00:07:02', at: '08.25 10:11', tone: 'run', state: '진행' },
  { icon: 'code-2', title: '음식점 목록 정렬 오류 수정', id: 'TOUR-2026-029', step: 'Agent 3 리뷰', agent: 'Google · Gemini', dur: '00:02:55', at: '08.25 09:26', tone: 'fail', state: '실패' },
  { icon: 'file-text', title: '공지사항 상단 고정 변경', id: 'CMS-2026-401', step: '변경 반영', agent: 'Natural CMS', dur: '00:00:44', at: '08.24 17:38', tone: 'ok', state: '성공' },
  { icon: 'database', title: 'Tour-RAG v2 품질 재측정', id: 'RAG-2026-117', step: '평가', agent: 'Build · eval', dur: '00:12:09', at: '08.24 15:02', tone: 'ok', state: '성공' },
  { icon: 'code-2', title: '숙박 상세 이미지 슬라이더 추가', id: 'TOUR-2026-028', step: 'PR 요청', agent: 'Google · Gemini', dur: '00:05:31', at: '08.24 11:15', tone: 'ok', state: '성공' },
]

const legend = [
  { label: '성공', dot: 'bg-ok-dot' }, { label: '진행', dot: 'bg-run-dot' },
  { label: '대기', dot: 'bg-wait-dot' }, { label: '실패', dot: 'bg-fail-dot' },
]
const runHistoryColumns = 'grid-cols-[1.7fr_1fr_1fr_.8fr_.8fr_.9fr]'

function Runs() {
  return <>
    <PageHead title="실행 이력" description="오케스트레이션, RAG Build, 자연어 CMS 실행 기록을 조회합니다.">
      <button className={secondaryButton}><Icon name="download" />CSV 내보내기</button>
    </PageHead>
    <MockNote>정적 데모 화면입니다. 아래 통계 카드는 Loading State를 보여주기 위한 예시입니다.</MockNote>

    <section className={`${panel} mb-[0.875rem]`}>
      <div className="flex flex-wrap items-center gap-[0.625rem] px-4 py-3">
        <SearchField placeholder="작업명, 실행 ID, Agent 검색" className="min-w-[17.5rem] max-w-[26.25rem] flex-1" />
        <span className="flex h-[1.875rem] overflow-hidden rounded-[0.3125rem] border border-field-line">
          {['24시간', '7일', '30일', '사용자 지정'].map((label, index) => <span
            key={label}
            className={`grid place-items-center border-l border-field-line px-[0.6875rem] text-[0.71875rem] font-semibold first:border-l-0 ${index === 1 ? 'bg-primary text-white' : 'bg-white text-body'}`}
          >{label}</span>)}
        </span>
        {['상태 전체', '유형 전체', 'Agent 전체'].map((label, index) => <FilterChip key={label} label={label} active={index === 0} />)}
        <div className="ml-auto flex items-center gap-3 text-[0.6875rem] text-muted">
          {legend.map((item) => <span key={item.label} className="inline-flex items-center gap-[0.3125rem]">
            <i className={`block h-[0.4375rem] w-[0.4375rem] rounded-full ${item.dot}`} />{item.label}
          </span>)}
        </div>
      </div>
    </section>

    <section className={`${panel} mb-[0.875rem]`}>
      <PanelTitle title="실행 통계" sub="데이터를 불러오는 중입니다 · Loading State">
        <Badge tone="run" dot={false}><Icon name="loader-circle" size={12} />불러오는 중</Badge>
      </PanelTitle>
      <div className={`${grid} p-4 sm:grid-cols-2 xl:grid-cols-4`} aria-hidden="true">
        {[1, 2, 3, 4].map((key) => <div key={key} className="rounded-md border border-line-soft p-[0.875rem]">
          <div className="h-[0.5625rem] w-[44%] rounded-[0.1875rem] bg-line-soft" />
          <div className="mt-3 h-5 w-[64%] rounded bg-row-line" />
          <div className="mt-3 h-[0.5625rem] w-[80%] rounded-[0.1875rem] bg-[#f4f6f8]" />
        </div>)}
      </div>
    </section>

    <section className={panel}>
      <div className="overflow-x-auto">
        <div className="min-w-[56.25rem]">
          <div className={`${headRow} ${runHistoryColumns}`}>
            <span>실행</span><span>단계</span><span>Agent · 모델</span><span>상태</span><span>소요</span><span className="text-right">시작 시각</span>
          </div>
          {runRows.map((run) => <div key={run.id} className={`${bodyRow} ${runHistoryColumns}`}>
            <span className="flex min-w-0 items-center gap-2">
              <Icon name={run.icon} className="text-muted-2" />
              <span className="min-w-0">
                <b className="block truncate text-[0.78125rem] font-semibold text-ink">{run.title}</b>
                <small className="block font-mono text-[0.65625rem] text-muted-3">{run.id}</small>
              </span>
            </span>
            <span>{run.step}</span>
            <span className="truncate">{run.agent}</span>
            <span><Badge tone={run.tone}>{run.state}</Badge></span>
            <span className="font-mono text-[0.71875rem]">{run.dur}</span>
            <span className="text-right text-[0.71875rem] text-muted-2">{run.at}</span>
          </div>)}
        </div>
      </div>
      <Pagination summary="전체 126건 중 1–8건" />
    </section>
  </>
}

/* ------------------------------------------------------------------ 사이트 관리 */

function Sites() {
  const [siteName, setSiteName] = useState('기본 사용자 사이트')

  return <>
    <PageHead title="사이트 관리" description="기본 사용자 사이트의 표시 정보를 검토합니다.">
      <Badge tone="run" dot={false}>최고관리자 전용</Badge>
    </PageHead>
    <MockNote>UI/UX Mock입니다. 변경 내용은 현재 화면에서만 유지되며 실제 사용자 사이트나 CMS 저장 API에 반영되지 않습니다.</MockNote>

    <div className="grid items-start gap-[0.875rem] xl:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className={panel} aria-label="관리 사이트 목록">
        <PanelTitle title="사이트" sub="현재 CMS의 기본 사용자 사이트" />
        <div className="p-3">
          <button type="button" aria-label="기본 사용자 사이트 선택" aria-pressed="true" className="w-full rounded-md border border-primary bg-run-bg p-3 text-left">
            <span className="flex items-center gap-2"><Icon name="globe-2" className="text-run-fg" /><b className="text-[0.8125rem] font-semibold">{siteName || '이름 없는 사이트'}</b></span>
            <small className="mt-2 block font-mono text-[0.6875rem] text-muted-2">/</small>
          </button>
        </div>
      </aside>

      <article className={panel}>
        <PanelTitle title="기본 사용자 사이트" sub="사이트 한 곳의 로컬 표시 설정">
          <Badge tone="idle" dot={false}>저장 안 함</Badge>
        </PanelTitle>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div>
            <label className={fieldLabel}>사이트명
              <input aria-label="관리 사이트명" className={control} value={siteName} onChange={(event) => setSiteName(event.target.value)} />
            </label>
            <label className={`${fieldLabel} mt-[0.875rem]`}>공개 경로
              <input aria-label="관리 사이트 공개 경로" className={`${control} font-mono`} defaultValue="/" />
            </label>
          </div>
          <div>
            <Callout tone="warn" icon="triangle-alert">
              사이드바의 사용자 사이트 열기 링크와 별도인 관리 목업입니다. 추가·삭제·Version·실제 게시 기능은 포함하지 않습니다.
            </Callout>
            <div className="mt-3 rounded-md border border-line-soft bg-sub p-3 text-[0.71875rem] leading-6 text-muted-2">
              실제 사이트별 저장·조회와 CMS 반영은 5번 CMS Domain의 후속 Work에서 연결합니다.
            </div>
          </div>
        </div>
      </article>
    </div>
  </>
}

/* ------------------------------------------------------------------ 시스템 설정 */

type SystemSettingsTabId = 'cms' | 'guardrail'

const systemSettingsTabs: { id: SystemSettingsTabId; label: string }[] = [
  { id: 'cms', label: 'CMS 기본 설정' },
  { id: 'guardrail', label: 'Guardrail Profile' },
]

const lockedGuardrails = [
  { label: '작업 경로 제한', description: '허용 경로 밖의 파일 접근을 항상 차단합니다.' },
  { label: 'Agent별 Tool Allowlist', description: '등록된 Tool 범위 밖의 호출을 항상 차단합니다.' },
  { label: 'Prompt·Source·Diff 원문 전송 차단', description: '원문은 기본 전송하지 않으며 별도 결정 없이는 해제할 수 없습니다.' },
  { label: 'Secret 노출 차단', description: 'Key·Token·인증정보 원문을 항상 차단합니다.' },
  { label: '인증·Migration 보호', description: '인증 파일과 Migration 경로 변경을 항상 차단합니다.' },
]

function SystemSettings() {
  const [activeTab, setActiveTab] = useState<SystemSettingsTabId>('cms')
  const [siteName, setSiteName] = useState('AX Module Studio')
  const [allowedPath, setAllowedPath] = useState('src/**')

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
    <PageHead title="시스템 설정" description="CMS 기본값과 중앙 Guardrail Profile을 검토합니다.">
      <Badge tone="run" dot={false}>최고관리자 전용</Badge>
    </PageHead>
    <MockNote>UI/UX Mock입니다. 변경 내용은 현재 화면의 로컬 상태이며 저장 API를 호출하지 않습니다.</MockNote>

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
      >{tab.label}</button>)}
    </div>

    {activeTab === 'cms' && <section id="system-settings-panel-cms" role="tabpanel" aria-labelledby="system-settings-tab-cms" className="grid items-start gap-[0.875rem] xl:grid-cols-2">
      <article className={panel}>
        <PanelTitle title="CMS 기본값" sub="신규 CMS Resource에 적용할 로컬 예시" />
        <div className="p-4">
          <label className={fieldLabel}>기본 사이트명
            <input aria-label="CMS 기본 사이트명" className={control} value={siteName} onChange={(event) => setSiteName(event.target.value)} />
          </label>
          <label className={`${fieldLabel} mt-[0.875rem]`}>기본 공개 경로
            <input aria-label="CMS 기본 공개 경로" className={`${control} font-mono`} defaultValue="/" />
          </label>
          <label className={`${fieldLabel} mt-[0.875rem]`}>삭제 방식
            <input aria-label="CMS 삭제 방식" className={control} value="소프트 삭제" readOnly />
          </label>
        </div>
      </article>
      <article className={panel}>
        <PanelTitle title="CMS 저장 경계"><Badge tone="wait" dot={false}>후속 연결</Badge></PanelTitle>
        <div className="p-4 text-[0.71875rem] leading-6 text-muted-2">
          <p>삭제는 소프트 삭제를 기본으로 표시하며 복원 기능은 만들지 않습니다.</p>
          <p className="mt-3">사이트별 실제 저장·조회는 5번 CMS Domain의 후속 API에서 연결합니다. 공통 Profile Version에는 저장하지 않습니다.</p>
        </div>
      </article>
    </section>}

    {activeTab === 'guardrail' && <section id="system-settings-panel-guardrail" role="tabpanel" aria-labelledby="system-settings-tab-guardrail">
      <Callout tone="warn" icon="triangle-alert">
        이 화면은 중앙 Guardrail Profile 목업입니다. Agent 설정의 로컬 최소 Guardrail 토글과는 별개이며 실제 정책 저장·강제 적용은 하지 않습니다.
      </Callout>
      <div className="mt-3 grid items-start gap-[0.875rem] xl:grid-cols-2">
        <article className={panel}>
          <PanelTitle title="CENTRAL_DEFAULT" sub="모든 실행 Profile에 연결되는 중앙 예시">
            <Badge tone="wait" dot={false}>로컬 상태</Badge>
          </PanelTitle>
          <div className="p-4">
            <label className={fieldLabel}>허용 작업 경로 예시
              <input aria-label="중앙 Guardrail 허용 작업 경로" className={`${control} font-mono`} value={allowedPath} onChange={(event) => setAllowedPath(event.target.value)} />
            </label>
            <p className="mt-3 text-[0.6875rem] leading-5 text-muted-2">Guardrail 적용 자체는 끌 수 없으며, Profile에서는 허용 범위 예시만 로컬로 검토합니다.</p>
          </div>
        </article>
        <article className={panel}>
          <PanelTitle title="잠금 보안 규칙" sub="UI에서도 비활성화할 수 없는 고정 항목" />
          <div className="p-4">
            {lockedGuardrails.map((rule) => <label key={rule.label} className="flex items-center gap-3 border-b border-row-line py-3">
              <input aria-label={`잠금 Guardrail ${rule.label}`} type="checkbox" checked disabled readOnly />
              <span className="min-w-0 flex-1"><b className="block text-[0.78125rem] font-semibold">{rule.label}</b><small className="mt-1 block text-[0.6875rem] text-muted-2">{rule.description}</small></span>
              <Badge tone="idle" dot={false}>잠금</Badge>
            </label>)}
          </div>
        </article>
      </div>
    </section>}
  </>
}

/* ------------------------------------------------------------------ 설정 */

const keys: { name: string; value: string; at: string; tone: Tone; state: string }[] = [
  { name: '관광지 공공데이터 API', value: 'TOUR-••••-9A2F', at: '2026.08.20', tone: 'ok', state: '사용 중' },
  { name: 'OpenAI Provider Key', value: 'SK-••••-31BC', at: '2026.08.14', tone: 'ok', state: '사용 중' },
  { name: 'GitHub PR Token', value: 'GH-••••-77AE', at: '2026.07.30', tone: 'idle', state: '미사용' },
]

const toggles = [
  { label: 'Agent 실행 결과 알림', desc: '실행 완료·실패 시 담당자에게 알림', on: true },
  { label: '승인 요청 알림', desc: '승인 대기 발생 시 즉시 알림', on: true },
  { label: 'RAG 품질 저하 경고', desc: 'Recall@5 85% 미만 시 경고', on: false },
  { label: '최고관리자 이관 알림', desc: '재작업 한도 초과 시 알림', on: true },
]

function Settings({ roleLabel }: { roleLabel: string }) {
  return <>
    <PageHead title="설정" description="조직 정보, 권한, API Key, 알림 정책을 관리합니다." />
    <MockNote>정적 데모 화면입니다. 저장 버튼은 아직 연결되지 않았습니다.</MockNote>

    <div aria-label="일반 설정 탭">
      <Tabs items={[{ label: '일반' }, { label: '권한' }, { label: 'API Key' }, { label: '알림' }]} active={0} />
    </div>

    <div className="grid items-start gap-[0.875rem] xl:grid-cols-2">
      <section className={panel}>
        <PanelTitle title="조직 정보" />
        <div className="p-4">
          <label className={fieldLabel}>고객사명
            <input className={control} defaultValue="한빛관광공사" />
          </label>
          <label className={`${fieldLabel} mt-[0.875rem]`}>서비스 도메인
            <input className={`${control} font-mono`} defaultValue="tour.hanbit.example" />
          </label>
          <label className={`${fieldLabel} mt-[0.875rem]`}>현재 로그인 역할
            <input className={control} value={roleLabel} readOnly />
          </label>
          <div className={`${fieldLabel} mt-[0.875rem]`}>운영 환경
            <span className="mt-[0.375rem] flex w-fit overflow-hidden rounded-[0.3125rem] border border-field-line">
              {['Mock', 'Staging', 'Production'].map((env, index) => <span
                key={env}
                className={`px-[0.875rem] py-[0.375rem] text-[0.71875rem] font-semibold ${index === 0 ? 'bg-primary text-white' : 'bg-white text-muted'}`}
              >{env}</span>)}
            </span>
          </div>
          <div className="mt-[1.125rem] flex justify-end gap-2">
            <button className={secondaryButton}>취소</button>
            <button className={primaryButton}>저장하기</button>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-[0.875rem]">
        <section className={panel}>
          <PanelTitle title="API Key"><button className={smallButton}>키 발급</button></PanelTitle>
          {keys.map((key) => <div key={key.name} className="flex items-center gap-3 border-b border-row-line px-4 py-[0.625rem] text-xs">
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[0.78125rem] font-semibold">{key.name}</b>
              <small className="block font-mono text-[0.6875rem] text-muted-3">{key.value}</small>
            </span>
            <span className="text-[0.71875rem] text-muted-2 max-[560px]:hidden">{key.at}</span>
            <Badge tone={key.tone} dot={false}>{key.state}</Badge>
          </div>)}
        </section>

        <section className={panel}>
          <PanelTitle title="권한 · 알림" />
          <div className="px-4 pb-4 pt-[0.375rem]">
            {toggles.map((toggle) => <div key={toggle.label} className="flex items-center gap-3 border-b border-row-line py-3">
              <span className="min-w-0 flex-1">
                <b className="block text-[0.78125rem] font-semibold">{toggle.label}</b>
                <small className="mt-[0.125rem] block text-[0.6875rem] text-muted-2">{toggle.desc}</small>
              </span>
              <span className={`flex h-[1.1875rem] w-[2.125rem] shrink-0 rounded-[0.625rem] p-[0.125rem] ${toggle.on ? 'justify-end bg-primary' : 'justify-start bg-btn-line'}`} aria-hidden="true">
                <span className="block h-[0.9375rem] w-[0.9375rem] rounded-full bg-white shadow-[0_1px_2px_#10203426]" />
              </span>
            </div>)}
          </div>
        </section>
      </div>
    </div>
  </>
}

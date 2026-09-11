import { useEffect, useState, type FormEvent } from 'react'
import { describeFailure } from '../../shared/api/error'
import { PageHead, PanelTitle, control, fieldLabel, panel, primaryButton, secondaryButton } from '../../shared/ui/primitives'
import { notifyCmsChanged, notifySiteUpdated, type CmsApi, type CmsCode, type CodeGroup, type CodeInput } from './api'

const emptyGroup: CodeGroup = { key: '', label: '', displayOrder: 0, enabled: true }
const emptyCode: CodeInput = { value: '', label: '', displayOrder: 0, enabled: true }

/** Two flat forms: group identity and code value stay stable; labels/order/enabled are editable. */
export default function CodeWorkspace({ api }: { api: CmsApi }) {
  const [groups, setGroups] = useState<CodeGroup[]>([])
  const [codes, setCodes] = useState<CmsCode[]>([])
  const [selected, setSelected] = useState<CodeGroup | null>(null)
  const [groupForm, setGroupForm] = useState<CodeGroup>(emptyGroup)
  const [selectedCode, setSelectedCode] = useState<CmsCode | null>(null)
  const [codeForm, setCodeForm] = useState<CodeInput>(emptyCode)
  const [failure, setFailure] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = async () => {
    const [nextGroups, nextCodes] = await Promise.all([api.codeGroups(), api.codes()])
    setGroups(nextGroups); setCodes(nextCodes)
  }
  useEffect(() => { void load().catch((error) => setFailure(describeFailure(error))) }, [api])
  const chooseGroup = (group: CodeGroup | null) => {
    setSelected(group); setGroupForm(group ?? emptyGroup)
    setSelectedCode(null); setCodeForm(emptyCode); setNotice(null); setFailure(null)
  }
  const chooseCode = (code: CmsCode | null) => { setSelectedCode(code); setCodeForm(code ? { value: code.value, label: code.label, displayOrder: code.displayOrder, enabled: code.enabled } : emptyCode); setNotice(null) }
  async function saveGroup(event: FormEvent) {
    event.preventDefault(); setBusy(true); setFailure(null); setNotice(null)
    try {
      const saved = selected ? await api.updateCodeGroup(selected.key, groupForm) : await api.createCodeGroup(groupForm)
      await load(); chooseGroup(saved); setNotice('코드 그룹을 저장했습니다.'); notifyCmsChanged(); notifySiteUpdated()
    } catch (error) { setFailure(describeFailure(error)) } finally { setBusy(false) }
  }
  async function saveCode(event: FormEvent) {
    event.preventDefault(); if (!selected) return
    setBusy(true); setFailure(null); setNotice(null)
    try {
      if (selectedCode) await api.updateCode(selectedCode.id, codeForm)
      else await api.createCode(selected.key, codeForm)
      await load(); chooseCode(null); setNotice('코드를 저장했습니다.'); notifyCmsChanged(); notifySiteUpdated()
    } catch (error) { setFailure(describeFailure(error)) } finally { setBusy(false) }
  }

  return <>
    <PageHead title="코드 관리" description="게시판에서 사용할 지역·분류 코드를 관리합니다. 키와 코드 값은 유지하고, 쓰지 않는 항목은 사용 중지합니다." wrapActions>
      <button className={primaryButton} type="button" disabled={busy} onClick={() => chooseGroup(null)}>새 코드 그룹</button>
    </PageHead>
    {failure && <p className="mb-4 rounded bg-fail-bg p-3 text-sm text-fail-fg" role="alert">{failure}</p>}
    {notice && <p className="mb-4 rounded bg-ok-bg p-3 text-sm text-ok-fg" role="status">{notice}</p>}
    <div className="grid items-start gap-4 xl:grid-cols-[15rem_1fr_1.4fr]">
      <section className={panel}>
        <PanelTitle title="코드 그룹" sub={`총 ${groups.length}개`} />
        {groups.map((group) => <button className={`flex w-full items-center justify-between gap-2 border-b border-line-soft p-4 text-left text-sm ${selected?.key === group.key ? 'bg-sub font-bold' : ''}`} key={group.key} type="button" disabled={busy} onClick={() => chooseGroup(group)}>
          <span>{group.label} <small className="mt-1 block font-mono text-xs text-muted">{group.key}</small></span>
          {!group.enabled && <span className="text-xs text-muted">중지</span>}
        </button>)}
        {groups.length === 0 && <p className="p-5 text-sm text-muted">등록된 코드 그룹이 없습니다.</p>}
      </section>
      <form className={panel} onSubmit={saveGroup}>
        <PanelTitle title={selected ? '코드 그룹 수정' : '코드 그룹 등록'} />
        <fieldset disabled={busy} className="grid min-w-0 gap-4 p-4">
          <label className={fieldLabel}>그룹 키<input className={control} value={groupForm.key} disabled={!!selected} pattern="[A-Za-z0-9_-]{1,40}" maxLength={40} placeholder="예: TRAVEL_REGION" required onChange={(e) => setGroupForm({ ...groupForm, key: e.target.value })} /></label>
          <label className={fieldLabel}>그룹명<input className={control} value={groupForm.label} maxLength={100} required onChange={(e) => setGroupForm({ ...groupForm, label: e.target.value })} /></label>
          <label className={fieldLabel}>그룹 표시 순서<input className={control} type="number" min={0} value={groupForm.displayOrder} required onChange={(e) => setGroupForm({ ...groupForm, displayOrder: Number(e.target.value) })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={groupForm.enabled} onChange={(e) => setGroupForm({ ...groupForm, enabled: e.target.checked })} />그룹 사용</label>
          <button className={primaryButton}>코드 그룹 저장</button>
        </fieldset>
      </form>
      <section className={panel}>
        <PanelTitle title={selected ? `${selected.label} 코드` : '코드'} sub="사용 중지해도 기존 게시글의 분류 이름은 유지됩니다.">
          <button className={secondaryButton} type="button" disabled={!selected || busy} onClick={() => chooseCode(null)}>새 코드</button>
        </PanelTitle>
        {selected ? <>
          <div className="max-h-72 overflow-auto">
            {codes.filter((code) => code.groupKey === selected.key).map((code) => <button key={code.id} type="button" disabled={busy} onClick={() => chooseCode(code)}
              className={`flex w-full justify-between gap-4 border-b border-line-soft px-4 py-3 text-left text-sm ${selectedCode?.id === code.id ? 'bg-sub font-bold' : ''}`}>
              <span>{code.label} <small className="font-mono text-xs text-muted">{code.value}</small></span><span className="text-xs text-muted">{code.enabled ? '사용' : '중지'} · {code.displayOrder}</span>
            </button>)}
          </div>
          <form onSubmit={saveCode}>
            <fieldset disabled={busy} className="grid min-w-0 gap-4 p-4">
              <h2 className="text-sm font-bold">{selectedCode ? '코드 수정' : '코드 등록'}</h2>
              <label className={fieldLabel}>코드 값<input className={control} value={codeForm.value} disabled={!!selectedCode} pattern="[A-Za-z0-9_-]{1,40}" maxLength={40} placeholder="예: SEOUL" required onChange={(e) => setCodeForm({ ...codeForm, value: e.target.value })} /></label>
              <label className={fieldLabel}>코드명<input className={control} value={codeForm.label} maxLength={100} required onChange={(e) => setCodeForm({ ...codeForm, label: e.target.value })} /></label>
              <label className={fieldLabel}>코드 표시 순서<input className={control} type="number" min={0} value={codeForm.displayOrder} required onChange={(e) => setCodeForm({ ...codeForm, displayOrder: Number(e.target.value) })} /></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={codeForm.enabled} onChange={(e) => setCodeForm({ ...codeForm, enabled: e.target.checked })} />코드 사용</label>
              <button className={primaryButton}>코드 저장</button>
            </fieldset>
          </form>
        </> : <p className="p-5 text-sm text-muted">왼쪽에서 코드 그룹을 선택해 주세요.</p>}
      </section>
    </div>
  </>
}

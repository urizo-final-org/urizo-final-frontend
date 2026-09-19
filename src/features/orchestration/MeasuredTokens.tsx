export default function MeasuredTokens({ value, known, calls }: { value: number | null; known?: number; calls?: number | null }) {
  return <span>{value == null ? '미수집' : value.toLocaleString('ko-KR')}
    {known !== undefined && calls != null && <small className="mt-1 block text-[0.625rem] text-muted-2">{known < calls ? '부분 합계 · ' : ''}{known}/{calls}회 수집</small>}
  </span>
}

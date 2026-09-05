/**
 * 받침 유무로 조사를 고른다. 한글 음절은 0xAC00부터 종성 28개 주기로 배열돼 있어 나머지가 0이면
 * 받침이 없다. 마지막 글자가 한글이 아니면(영문·숫자·기호) 판단 근거가 없어 받침 없는 쪽을 쓴다.
 *
 * <p>컴포넌트 파일에 두면 React Fast Refresh가 깨지므로 분리했다(homepage-url.ts와 같은 이유).
 */
export function withParticle(word: string, withFinal: string, withoutFinal: string) {
  const last = word.trim().slice(-1)
  if (!last) return withoutFinal
  const code = last.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return withoutFinal
  return (code - 0xac00) % 28 === 0 ? withoutFinal : withFinal
}

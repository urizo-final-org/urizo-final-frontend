import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { CardPhoto } from './portal-primitives'

test('an image card renders the real photo', () => {
  render(<CardPhoto name="도원" img="http://tong.visitkorea.or.kr/x.png" className="aspect-square" />)
  expect(screen.getByRole('img', { name: '도원' })).toBeInTheDocument()
  expect(screen.queryByText('사진 · 도원')).not.toBeInTheDocument()
})

/** 원천에 이미지가 없는 문서(코퍼스 500건 중 95건)는 지어내지 않고 기존 플레이스홀더로 남긴다. */
test('a card without a source image keeps the placeholder', () => {
  render(<CardPhoto name="반도식당" className="aspect-[4/3]" />)
  expect(screen.getByText('사진 · 반도식당')).toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

/** 공개 계약은 사진 없는 문서에 null을 싣는다 — undefined와 같게 다뤄야 한다. */
test('a null imageUrl from the contract keeps the placeholder', () => {
  render(<CardPhoto name="반도식당" img={null} className="aspect-[4/3]" />)
  expect(screen.getByText('사진 · 반도식당')).toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

/** 외부 CDN이 죽어도 깨진 이미지 아이콘이 아니라 플레이스홀더가 남아야 한다. */
test('a failed image load falls back to the placeholder', () => {
  render(<CardPhoto name="더존펜션" img="http://tong.visitkorea.or.kr/broken.jpg" />)
  fireEvent.error(screen.getByRole('img', { name: '더존펜션' }))
  expect(screen.getByText('사진 · 더존펜션')).toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

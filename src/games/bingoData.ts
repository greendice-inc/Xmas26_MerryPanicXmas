import type { Product } from '../santazon/products'
import type { BingoStep, OrderItem } from '../types'

/**
 * ステージ4：カタカナビンゴ。
 * アイテムのカード「名前×N」をめくると、名前のN文字目と同じマスに、両方のカードで穴が開く
 */

/** 山札のカード。名前と数（×N） */
export interface BingoItem {
  name: string
  n: number
}

/** 真ん中のマスを最初から開けておくか（資料の並びは9文字なので、いまは開けない） */
export const FREE_CENTER = false

export const itemLabel = (c: BingoItem) => `${c.name}×${c.n}`
/** そのカードで穴が開く文字（名前のN文字目） */
export const holeChar = (c: BingoItem) => Array.from(c.name)[c.n - 1] ?? ''

/** 3×3 の文字。上の段から3文字ずつ */
export type BingoCard = [string, string, string, string, string, string, string, string, string]
const card = (...rows: string[]): BingoCard => rows.flatMap((r) => Array.from(r)) as BingoCard

export interface BingoRound {
  /** 大人（プレイヤー）のカード */
  adult: BingoCard
  /** 子ども（ロビン）のカード */
  kid: BingoCard
  /** ロビンの山札 */
  kidDeck: BingoItem[]
  /** 大人の山札。チュートリアルはエルフが注文したもの、ラウンドは正しい注文 */
  adultDeck: BingoItem[]
  /** 正しい注文の商品名（前方一致）。チュートリアルは注文しない */
  order?: string[]
  /**
   * 注文のあとに出す問題と、宅配ソックスの番号。
   * request=true は、ナゾの画面では答えず、Santazon の取り出し依頼ボタンで番号（answer）を入れる
   */
  problem?: { image?: string; answer: string; code: string; request?: boolean }
}

/** チュートリアル。ロビンが先にビンゴする */
export const TUTORIAL: BingoRound = {
  adult: card('トシボ', 'ブリム', 'キゴク'),
  kid: card('リフイ', 'ヨコロ', 'チシブ'),
  // めくる順（チュートリアルはシャッフルしない）
  kidDeck: [
    { name: 'シュークリーム', n: 5 },
    { name: 'ブリキのロボット', n: 1 },
    { name: 'タイコ', n: 3 },
  ],
  adultDeck: [
    { name: 'ボート', n: 3 },
    { name: 'リンゴ', n: 2 },
    { name: 'スコップ', n: 1 },
  ],
}
/** 山札のそばに出す中身（チュートリアルは表示の順とめくる順が違う） */
export const TUTORIAL_KID_LIST: BingoItem[] = [
  { name: 'ブリキのロボット', n: 1 },
  { name: 'シュークリーム', n: 5 },
  { name: 'タイコ', n: 3 },
]

export const ROUNDS: Record<'r1' | 'r2', BingoRound> = {
  r1: {
    adult: card('グラカ', 'トマギ', 'アクウ'),
    kid: card('アトス', 'マギチ', 'ウグハ'),
    kidDeck: [
      { name: 'マクラ', n: 1 },
      { name: 'バット', n: 3 },
      { name: 'エノグ', n: 3 },
    ],
    adultDeck: [
      { name: 'グラス', n: 3 },
      { name: 'マッチ', n: 3 },
      { name: 'ハンカチ', n: 1 },
    ],
    order: ['グラス', 'マッチ', 'ハンカチ'],
    problem: { answer: '2828', code: '2828', request: true },
  },
  r2: {
    adult: card('ウナヘ', 'ギアラ', 'カルク'),
    kid: card('ナカラ', 'アウク', 'ヘユル'),
    kidDeck: [
      { name: 'ユビニンギョウ', n: 5 },
      { name: 'エクレア', n: 4 },
      { name: 'ウサギ', n: 1 },
    ],
    adultDeck: [
      { name: 'ヘビ', n: 1 },
      { name: 'ユビワ', n: 1 },
      { name: 'サッカーボール', n: 7 },
    ],
    order: ['ヘビ', 'ユビワ', 'サッカーボール'],
    problem: { answer: '3939', code: '3939', request: true },
  },
}

export const roundOf = (step: BingoStep | undefined): 'r1' | 'r2' | null => (step === 'r1' || step === 'r2' ? step : null)

/** サプライズアイテムの在庫。ロビンがラウンドごとに3つ注文している */
export const SURPRISE_NAME = 'サプライズアイテム'
export const SURPRISE_KID_ORDER = 3

/** 正しい注文か：3点が、決まった3つの商品（名前の前方一致）にちょうど1つずつ当たる */
export function isBingoCart(step: BingoStep | undefined, items: OrderItem[], products: Product[]): boolean {
  const r = roundOf(step)
  const want = r ? ROUNDS[r].order : undefined
  if (!want) return false
  const names = items.flatMap((i) => Array.from({ length: i.qty }, () => products.find((p) => p.id === i.id)?.name ?? ''))
  if (names.length !== want.length) return false
  const rest = [...names]
  for (const w of want) {
    const k = rest.findIndex((n) => n.replace(/\s/g, '').startsWith(w))
    if (k < 0) return false
    rest.splice(k, 1)
  }
  return true
}

/** めくった文字から、開いたマスの番号 */
export function openedCells(c: BingoCard, chars: string[]): Set<number> {
  const set = new Set<number>()
  c.forEach((ch, i) => {
    if (chars.includes(ch) || (FREE_CENTER && i === 4)) set.add(i)
  })
  return set
}

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]
/** そろった列のマス（なければ空） */
export function bingoCells(open: Set<number>): number[] {
  return LINES.filter((l) => l.every((i) => open.has(i))).flat()
}

/** 0..n-1 を混ぜた並び */
export function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

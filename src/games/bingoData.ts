import { SOCK_KEY_IMAGE, type Product } from '../santazon/products'
import type { BingoStep, OrderItem } from '../types'

/**
 * ステージ4：カタカナビンゴ。
 * アイテムのカード「名前N個」（単位は label）をめくると、名前のN文字目と同じマスに、両方のカードで穴が開く
 */

/** 山札のカード。名前と数（N個） */
export interface BingoItem {
  name: string
  n: number
  /** 吹き出しに出す言い方（「バット3本」など）。なければ「名前N個」 */
  label?: string
}

/** 真ん中のマスを最初から開けておくか（資料の並びは9文字なので、いまは開けない） */
export const FREE_CENTER = false

export const itemLabel = (c: BingoItem) => c.label ?? `${c.name}${c.n}個`
/** めくったカードの表記：[名前, 数と単位]。「バット3本」→ ['バット', '3本']。数が入っていない言い方（「まくら」など）は「1個」 */
export function itemParts(c: BingoItem): [string, string] {
  const label = itemLabel(c)
  const m = label.match(/^(.*?)(\d.*)$/)
  return m && m[1] ? [m[1], m[2]] : [label, `${c.n}個`]
}

const SHEET_DIR = `${import.meta.env.BASE_URL}BG/Stage4/bingo/`
/** ビンゴカードの画像（文字が乗った 450×450）。大人は青、ロビンは黄色 */
export const sheetImage = (file: string) => `${SHEET_DIR}${file}.webp`
/** 相手のカードを明かす前の「？」のカード */
export const HIDDEN_SHEET = { adult: sheetImage('sheet1_3'), kid: sheetImage('sheet3_2') }
export const DECK_BACK_IMAGE = sheetImage('card_1')
export const DECK_FACE_IMAGE = sheetImage('card_2')
export const HOLE_IMAGE = sheetImage('maru')
/** ビンゴの背景（上がロビンの山札の吹き出し、下が大人の山札の吹き出し） */
export const BINGO_BG_IMAGE = sheetImage('4th_back')
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
  /** カードの画像（文字は adult / kid と同じ並び） */
  sheets: { adult: string; kid: string }
  /** ロビンの山札 */
  kidDeck: BingoItem[]
  /** 大人の山札。チュートリアルはエルフが注文したもの、ラウンドは正しい注文 */
  adultDeck: BingoItem[]
  /** 正しい注文の商品名（前方一致）。チュートリアルは注文しない */
  order?: string[]
  /**
   * 注文のあとに出す問題。番号は、注文の中身から計算する（products.ts の sockKeyOf）。
   * request=true は、ナゾの画面では答えず、Santazon の取り出し依頼ボタンで番号を入れる
   */
  problem?: { image?: string; request?: boolean }
}

/** チュートリアル。ロビンが先にビンゴする */
export const TUTORIAL: BingoRound = {
  // 画像（sheet0_1）に合わせて、真ん中の段は「ブリス」
  adult: card('トシボ', 'ブリス', 'キゴク'),
  kid: card('リフイ', 'ヨコロ', 'チシブ'),
  sheets: { adult: sheetImage('sheet0_1'), kid: sheetImage('sheet0_2') },
  // めくる順（チュートリアルはシャッフルしない）
  kidDeck: [
    { name: 'シュークリーム', n: 5 },
    { name: 'ブリキのロボット', n: 1, label: 'ブリキのロボット1体' },
    { name: 'タイコ', n: 3, label: 'たいこ3個' },
  ],
  adultDeck: [
    { name: 'ボート', n: 3 },
    { name: 'リンゴ', n: 2 },
    { name: 'スコップ', n: 1 },
  ],
}
/** 山札のそばに出す中身（チュートリアルは表示の順とめくる順が違う） */
export const TUTORIAL_KID_LIST: BingoItem[] = [
  { name: 'ブリキのロボット', n: 1, label: 'ブリキのロボット1体' },
  { name: 'シュークリーム', n: 5 },
  { name: 'タイコ', n: 3, label: 'たいこ3個' },
]

export const ROUNDS: Record<'r1' | 'r2', BingoRound> = {
  r1: {
    adult: card('グラカ', 'トマギ', 'アクウ'),
    kid: card('アトス', 'マギチ', 'ウグハ'),
    sheets: { adult: sheetImage('sheet1_1'), kid: sheetImage('sheet1_2') },
    // 言い方は noz_1.webp の吹き出しに合わせる
    kidDeck: [
      { name: 'マクラ', n: 1, label: 'まくら' },
      { name: 'バット', n: 3, label: 'バット3本' },
      { name: 'エノグ', n: 3, label: 'えのぐ3本' },
    ],
    adultDeck: [
      { name: 'グラス', n: 3 },
      { name: 'マッチ', n: 3, label: 'マッチ3箱' },
      { name: 'ハンカチ', n: 1, label: 'ハンカチ1枚' },
    ],
    order: ['グラス', 'マッチ', 'ハンカチ'],
    // C：ビンゴ ラウンド1のカードの注文
    problem: { request: true, image: SOCK_KEY_IMAGE('c') },
  },
  r2: {
    adult: card('ウナヘ', 'ギアラ', 'カルク'),
    kid: card('ナカラ', 'アウク', 'ヘユル'),
    sheets: { adult: sheetImage('sheet1_2_1'), kid: sheetImage('sheet2_2') },
    // 言い方は noz_2.webp の吹き出しに合わせる
    kidDeck: [
      { name: 'ユビニンギョウ', n: 5, label: '指人形5個' },
      { name: 'エクレア', n: 4, label: 'エクレア4個' },
      { name: 'ウサギ', n: 1, label: 'ウサギのぬいぐるみ' },
    ],
    adultDeck: [
      { name: 'ヘビ', n: 1, label: 'ヘビ1匹' },
      { name: 'ユビワ', n: 1 },
      { name: 'サッカーボール', n: 7 },
    ],
    order: ['ヘビ', 'ゆびわ', 'サッカーボール'],
    // D：ビンゴ ラウンド2のカードの注文
    problem: { request: true, image: SOCK_KEY_IMAGE('d') },
  },
}

export const roundOf = (step: BingoStep | undefined): 'r1' | 'r2' | null => (step === 'r1' || step === 'r2' ? step : null)

/**
 * サプライズアイテムの在庫。7個から始まり、子どもたちの発送で減っていく
 * ビンゴ ラウンド1でロビンが3個 → 4、ラウンド2で3個 → 1、ファイナルゲームの開始時にルドリーが1個 → 0
 */
export const SURPRISE_NAME = 'サプライズアイテム'
/** ステージ・ビンゴの進み具合から、子どもたちがここまでに発送したサプライズアイテムの数 */
export function surpriseShipped(stage: number, lastStage: number, step: BingoStep | undefined): number {
  if (stage >= lastStage) return 7
  if (stage < 4) return 0
  return step === 'r1' ? 3 : step === 'r2' || step === 'done' ? 6 : 0
}

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

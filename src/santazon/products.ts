/** 商品の初期データ。登録サイトで Firestore に入ったあとは、ゲームはそちらを表示する */

export type CategoryKey = 'game1' | 'game2' | 'game3' | 'game4' | 'game5' | 'final'

export const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: 'game1', label: '第1ゲーム用アイテム' },
  { key: 'game2', label: '第2ゲーム用アイテム' },
  { key: 'game3', label: '第3ゲーム用アイテム' },
  { key: 'game4', label: '第4ゲーム用アイテム' },
  { key: 'game5', label: '第5ゲーム用アイテム' },
  { key: 'final', label: 'ファイナルゲーム用アイテム' },
]

export interface Product {
  id: string
  category: CategoryKey
  name: string
  /** 商品画像。未設定なら画像なし */
  image?: string
  /** 在庫の分母。表示は「分子/分母」 */
  stock: number
  /** 在庫の分子。今ある数。注文するとここから減る */
  available: number
  /** リスト追加検索で入力する4桁のコード */
  code: string
  /** false = リストには載らない（リスト追加検索でだけ見つかる） */
  listed: boolean
  /** リスト追加検索で見られる説明。空なら「準備中」と表示 */
  description: string
  /** false = Santazon のリストに詳細ボタンを出さない */
  hasDetail: boolean
  /** 登録サイトだけのメモ。プレイヤーには出さない */
  note?: string
}

const p = (
  category: CategoryKey,
  n: number,
  name: string,
  code: string,
  stock: number,
  listed: boolean,
  description = '',
  note = '',
): Product => ({ id: `${category}-${n}`, category, name, code, stock, available: stock, listed, description, hasDetail: true, note })

/** 「1564」→「1-5-6-4」 */
export const formatCode = (code: string) => code.split('').join('-')

export const PRODUCTS: Product[] = [
  p('game1', 6, 'ゆびわ', '0495', 1, true, '', '4-3で発送'),
  p('game1', 2, 'タンバリン', '3139', 1, true, '', '1で発送'),
  p('game1', 3, 'わなげ用リング', '1864', 0, true),
  p('game1', 4, 'クリスマスリース', '3039', 5, true),
  p('game1', 5, 'フラフープ', '2867', 1, true, '', '1で発送'),
  p('game1', 7, 'ドーナツ3個', '1891', 1, true),
  p('game2', 1, 'マネキン', '2581', 0, false),
  p('game2', 2, 'セーター', '0007', 0, false),
  p('game2', 3, 'オーバーオール', '1678', 0, false),
  p('game3', 1, 'ペンギンのぬいぐるみ', '1281', 1, true, '', '3で発送'),
  p('game3', 2, 'ヘビのぬいぐるみ', '2005', 1, true, '', '4-3で発送'),
  p('game3', 3, 'ガチョウのぬいぐるみ', '2608', 1, true, '', '3で発送'),
  p('game3', 4, 'クジラのぬいぐるみ', '0995', 3, true),
  p('game4', 8, 'グラス3個', '1321', 1, true, '', '4-2で発送'),
  p('game4', 10, 'ハンカチ', '0005', 1, true, '', '4-2で発送'),
  p('game4', 9, 'マッチ3本', '1401', 1, true, '', '4-2で発送'),
  p('game4', 11, 'マグカップ3個', '1876', 4, true),
  p('game4', 12, 'ライオンのぬいぐるみ', '3191', 1, true),
  p('game4', 6, 'サッカーボール7個', '2500', 6, false, '直径22cmのボール', '4-3で発送/ファイナル1'),
  p('final', 1, 'レッドボール2個', '0600', 0, true, '直径10cmのボール', 'ファイナル2'),
  p('final', 4, 'グリーンボール2個', '2000', 3, true, '直径10cmのボール', 'ファイナル3'),
  p('final', 6, 'エントツ', '0025', 1, false, '内寸20cm四方の筒', 'ファイナル3'),
  p('final', 7, '金庫', '0010', 5, false, '', 'ファイナル4'),
  p('final', 8, 'スーパーボール', '1215', 1, false, '', 'ファイナル4'),
  p('final', 9, 'サプライズアイテム', '', 1, true),
  // ステージ4で子ども（ロビン）が発送するもの
  p('game4', 13, 'まくら', '0009', 1, true, '', '4-2で子どもが発送'),
  p('game4', 14, 'バット3本', '2428', 1, true, '', '4-2で子どもが発送'),
  p('game4', 15, 'えのぐ3本', '2501', 1, true, '', '4-2で子どもが発送'),
  p('game4', 16, '指人形5個', '1909', 1, true, '', '4-3で子どもが発送'),
  p('game4', 17, 'エクレア4個', '0008', 1, true, '', '4-3で子どもが発送'),
  p('game4', 18, 'ウサギのぬいぐるみ', '1663', 1, true, '', '4-3で子どもが発送'),
]

export const productById = (id: string): Product | undefined => PRODUCTS.find((x) => x.id === id)
/** 同じコードの商品が複数ある場合は、すべて返す */
export const productsByCode = (code: string): Product[] => PRODUCTS.filter((x) => x.code === code)

/** 注文後に出す問題。カテゴリ（注文の先頭の商品）ごとに1問。答えは書かず、注文の中身から計算する（sockKeyOf） */
export interface Problem {
  /** 問題画像（public 配下のパス）。未設定ならプレースホルダー */
  image?: string
}

/** ソックスキーのナゾの画像（public/BG/socksKey/key_a〜f.webp） */
export const SOCK_KEY_IMAGE = (k: 'a' | 'b' | 'c' | 'd' | 'e' | 'f') => `${import.meta.env.BASE_URL}BG/socksKey/key_${k}.webp`

export const PROBLEMS: Record<CategoryKey, Problem> = {
  // A：わなげ（タンバリン・フラフープの注文）
  game1: { image: SOCK_KEY_IMAGE('a') },
  game2: {},
  // B：ツイスター（ペンギン・ガチョウのぬいぐるみの注文）
  game3: { image: SOCK_KEY_IMAGE('b') },
  game4: {},
  game5: {},
  final: {},
}

/**
 * ソックスキーの番号（宅配ソックスの番号。ナゾの答えも、取り出し依頼で入れる番号も、これ）。
 * 注文した商品の4桁のアイテム番号を、桁ごとに足す。桁があふれたら一の位だけ使う。
 * 例：a-b-c-d と e-f-g-h を注文 → (a+e)(b+f)(c+g)(d+h)
 */
export function sockKeyOf(codes: string[]): string {
  return [0, 1, 2, 3].map((i) => codes.reduce((sum, c) => sum + (Number(c[i]) || 0), 0) % 10).join('')
}

/** 注文（カート）の中身から、ソックスキーの番号を出す。商品は、いまのアイテム番号（Firestore の値）を使う */
export function sockKeyOfItems(items: { id: string; qty: number }[], products: Product[]): string {
  const codes = items.flatMap((i) => Array.from({ length: i.qty }, () => products.find((p) => p.id === i.id)?.code ?? ''))
  return sockKeyOf(codes)
}

export const MAX_CART = 3

/** ステージ1で、勝負に負けるために注文する2つ（タンバリン・フラフープ） */
const GAME1_LOSE_IDS = ['game1-2', 'game1-5']

export function isGame1LoseCart(items: { id: string; qty: number }[]): boolean {
  const ids = items.flatMap((i) => Array.from({ length: i.qty }, () => i.id)).sort()
  return ids.join(',') === [...GAME1_LOSE_IDS].sort().join(',')
}

/** ステージ1を終えたあとに、すでに注文済みになっている数 */
export function game1OrderedQty(): { id: string; qty: number }[] {
  return GAME1_LOSE_IDS.map((id) => ({ id, qty: 1 }))
}

/** ステージ3で、椅子を使わずにお題をクリアするために注文する2つ（ペンギン・ダチョウ） */
const STAGE3_IDS = ['game3-1', 'game3-3']

export function isStage3Cart(items: { id: string; qty: number }[]): boolean {
  const ids = items.flatMap((i) => Array.from({ length: i.qty }, () => i.id)).sort()
  return ids.join(',') === [...STAGE3_IDS].sort().join(',')
}

/** ステージ3を終えたあとに、すでに注文済みになっている数 */
export function stage3OrderedQty(): { id: string; qty: number }[] {
  return STAGE3_IDS.map((id) => ({ id, qty: 1 }))
}

/** そのステージの正しい注文か。ステージ3以外は、ステージ1の2つ */
export function isCorrectCart(stage: number, items: { id: string; qty: number }[]): boolean {
  return stage === 3 ? isStage3Cart(items) : isGame1LoseCart(items)
}

/** 正しい注文が届いて正解したら、エルフが番号を出し、待ってから次のステージへ進むステージ（5は LAST） */
export const ORDER_STAGES = [1, 3, 5]

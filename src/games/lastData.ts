import { SOCK_KEY_IMAGE, type Product } from '../santazon/products'
import type { LastStep, OrderItem } from '../types'

/**
 * LAST（ファイナルゲーム「エントツギフト」）。
 * basket=バスケットボールを注文しようとするが、宅配ソックスが埋まっている
 * extract=取り出し依頼（1225）が通って、エルフが話している
 * balls=エントツとグリーンボールを注文する（届いたら30秒で次へ）
 * notice=警告マークの通知が来ている（押すとマスターエルフの会話）
 * super=ルドリーのためにスーパーボールと金庫を注文する（届いたらタップで最後へ）
 */
export const LAST_STEPS: LastStep[] = ['basket', 'extract', 'balls', 'notice', 'super']

/** 取り出し依頼で入れる番号（ルドリーの宅配ソックス）。スーパーボール 1200 ＋ 金庫 0025 の桁ごとの合計 */
export const LAST_REQUEST_CODE = '1225'
/** 大人チームが入れたボールの得点 */
export const LAST_ADULT_POINTS = 260
/** ルドリーの得点がここまで来たら、勝ち（クリアの演出）。このあとも数え続ける */
export const LAST_KID_POINTS = 270
/** ルドリーの得点が最後に止まるところ（本来の想定では5万ポイントくらいまで貯まる） */
export const LAST_KID_MAX = 50000

/** 注文のあとに出す問題の画像など（答えは、注文の中身から計算する：products.ts の sockKeyOf） */
export const LAST_PROBLEMS: Partial<Record<LastStep, { image?: string }>> = {
  // F：エントツ（エントツとグリーンボール2つの注文）
  balls: { image: SOCK_KEY_IMAGE('f') },
  super: {},
}

/** カートの商品名（数のぶんだけ並べる） */
function names(items: OrderItem[], products: Product[]): string[] {
  return items.flatMap((i) => Array.from({ length: i.qty }, () => (products.find((p) => p.id === i.id)?.name ?? '').replace(/\s/g, '')))
}
const has = (list: string[], prefix: string) => list.filter((n) => n.startsWith(prefix)).length

/** 大きすぎるボール（サッカーボール7個セット。商品名がバスケットボールのままでも同じ扱い） */
const BIG_BALLS = ['サッカーボール', 'バスケットボール']
const bigBalls = (n: string[]) => BIG_BALLS.reduce((a, b) => a + has(n, b), 0)
/** サッカーボール7個セットを3セット */
export const isBasketCart = (items: OrderItem[], products: Product[]) => {
  const n = names(items, products)
  return n.length === 3 && bigBalls(n) === 3
}
export const hasBasket = (items: OrderItem[], products: Product[]) => bigBalls(names(items, products)) > 0

/** エントツ1つと、グリーンボール2個を2つ */
export const isBallsCart = (items: OrderItem[], products: Product[]) => {
  const n = names(items, products)
  return n.length === 3 && has(n, 'エントツ') === 1 && has(n, 'グリーンボール') === 2
}

/** スーパーボールと金庫を1つずつ */
export const isSuperCart = (items: OrderItem[], products: Product[]) => {
  const n = names(items, products)
  return n.length === 2 && has(n, 'スーパーボール') === 1 && has(n, '金庫') === 1
}
/** 金庫に、スーパーボール以外のものを足した注文（変なモノが入っている） */
export const isSafeWithOther = (items: OrderItem[], products: Product[]) => {
  const n = names(items, products)
  return has(n, '金庫') > 0 && has(n, 'スーパーボール') === 0 && n.length > has(n, '金庫')
}
/** スーパーボールと金庫の、片方だけ */
export const isHalfSuperCart = (items: OrderItem[], products: Product[]) => {
  const n = names(items, products)
  return (has(n, 'スーパーボール') > 0) !== (has(n, '金庫') > 0)
}

/** その時点の正しい注文か（basket は宅配ソックスが埋まっているので、正しくても発送しない） */
export function isLastCart(step: LastStep | undefined, items: OrderItem[], products: Product[]): boolean {
  if (step === 'balls') return isBallsCart(items, products)
  if (step === 'super') return isSuperCart(items, products)
  return false
}

/**
 * 注文確定の前に止めるときのメッセージ（center=画面の真ん中 / elf=エルフの一言 / scene=エルフの会話（セリフ編集の場面））。
 * basket=宅配ソックスが埋まっていた。会話のあと、取り出し依頼ボタンが使える / again=空になったあと、また大きいボールを選んだ
 */
export interface LastGate {
  center?: string
  elf?: string
  scene?: 'basket' | 'again' | 'final' | 'wrong'
}
export function lastOrderGate(step: LastStep | undefined, items: OrderItem[], products: Product[]): LastGate | null {
  if (step === 'basket' && isBasketCart(items, products))
    return { center: '宅配ソックスがいっぱいだったため、\n発送ができませんでした。空にしてください。', scene: 'basket' }
  if (step === 'balls' && hasBasket(items, products)) return { scene: 'again' }
  if (step === 'super' && isSafeWithOther(items, products)) return { scene: 'wrong' }
  if (step === 'super' && isHalfSuperCart(items, products)) return { elf: 'それだけで大丈夫ですか？\n何か足りないような…。' }
  return null
}

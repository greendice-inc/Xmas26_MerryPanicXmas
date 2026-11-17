import type { Product } from '../santazon/products'
import type { LastStep, OrderItem } from '../types'

/**
 * LAST（ファイナルゲーム「エントツギフト」）。
 * basket=バスケットボールを注文しようとするが、宅配ソックスが埋まっている
 * extract=取り出し依頼（1225）が通って、エルフが話している
 * balls=エントツとボールを注文する（届いたら30秒で次へ）
 * notice=【重要】の通知が来ている（押すとマスターエルフの会話）
 * super=ルドリーのためにスーパーボールと金庫を注文する（届いたらタップで最後へ）
 */
export const LAST_STEPS: LastStep[] = ['basket', 'extract', 'balls', 'notice', 'super']

/** 取り出し依頼で入れる番号（ルドリーの宅配ソックス） */
export const LAST_REQUEST_CODE = '1225'
/** 大人チームが入れたボールの得点（仮。決まったら書き換える） */
export const LAST_ADULT_POINTS = 210
/** ルドリーの最後の得点 */
export const LAST_KID_POINTS = 250

/** 注文のあとに出す問題（答えは仮）と、宅配ソックスの番号 */
export const LAST_PROBLEMS: Partial<Record<LastStep, { image?: string; answer: string; code: string }>> = {
  balls: { answer: '1234', code: '1234' },
  super: { answer: '1234', code: '1234' },
}

/** カートの商品名（数のぶんだけ並べる） */
function names(items: OrderItem[], products: Product[]): string[] {
  return items.flatMap((i) => Array.from({ length: i.qty }, () => (products.find((p) => p.id === i.id)?.name ?? '').replace(/\s/g, '')))
}
const has = (list: string[], prefix: string) => list.filter((n) => n.startsWith(prefix)).length

/** バスケットボール7個セットを3セット */
export const isBasketCart = (items: OrderItem[], products: Product[]) => {
  const n = names(items, products)
  return n.length === 3 && has(n, 'バスケットボール') === 3
}
export const hasBasket = (items: OrderItem[], products: Product[]) => has(names(items, products), 'バスケットボール') > 0

const BALLS = ['イエローボール', 'グリーンボール', 'パープルボール']
/** エントツと、イエロー・グリーン・パープルのうち違う2つ（順不同） */
export const isBallsCart = (items: OrderItem[], products: Product[]) => {
  const n = names(items, products)
  if (n.length !== 3 || has(n, 'エントツ') !== 1) return false
  const balls = BALLS.map((b) => has(n, b))
  return balls.every((c) => c <= 1) && balls.reduce((a, b) => a + b, 0) === 2
}

/** スーパーボールと金庫を1つずつ */
export const isSuperCart = (items: OrderItem[], products: Product[]) => {
  const n = names(items, products)
  return n.length === 2 && has(n, 'スーパーボール') === 1 && has(n, '金庫') === 1
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

/** 注文確定の前に止めるときのメッセージ（center=画面の真ん中 / elf=エルフ） */
export function lastOrderGate(step: LastStep | undefined, items: OrderItem[], products: Product[]): { center?: string; elf?: string } | null {
  if (step === 'basket' && isBasketCart(items, products))
    return { center: '宅配ソックスが埋まっていて、発送できませんでした。', elf: '宅配ソックスの中が埋まっていると発送はできません。' }
  if (step === 'balls' && hasBasket(items, products)) return { elf: 'バスケットボールは・・・もしかすると何か見落としているかもしれません。' }
  if (step === 'super' && isHalfSuperCart(items, products)) return { elf: 'それだけで大丈夫ですか？\n何か足りないような…。' }
  return null
}

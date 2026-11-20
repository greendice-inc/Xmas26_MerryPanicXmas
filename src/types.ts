
export type Role = 'master' | 'staff' | 'player' | 'keybox'

export interface Identity {
  role: Role
  /** player: チーム番号 1-12 / keybox: 1-2 / それ以外: 0 */
  id: number
}

export function presenceKey(i: Identity): string {
  return i.role === 'player' || i.role === 'keybox' ? `${i.role}-${i.id}` : i.role
}

export interface PresenceDoc {
  lastSeen: number
  /** 書いた端末の目印（deviceId）。同じ端末なら、起動中でも選び直せる */
  device?: string
  /** スタッフが「キック」した時刻。値が変わったら、その役割を開いている端末はトップ画面に戻る */
  kickAt?: number
  /** この端末が、lastSeen の値が変わったのを見た時刻（保存はしない。時計のずれを避けるため） */
  seenAt?: number
}

/** novel=会話 / game=ゲーム / clear=クリア後のお礼 / end=エンディング */
export type Phase = 'novel' | 'game' | 'clear' | 'end'

/** シーンジャンプの行き先。step は同じステージの中での位置 */
export interface JumpTarget {
  stage: number
  phase: Phase
  /**
   * quiz=マークと得点当て / order=正しい注文 / start=ゲームのはじめ / amy・jimmy・tommy=その子を見つけたあと
   * ステージ3は WordStep（rule=ルール説明 / g1・g2=押さえてワード / room=部屋のお題と注文）
   */
  step?: 'quiz' | 'order' | 'start' | 'amy' | 'jimmy' | 'tommy' | WordStep | BingoStep | LastStep
}

export interface OrderItem {
  id: string
  qty: number
}

/** ordered=届くまでの待ち / delivered=問題を解いている最中 / solved=正解 / wrong=注文の中身を考え直す */
export type OrderStatus = 'ordered' | 'delivered' | 'solved' | 'wrong'

export interface Order {
  items: OrderItem[]
  status: OrderStatus
  at: number
  /** 正解のあと、次に進む画面へ切り替えてよい時刻 */
  proceedAt?: number
  /** ステイ中。カウントは進むが、次へ進む画面には自動で切り替わらない */
  stayed?: boolean
}

export interface TeamDoc {
  started: boolean
  room: number | null
  /** 1..GAME_COUNT */
  stage: number
  phase: Phase
  /** true = メインビジュアルのフタをかけている */
  locked: boolean
  /** マスターが全端末をリセットした時刻（変化したらプレイヤーは最初の画面へ戻る） */
  resetAt?: number
  /** シーンジャンプした時刻（変化したらプレイヤーは画面に入る） */
  enterAt?: number
  /** ステージ1：答えが合ったマークと得点（記録の「マークのルール」に出す） */
  markScores?: Record<string, number>
  /** Santazon の注文（なければ null） */
  order: Order | null
  /** これまでに注文した数（在庫の計算用） */
  orderedQty: OrderItem[]
  /** リスト追加検索で調べた商品の id */
  searched: string[]
  /** ステージ1のクリア会話が終わり、子供部屋を見ている */
  markCleared: boolean
  /** ステージ1：マークと得点がすべて分かった（このあと、マークの画面のまま続きの説明） */
  markSolved?: boolean
  /** ステージ1：ソックスキーの説明を聞いた */
  sockTold?: boolean
  /** Santazon の「リスト追加検索」タブを出してよいか（ステージ2の案内で解放） */
  searchUnlocked?: boolean
  /** 「記録」から見返せる画像の id（RECORDS のキー） */
  records?: string[]
  /** ステージ2（かくれんぼ）の進み具合 */
  hide?: HideProgress
  /** ステージ3（押さえてワード）の進み具合 */
  word?: WordProgress
  /** ステージ4（ビンゴ）の進み具合 */
  bingo?: BingoProgress
  /** LAST（ファイナルゲーム）の進み具合 */
  last?: LastProgress
  updatedAt: number
}

/** ステージ2：tutorial=エルフの案内中 / 0〜3=見つけた人数（3で全員） */
export interface HideProgress {
  tutorialDone: boolean
  found: number
}

/** ステージ3：rule=エルフのルール説明 / g1・g2=押さえてワード / room=部屋のお題（注文できる） */
export type WordStep = 'rule' | 'g1' | 'g2' | 'room'

export interface WordProgress {
  step: WordStep
  /** 正しい注文をして、椅子が禁止になった話を聞いた */
  chairTold: boolean
}

export const DEFAULT_WORD: WordProgress = { step: 'rule', chairTold: false }

/** ステージ4：rule=チュートリアル / r1・r2=ラウンド / done=終わった */
export type BingoStep = 'rule' | 'r1' | 'r2' | 'done'

export interface BingoProgress {
  step: BingoStep
  /** キモチ（ハート）とジャック機能を使える */
  jack: boolean
  /** 宅配ソックスの番号を聞いて、注文したカードが山札に入った */
  deckIn: boolean
  /** ゲーム開始を押した */
  started: boolean
  /** めくった枚数（ロビン・大人の順に交互） */
  flips: number
  /** 山札をめくる順（カードの番号） */
  kidOrder: number[]
  adultOrder: number[]
  /** 取り出し依頼の説明を聞いた注文（Order.at）。注文し直したら、また説明する */
  orderTold?: number
}

/** LAST：games/lastData.ts の LAST_STEPS を参照 */
export type LastStep = 'basket' | 'extract' | 'balls' | 'notice' | 'super'

export interface LastProgress {
  step: LastStep
  /** 「宅配ソックスが埋まっていた」の会話を聞いた（このあと「エルフに取り出し依頼」ボタンが使える） */
  basketTold?: boolean
}

export const DEFAULT_LAST: LastProgress = { step: 'basket' }

export const DEFAULT_BINGO: BingoProgress = { step: 'rule', jack: false, deckIn: false, started: false, flips: 0, kidOrder: [], adultOrder: [] }

export const DEFAULT_TEAM: TeamDoc = {
  started: false,
  room: null,
  stage: 1,
  phase: 'novel',
  locked: true,
  order: null,
  orderedQty: [],
  searched: [],
  markCleared: false,
  searchUnlocked: false,
  records: [],
  hide: { tutorialDone: false, found: 0 },
  word: DEFAULT_WORD,
  bingo: DEFAULT_BINGO,
  last: DEFAULT_LAST,
  updatedAt: 0,
}

/** スタッフ画面用の進捗表記: 1-N, 1-G, ... LAST */
export function progressLabel(t: TeamDoc): string {
  if (!t.started) return '未開始'
  if (t.phase === 'end') return 'LAST'
  return `${t.stage}-${t.phase === 'novel' ? 'N' : t.phase === 'game' ? 'G' : 'C'}`
}

import { useEffect, useState } from 'react'
import GameTalk from '../components/GameTalk'
import { characterImage } from '../scenario'
import { useGameLines } from '../script/scriptData'

/**
 * ステージ1の案内。ゲーム画面の上でエルフとリンが話し、
 * 決まった台詞では、ボタンなどの周りを暗くして、そこだけ明るく見せる（スポットライト）。
 * セリフは script/gameScenes.ts（セリフ編集で書き換えられる）。ここでは行ごとの演出だけ決める
 */

interface Rect {
  x: number
  y: number
  w: number
  h: number
}
/** スポットライトを当てる場所（1920×1200 の画面の座標） */
export const SPOTS = {
  /** 左下の「santazon」ボタン（GameMenu：580×120、画面の下端につける） */
  menuOrder: { x: 40, y: 1080, w: 580, h: 120 },
  /** Santazon のアイテムリスト */
  szList: { x: 40, y: 290, w: 1250, h: 870 },
  /** Santazon の「注文する」ボタン */
  szOrder: { x: 1370, y: 660, w: 521, h: 261 },
  /** ゲーム画面の「ソックスキーを導く」ボタン（styles.css の .sock-key-btn と合わせる） */
  sock: { x: 1670, y: 834, w: 210, h: 156 },
} satisfies Record<string, Rect>

/** 矢印で指す場所（矢印の先の点。1920×1200 の画面の座標）。矢印は上から下を指す */
export const ARROWS = {
  /** Santazon のアイテムリスト1行目の「カートに追加」ボタン（styles.css の .sz-list と .sz-item-btn.is-cart：x=1008〜1118、y=300〜391） */
  szCart: { x: 1063, y: 296 },
} satisfies Record<string, { x: number; y: number }>

/** 行ごとの演出 */
export interface GuideFx {
  /** 照らす場所 */
  spot?: keyof typeof SPOTS
  /** 矢印で指す場所 */
  arrow?: keyof typeof ARROWS
  /** タップで進めず、プレイヤーの操作を待つ（shop=Santazon を開く / sock=ソックスキーを導くを押す） */
  wait?: 'shop' | 'sock'
  /** リンがリングを投げたカットイン（仮） */
  cutin?: boolean
}

/** マークがすべて分かったあと（st1-rules）の、行ごとの演出 */
export const RULES_FX: Record<number, GuideFx> = {
  9: { spot: 'menuOrder', wait: 'shop' },
  // 「アイテムリストから必要なアイテムを選び、カートに入れる。」：リストを照らして、カートのマークを矢印で指す
  10: { spot: 'szList', arrow: 'szCart' },
  11: { spot: 'szOrder' },
  13: { cutin: true },
}
/** 正しい注文が届いたあと（st1-sock）の、行ごとの演出 */
export const SOCK_FX: Record<number, GuideFx> = {
  6: { spot: 'sock', wait: 'sock' },
}

/** 周りを暗くして、rect だけ明るく見せる。pass=true のときは、明るいところだけ触れる */
export function Spotlight({ rect, pass }: { rect: Rect; pass: boolean }) {
  const { x, y, w, h } = rect
  const block = pass ? undefined : { pointerEvents: 'none' as const }
  return (
    <>
      <div className="spot-dim" style={{ left: 0, top: 0, width: '100%', height: y, ...block }} />
      <div className="spot-dim" style={{ left: 0, top: y + h, width: '100%', bottom: 0, ...block }} />
      <div className="spot-dim" style={{ left: 0, top: y, width: x, height: h, ...block }} />
      <div className="spot-dim" style={{ left: x + w, top: y, right: 0, height: h, ...block }} />
      <div className="spot-ring" style={{ left: x - 8, top: y - 8, width: w + 16, height: h + 16 }} />
    </>
  )
}

/** 上から下を指す矢印（先が x, y）。上下にゆれる */
export function GuideArrow({ x, y }: { x: number; y: number }) {
  return (
    <svg className="guide-arrow" viewBox="0 0 120 150" style={{ left: x - 60, top: y - 150 }} aria-hidden>
      <path d="M38 6h44v70h32L60 144 6 76h32z" fill="#ffd400" stroke="#2a2a30" strokeWidth="8" strokeLinejoin="round" />
    </svg>
  )
}

/** idx より前で最後に待った操作（その画面を開いたまま、続きの台詞を話す） */
function heldWait(fx: Record<number, GuideFx>, idx: number): GuideFx['wait'] | null {
  let held: GuideFx['wait'] | null = null
  for (let i = 0; i < idx; i++) if (fx[i]?.wait) held = fx[i].wait
  return held
}

/**
 * 台詞を順に出す。wait の台詞では、shopOpen / sockOpen が true になったら次へ進む。
 * onWait は、いま待っているもの（親がボタンを押せるようにする）。
 * onReopen は、待って開いた画面が閉じてしまったとき（再読み込みで画面が作り直されたなど）に開き直す
 */
export function GuideTalk({
  sceneId,
  fx,
  shopOpen,
  sockOpen,
  onWait,
  onReopen,
  onDone,
}: {
  sceneId: string
  fx: Record<number, GuideFx>
  shopOpen: boolean
  sockOpen: boolean
  onWait: (w: GuideFx['wait'] | null) => void
  onReopen: (w: NonNullable<GuideFx['wait']>) => void
  onDone: () => void
}) {
  const lines = useGameLines(sceneId)
  const [idx, setIdx] = useState(0)
  const line = lines[idx]
  const f = fx[idx] ?? {}
  const wait = line ? (f.wait ?? null) : null

  useEffect(() => {
    onWait(wait)
    return () => onWait(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wait])

  // 待っていた操作が済んだら次へ
  useEffect(() => {
    if ((wait === 'shop' && shopOpen) || (wait === 'sock' && sockOpen)) setIdx((i) => i + 1)
  }, [wait, shopOpen, sockOpen])

  // 開いた画面の上で話している台詞なのに、その画面が閉じている：ハイライトだけ残らないよう、開き直す
  const held = line ? heldWait(fx, idx) : null
  const lost = (held === 'shop' && !shopOpen) || (held === 'sock' && !sockOpen)
  useEffect(() => {
    if (held && lost) onReopen(held)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held, lost])

  // 行が無いとき（セリフを消したなど）は、そのまま終わり
  useEffect(() => {
    if (!line) onDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!line])

  if (!line) return null
  const next = () => {
    if (idx + 1 < lines.length) setIdx(idx + 1)
    else onDone()
  }
  return (
    <>
      {!wait && <div className="hide-catch" onClick={next} />}
      {/* 画面を開き直すまでのあいだは、ハイライトと矢印を出さない */}
      {f.spot && !lost && <Spotlight rect={SPOTS[f.spot]} pass={!!wait} />}
      {f.arrow && !lost && <GuideArrow key={`arrow${idx}`} {...ARROWS[f.arrow]} />}
      {f.cutin && (
        <div className="rin-cutin" key={`cut${idx}`}>
          <div className="rin-cutin-band" />
          <img src={characterImage('Stage1', '喜')} alt="" />
          <span>カットイン（仮）</span>
        </div>
      )}
      <GameTalk key={idx} line={line} wait={!!wait} compact={shopOpen} />
    </>
  )
}

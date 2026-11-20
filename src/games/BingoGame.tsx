import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import GameTalk from '../components/GameTalk'
import { Spotlight, SPOTS } from './Stage1Guide'
import { useGameLines } from '../script/scriptData'
import { sockKeyOfItems } from '../santazon/products'
import { useProducts } from '../santazon/useProducts'
import {
  JACK_ICON,
  ST4_NAME,
  type Emotion,
  type NovelLine,
} from '../scenario'
import { DEFAULT_BINGO, type BingoProgress, type TeamDoc } from '../types'
import {
  BINGO_BG_IMAGE,
  bingoCells,
  DECK_BACK_IMAGE,
  DECK_FACE_IMAGE,
  HIDDEN_SHEET,
  HOLE_IMAGE,
  holeChar,
  isBingoCart,
  itemLabel,
  itemParts,
  openedCells,
  roundOf,
  ROUNDS,
  shuffled,
  TUTORIAL,
  TUTORIAL_KID_LIST,
  type BingoCard,
  type BingoItem,
  type BingoRound,
} from './bingoData'

/** ロビンがめくるまでの間 */
const KID_FLIP_MS = 1600
/** めくってから、次へ進むまで（穴が開くのを見せる） */
const AFTER_FLIP_MS = 1500
/** ビンゴを見せてから会話に入るまで */
const AFTER_BINGO_MS = 2200
/** 「ROUND 1」を見せる長さ */
const BANNER_MS = 2200
/** 右上のジャックのボタン（styles.css の button.bingo-jack と合わせる：右35px・上35px・130×130） */
const JACK_SPOT = { x: 1755, y: 35, w: 130, h: 130 }
const BG: CSSProperties = { backgroundImage: `url("${BINGO_BG_IMAGE}")` }

type Side = 'kid' | 'adult'

/** 会話の台詞は script/gameScenes.ts（セリフ編集の「チュートリアル（説明）」など） */
type Line = NovelLine
const elf = (text: string, emotion?: Emotion): Line => ({ speaker: 'エルフ', character: 'Common', text, emotion })

// ---------- チュートリアルの台本 ----------
interface Tut {
  dealt: boolean
  decks: boolean
  reveal: boolean
  flips: number
  jack: boolean
}
const TUT0: Tut = { dealt: false, decks: false, reveal: false, flips: 0, jack: false }

type Beat = { kind: 'say'; line: Line; set?: Partial<Tut>; after?: Partial<Tut> } | { kind: 'flip' }
const say = (line: Line, set?: Partial<Tut>, after?: Partial<Tut>): Beat => ({ kind: 'say', line, set, after })

/** チュートリアルの説明（st4-tutorial）の、行ごとの演出。？の公開は reveal の行 */
const TUTORIAL_FX: Record<string, Partial<Tut>> = { sheet: { dealt: true }, decks: { decks: true } }
/** その行をタップして次へ進むときに起きる演出（？の公開：左上からじわーっと変わる） */
const TUTORIAL_AFTER: Record<string, Partial<Tut>> = { reveal: { reveal: true } }
/** ？が公開されるアニメーション（CSS の bingo-reveal）が終わるまで */
const REVEAL_MS = 1600
/** ロビンの画面が開くのを見せてから、次のセリフ */
const JACK_OPEN_MS = 500
/** この名前の行の前に、カードを1枚めくる（1・3・5枚目はロビン、2・4・6枚目は大人。順番は flow が決める） */
const FLIP_LINES = ['flip1', 'flip2', 'flip3', 'flip4', 'flip5', 'flip6']
/** めくり始めるまで */
const TUT_FLIP_PRE_MS = 500
/** 山札の中身の文字の大きさ（いつも固定。いちばん長い並び「ブリキのロボット1体・シュークリーム5個・たいこ3個」が吹き出しに収まる大きさ） */
const DECK_LIST_PX = 48
/** 山札にカードが配られるアニメーション（CSS の bingo-deck-in：.45s、1枚ごとに .09s ずつ遅れる）が終わるまで */
const DECK_DEAL_MS = 1100
/** ビンゴシートを配るアニメーション（CSS の bingo-deal：.7s、右のシートは .25s 遅れる）が終わるまで */
const DEAL_MS = 1050
/** めくったカードが置かれるまで（CSS の flip-x などの 1.2s に少し余裕を足す） */
const FLIP_MS = 1250

/** チュートリアルの流れ：説明（flip1〜6 の行の前にカードをめくる。最後にロビンのキモチを話す）→ キモチのあと → ジャック機能（jack の行でアイコンが出る） */
function tutorialBeats(intro: Line[], after: Line[], jack: Line[]): Beat[] {
  return [
    ...intro.flatMap((l): Beat[] => [...(FLIP_LINES.includes(l.id ?? '') ? [{ kind: 'flip' } as Beat] : []), say(l, TUTORIAL_FX[l.id ?? ''], TUTORIAL_AFTER[l.id ?? ''])]),
    ...after.map((l) => say(l)),
    ...jack.map((l) => say(l, l.id === 'jack' ? { jack: true } : undefined)),
  ]
}

/** 起きないはずだが、ロビンが勝たなかったとき */
const RETRY_ADULT: Line[] = [elf('大人の方が先にビンゴしてしまいました…'), elf('もう一度やり直しましょう。')]
const RETRY_NONE: Line[] = [elf('お互いビンゴになりませんでした。'), elf('もう一度やり直しましょう。')]

// ---------- 盤面の計算 ----------
interface Flow {
  round: BingoRound
  /** めくった順のカード */
  seq: { who: Side; item: BingoItem }[]
  kidFlipped: BingoItem[]
  adultFlipped: BingoItem[]
  /** 先にそろった方（まだなら null。全部めくってそろわなければ 'none'） */
  winner: Side | 'none' | null
  /** 勝負がついたのは、何枚目をめくったとき（まだなら Infinity） */
  winAt: number
  kidLine: number[]
  adultLine: number[]
}

/** through=true は、ビンゴがそろっても、めくった分は最後まで数える（チュートリアルの「ちなみに」の1枚） */
function flow(round: BingoRound, kidOrder: number[], adultOrder: number[], flips: number, through = false): Flow {
  const seq: Flow['seq'] = []
  for (let i = 0; i < flips; i++) {
    const who: Side = i % 2 === 0 ? 'kid' : 'adult'
    const k = Math.floor(i / 2)
    const item = who === 'kid' ? round.kidDeck[kidOrder[k] ?? k] : round.adultDeck[adultOrder[k] ?? k]
    if (item) seq.push({ who, item })
  }
  let winner: Flow['winner'] = null
  let winAt = Infinity
  let kidLine: number[] = []
  let adultLine: number[] = []
  const chars: string[] = []
  for (const [n, s] of seq.entries()) {
    chars.push(holeChar(s.item))
    // 勝負がついたあとにめくった分（チュートリアルの「ちなみに」）は、穴だけ開けて、ビンゴの印は出さない
    if (winner) continue
    kidLine = bingoCells(openedCells(round.kid, chars))
    adultLine = bingoCells(openedCells(round.adult, chars))
    if (!winner && (kidLine.length || adultLine.length)) {
      winner = kidLine.length ? 'kid' : 'adult'
      winAt = n + 1
      if (!through) break
    }
  }
  if (!winner && seq.length >= round.kidDeck.length + round.adultDeck.length) {
    winner = 'none'
    winAt = seq.length
  }
  return {
    round,
    seq,
    kidFlipped: seq.filter((s) => s.who === 'kid').map((s) => s.item),
    adultFlipped: seq.filter((s) => s.who === 'adult').map((s) => s.item),
    winner,
    winAt,
    kidLine,
    adultLine,
  }
}

interface Props {
  doc: TeamDoc
  update: (patch: Partial<TeamDoc>) => void
  shopOpen: boolean
  /** 暗くして Santazon を閉じ、then を実行する（取り出し依頼のあと、ゲーム画面へ） */
  onFadeToGame: (then: () => void) => void
  /** ROUND2 が終わった。次のステージ（LAST）へ */
  onDone: () => void
  /** ROUND1「とりよせのあと」の説明が始まった・終わった（「エルフに取り出し依頼」ボタンは、ここから出す） */
  onOrderTalk?: (on: boolean) => void
  /** エルフ・ロビンが話している間（チュートリアルの間も）は、下のボタンを押せなくする */
  onLock?: (locked: boolean) => void
  /** 注文が届いて、「アイテムが届きました」を閉じた */
  arrived?: boolean
}

/** ステージ4：カタカナビンゴ。チュートリアル → ROUND1 → ROUND2 */
export default function BingoGame({ doc, update, shopOpen, onFadeToGame, onDone, onOrderTalk, onLock, arrived }: Props) {
  const { products } = useProducts()
  const bingo: BingoProgress = { ...DEFAULT_BINGO, ...doc.bingo }
  const bingoRef = useRef(bingo)
  bingoRef.current = bingo
  const setBingo = (patch: Partial<BingoProgress>) => update({ bingo: { ...bingoRef.current, ...patch } })
  const r = roundOf(bingo.step)

  // 画面の外（注文ボタン）まで覆うため、会話などはプレイヤー画面の上に出す
  const [host, setHost] = useState<HTMLElement | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    setHost(rootRef.current?.closest<HTMLElement>('.screen.player') ?? null)
  }, [])
  const overlay = (node: ReactNode) => (host ? createPortal(node, host) : null)

  const tutIntro = useGameLines('st4-tutorial')
  const tutAfter = useGameLines('st4-tutorial-bingo')
  const tutJack = useGameLines('st4-jack')
  const orderLines = useGameLines('st4-r1-order')
  const sockLines = useGameLines('st4-sock')
  const ROUND_START = { r1: useGameLines('st4-r1-start'), r2: useGameLines('st4-r2-start') }
  const ROUND_END = { r1: useGameLines('st4-r1-end'), r2: useGameLines('st4-r2-end') }
  // チュートリアルは、始まったときの台詞で最後まで進める（途中で台本が変わらないように）
  const beatsRef = useRef<Beat[]>([])
  const TUTORIAL_BEATS = beatsRef.current
  const [talk, setTalk] = useState<{ lines: Line[]; idx: number; then?: () => void } | null>(null)
  const [jackOpen, setJackOpen] = useState(false)

  // ---------- チュートリアル ----------
  const [tut, setTut] = useState<Tut>(TUT0)
  const [beat, setBeat] = useState(-1)
  const tutorial = bingo.step === 'rule'
  useEffect(() => {
    if (!tutorial) return
    beatsRef.current = tutorialBeats(tutIntro, tutAfter, tutJack)
    setTut(TUT0)
    setBeat(0)
  }, [tutorial])

  const nextBeat = () => setBeat((b) => b + 1)
  useEffect(() => {
    if (!tutorial || beat < 0) return
    const b = TUTORIAL_BEATS[beat]
    if (!b) {
      // 説明が終わった。ROUND1 へ
      update({ bingo: { ...DEFAULT_BINGO, step: 'r1', jack: true }, order: null })
      return
    }
    if (b.kind === 'say') {
      if (b.set) setTut((t) => ({ ...t, ...b.set }))
      // 説明で開いていたロビンの画面は、ここで閉じる
      if (b.line.id === 'jack-close') setJackOpen(false)
      const show = () =>
        setTalk({
          lines: [b.line],
          idx: 0,
          then: () => {
            // ジャックの説明：タップで進めると、ロビンの画面が開いて、次のセリフ
            if (b.line.id === 'jack') {
              setJackOpen(true)
              setTimeout(nextBeat, JACK_OPEN_MS)
              return
            }
            if (!b.after) return nextBeat()
            // ？が公開されるアニメーションが終わってから、次のセリフ
            setTut((t) => ({ ...t, ...b.after }))
            setTimeout(nextBeat, REVEAL_MS)
          },
        })
      // ビンゴシートや山札が配られるアニメーションが終わってから、次のセリフ
      const wait = b.set?.dealt ? DEAL_MS : b.set?.decks ? DECK_DEAL_MS : 0
      if (!wait) show()
      else {
        const t = setTimeout(show, wait)
        return () => clearTimeout(t)
      }
    } else {
      // カードを1枚めくって、穴が開くのを見せてから、次のセリフ
      const t1 = setTimeout(() => setTut((t) => ({ ...t, flips: t.flips + 1 })), TUT_FLIP_PRE_MS)
      const t2 = setTimeout(nextBeat, TUT_FLIP_PRE_MS + FLIP_MS + AFTER_FLIP_MS)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorial, beat])

  // ---------- ラウンド ----------
  const round = r ? ROUNDS[r] : TUTORIAL
  const f = tutorial
    ? flow(TUTORIAL, [0, 1, 2], [0, 1, 2], tut.flips, true)
    : flow(round, bingo.kidOrder, bingo.adultOrder, bingo.started ? bingo.flips : 0)

  // ROUND の始まりを大きく見せる
  const [banner, setBanner] = useState<string | null>(null)
  useEffect(() => {
    if (!r || bingo.started || bingo.deckIn) return
    setBanner(r === 'r1' ? 'ROUND 1' : 'ROUND 2')
    const t = setTimeout(() => setBanner(null), BANNER_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r])

  // 正しい注文の問題を解いたら、宅配ソックスの番号を言って山札に入れる
  const solved = !!r && !bingo.deckIn && doc.order?.status === 'solved' && isBingoCart(bingo.step, doc.order.items, products)

  // ROUND1：注文が届いて「アイテムが届きました」を閉じたあと、エルフが「取り出し依頼」の説明をする（Santazon の上で話す）。request の行でボタンが光る
  const [orderIdx, setOrderIdx] = useState(0)
  const orderTalk =
    r === 'r1' && !bingo.deckIn && !!doc.order && bingo.orderTold !== doc.order.at && doc.order.status === 'delivered' && !!arrived && isBingoCart(bingo.step, doc.order.items, products)
  const orderLine = orderTalk && !talk ? orderLines[orderIdx] : undefined
  const nextOrder = () => {
    if (orderIdx + 1 < orderLines.length) setOrderIdx(orderIdx + 1)
    else {
      setOrderIdx(0)
      setBingo({ orderTold: doc.order?.at })
    }
  }
  useEffect(() => {
    // 説明が全部消された場面は、すぐ次へ
    if (orderTalk && !talk && orderLines.length === 0) setBingo({ orderTold: doc.order?.at })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })
  // 話している間は、下のボタンを押せない（チュートリアルは、セリフの合間もずっと）
  const busy = tutorial || !!talk || !!orderLine || solved
  useEffect(() => {
    onLock?.(busy)
    return () => onLock?.(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy])
  useEffect(() => {
    onOrderTalk?.(orderTalk)
    return () => onOrderTalk?.(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderTalk])
  // 「エルフに取り出し依頼」の行：Santazon のそのボタンにスポットライトを当てる
  const requestSpot = !!orderLine && orderLine.id === 'request' && shopOpen

  // 取り出し依頼のあと：1行目（Santazon の上）→ フェードでゲーム画面へ → 2行目（山札に加えます）→ 山札に配る
  const [sockIdx, setSockIdx] = useState(0)
  useEffect(() => {
    if (!solved) setSockIdx(0)
  }, [solved])
  const sockLine = sockLines[sockIdx]
  const nextSock = () => {
    if (sockIdx + 1 < sockLines.length) {
      // 次の行はゲーム画面で話す。暗くして Santazon を閉じてから
      if (shopOpen) onFadeToGame(() => setSockIdx(sockIdx + 1))
      else setSockIdx(sockIdx + 1)
    } else setBingo({ deckIn: true })
  }
  // 山札にカードが配られるアニメーションが終わってから、「ゲーム開始」を出す
  const [deckReady, setDeckReady] = useState(false)
  useEffect(() => {
    if (!bingo.deckIn || bingo.started) return setDeckReady(false)
    const t = setTimeout(() => setDeckReady(true), DECK_DEAL_MS)
    return () => clearTimeout(t)
  }, [bingo.deckIn, bingo.started])

  // ロビンの番は自動でめくる
  const turn: Side = bingo.flips % 2 === 0 ? 'kid' : 'adult'
  const playing = !!r && bingo.started && !f.winner
  useEffect(() => {
    if (!playing || turn !== 'kid') return
    const t = setTimeout(() => setBingo({ flips: bingoRef.current.flips + 1 }), KID_FLIP_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, turn, bingo.flips])
  const [flippedAt, setFlippedAt] = useState(-1)
  const adultFlip = () => {
    if (!playing || turn !== 'adult' || flippedAt === bingo.flips) return
    setFlippedAt(bingo.flips)
    setBingo({ flips: bingo.flips + 1 })
  }

  // 勝負がついたら会話へ
  const ended = useRef(false)
  useEffect(() => {
    if (!r || !bingo.started) {
      ended.current = false
      return
    }
    if (!f.winner || ended.current) return
    ended.current = true
    const t = setTimeout(() => {
      if (f.winner === 'kid') {
        setTalk({
          lines: ROUND_END[r],
          idx: 0,
          then: () => {
            if (r === 'r1') update({ bingo: { ...DEFAULT_BINGO, step: 'r2', jack: true }, order: null, records: [...new Set([...(doc.records ?? []), 'st4-r1'])] })
            else onDone()
          },
        })
      } else {
        setTalk({
          lines: f.winner === 'adult' ? RETRY_ADULT : RETRY_NONE,
          idx: 0,
          then: () => setBingo({ started: false, flips: 0 }),
        })
      }
    }, FLIP_MS + AFTER_BINGO_MS)
    return () => {
      clearTimeout(t)
      ended.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, bingo.started, f.winner])

  const nextTalk = () => {
    if (!talk) return
    if (talk.idx + 1 < talk.lines.length) return setTalk({ ...talk, idx: talk.idx + 1 })
    setTalk(null)
    talk.then?.()
  }
  // セリフ編集で台詞を全部消した場面は、すぐ次へ
  useEffect(() => {
    if (talk && !talk.lines[talk.idx]) {
      setTalk(null)
      talk.then?.()
    }
  })

  // ---------- 表示 ----------
  const dealt = tutorial ? tut.dealt : true
  const decks = tutorial ? tut.decks : true
  const reveal = tutorial ? tut.reveal : false
  const jack = tutorial ? tut.jack : bingo.jack
  const adultIn = tutorial ? tut.decks : bingo.deckIn
  const view: BoardView = {
    flow: f,
    dealt,
    kidDeck: decks,
    adultDeck: adultIn,
    reveal,
    cardOpen: reveal || (!tutorial && bingo.started),
    kidList: tutorial ? TUTORIAL_KID_LIST : round.kidDeck,
  }

  let center: ReactNode = null
  if (tutorial) {
    // チュートリアルは、めくる操作もしない
  } else if (r) {
    if (!bingo.deckIn) center = <div className="bingo-hint">Santazonでアイテムを3つ注文して、山札をそろえよう</div>
    else if (!bingo.started && !deckReady) center = null
    else if (!bingo.started)
      center = (
        <button
          className="bingo-flip-btn is-start"
          onClick={() =>
            // 「めくっていきましょう」の会話のあと、ゲーム開始
            setTalk({
              lines: ROUND_START[r],
              idx: 0,
              then: () => setBingo({ started: true, flips: 0, kidOrder: shuffled(round.kidDeck.length), adultOrder: shuffled(round.adultDeck.length) }),
            })
          }
        >
          ゲーム開始
        </button>
      )
    else if (playing && turn === 'adult')
      center = (
        <button className="bingo-flip-btn" disabled={flippedAt === bingo.flips} onClick={adultFlip}>
          カードをめくる
        </button>
      )
    else if (playing) center = <div className="bingo-turn">ロビンの番</div>
  }

  const line = talk?.lines[talk.idx]

  return (
    <div className="bingo-game" ref={rootRef} style={BG}>
      {/* めくったものは、上下の吹き出し（山札の中身）で印がつく */}
      <Board view={view} perspective="adult" center={center} />

      {jack && (
        <button className="bingo-jack" disabled={busy} aria-label="ジャック機能（ロビンの画面を見る）" onClick={() => setJackOpen(true)}>
          <img src={JACK_ICON} alt="" />
        </button>
      )}

      {/* ROUND1：アイテムを選ぶあいだ、「記録」ボタンの上にルールシートの案内を出す */}
      {r === 'r1' && !bingo.started && (
        <div className="bingo-rule-note">{'ゲームの細かいルールは\n机のラックにある\n「アイテムビンゴ・ルールシート」で\n確認できます'}</div>
      )}

      {banner && <div className="bingo-banner" key={banner}>{banner}</div>}

      {jackOpen &&
        overlay(
          <div className={`modal-back bingo-jack-back${tutorial ? ' is-raised' : ''}`} style={tutorial ? { zIndex: 60 } : undefined} onClick={() => setJackOpen(false)}>
            <div className="modal bingo-jack-modal" onClick={(e) => e.stopPropagation()}>
              <button className="sz-close" onClick={() => setJackOpen(false)} aria-label="閉じる">✕</button>
              <h2>
                <img src={JACK_ICON} alt="" />
                ロビンの画面
              </h2>
              <div className="bingo-jack-view" style={BG}>
                <Board view={view} perspective="kid" />
              </div>
            </div>
          </div>,
        )}

      {/* ジャックの説明の行（jack）では、ボタンだけ明るく見せる */}
      {line?.id === 'jack' && overlay(<Spotlight rect={JACK_SPOT} pass={false} round />)}

      {/* 「エルフに取り出し依頼」の行では、そのボタンだけ明るく見せる（周りを暗くする。枠は出さない） */}
      {requestSpot && overlay(<Spotlight rect={SPOTS.szRequest} pass={false} ring={false} />)}

      {(line || orderLine || (solved && !talk)) &&
        overlay(
          <>
            <div
              className="hide-catch"
              onClick={line ? nextTalk : orderLine ? nextOrder : nextSock}
            />
            <GameTalk
              // [番号] は、そのラウンドの宅配ソックスの番号
              line={line ?? orderLine ?? { ...(sockLine ?? elf('')), text: (sockLine?.text ?? '').replace(/\[番号\]/g, doc.order ? sockKeyOfItems(doc.order.items, products) : '') }}
              compact={shopOpen}
              // ボタンを照らしている行は、全体を暗くしない（照らしたボタンまで暗くなる）
              dim={!requestSpot}
              // ロビンの画面（ダイアログ）を開いているあいだは、ダイアログにかぶらないよう、画面の一番下で話す
              low={jackOpen}
            />
          </>,
        )}
    </div>
  )
}

// ---------- 盤面（ビンゴ１.webp：1920×841 の座標で置く） ----------
interface BoardView {
  flow: Flow
  /** カードが配られた */
  dealt: boolean
  /** 山札が場に出ている */
  kidDeck: boolean
  adultDeck: boolean
  /** 相手の？を明かす（チュートリアル） */
  reveal: boolean
  /** 相手のカードの？だけ外す（ゲーム開始から） */
  cardOpen: boolean
  /** ロビンの山札の中身（表示の順） */
  kidList: BingoItem[]
}

/**
 * perspective の側が自分。相手のカードと山札の中身は、明かすまで？。
 * 左が大人（青）、右がロビン（黄）。上の吹き出しがロビンの山札、下の吹き出しが大人の山札。
 * ジャック機能（ロビンの画面）でも並びは同じで、？になる側だけが入れ替わる
 */
function Board({ view, perspective, center }: { view: BoardView; perspective: Side; center?: ReactNode }) {
  const { flow: f } = view
  // めくるアニメーション（FLIP_MS）が終わってから、カードに〇を付ける・ビンゴの表示を出す。増えたときだけ待つ（戻すときはすぐ）
  const [shown, setShown] = useState(f.seq.length)
  useEffect(() => {
    if (f.seq.length <= shown) return setShown(f.seq.length)
    const t = setTimeout(() => setShown(f.seq.length), FLIP_MS)
    return () => clearTimeout(t)
  }, [f.seq.length, shown])
  // ビンゴの印は、勝負がついたカードのアニメーションが終わったら出す。そのあとにめくったカード（チュートリアルの「ちなみに」）では、出し直さない
  const winShown = shown >= f.winAt
  const chars = f.seq.slice(0, shown).map((s) => holeChar(s.item))
  const sides: Side[] = ['adult', 'kid']
  const last = f.seq[f.seq.length - 1]
  return (
    <div className="bingo-board">
      {sides.map((side) => {
        const hidden = side !== perspective && !view.reveal
        const letters = side === 'kid' ? f.round.kid : f.round.adult
        const flipped = side === 'kid' ? f.kidFlipped : f.adultFlipped
        const total = side === 'kid' ? f.round.kidDeck.length : f.round.adultDeck.length
        const deckIn = side === 'kid' ? view.kidDeck : view.adultDeck
        return [
          <Card
            key={`card-${side}`}
            side={side}
            image={hidden && !view.cardOpen ? HIDDEN_SHEET[side] : f.round.sheets[side]}
            hiddenImage={side !== perspective ? HIDDEN_SHEET[side] : undefined}
            letters={letters}
            dealt={view.dealt}
            open={openedCells(letters, chars)}
            line={winShown ? (side === 'kid' ? f.kidLine : f.adultLine) : []}
            win={winShown && f.winner === side}
          />,
          <Deck key={`deck-${side}`} side={side} inDeck={deckIn} left={total - flipped.length} />,
          <DeckList
            key={`list-${side}`}
            side={side}
            inDeck={deckIn}
            list={side === 'kid' ? view.kidList : f.round.adultDeck}
            flipped={flipped}
            hidden={hidden}
          />,
        ]
      })}
      {/* 真ん中：めくったカード */}
      <div className="bingo-open-slot">
        <img className="bingo-face-bg" src={DECK_FACE_IMAGE} alt="" draggable={false} />
        {/* めくったカードは、その場に重ねて残す。最新の1枚だけ、山札からくるっと裏返りながら置かれる */}
        {f.seq.map((s, i) => {
          const isLast = i === f.seq.length - 1
          const front = (
            <div className="bingo-flip-front">
              <img className="bingo-face-bg" src={DECK_FACE_IMAGE} alt="" draggable={false} />
              <div className={`bingo-face is-${s.who}`}>
                <b className={Array.from(itemParts(s.item)[0]).length > 5 ? 'is-long' : ''}>{itemParts(s.item)[0]}</b>
                <em>{itemParts(s.item)[1]}</em>
              </div>
            </div>
          )
          // 重ねたときに少しずつずれる（毎回同じずれ方）
          const rest = {
            '--rx': `${((i * 7) % 5) * 3 - 6}px`,
            '--ry': `${((i * 5) % 4) * 2 - 3}px`,
            '--rr': `${((i * 37) % 9) - 4}deg`,
            '--dx': s.who === 'kid' ? '240px' : '-240px',
          } as CSSProperties
          return (
            <div className="bingo-pile" key={i} style={rest}>
              {isLast ? (
                <div className="flip-x">
                  <div className="flip-y">
                    <div className="flip-rot">
                      <div className="bingo-flip-back">
                        <img src={DECK_BACK_IMAGE} alt="" draggable={false} />
                      </div>
                      {front}
                    </div>
                  </div>
                </div>
              ) : (
                front
              )}
            </div>
          )
        })}
      </div>
      {center && <div className="bingo-action">{center}</div>}
    </div>
  )
}
/** 山札の中身に、めくったものの印をつける（同じカードが2枚あっても1枚ずつ） */
function marks(list: BingoItem[], flipped: BingoItem[]) {
  const rest = [...flipped]
  return list.map((c) => {
    const k = rest.findIndex((x) => x.name === c.name && x.n === c.n)
    if (k >= 0) rest.splice(k, 1)
    return { c, used: k >= 0 }
  })
}

/** カード画像（450×450）の1マスは 150px。〇（maru.webp）をマスの真ん中に重ねる */
const CELL = 150
const cellStyle = (i: number): CSSProperties => ({ left: (i % 3) * CELL, top: Math.floor(i / 3) * CELL })

function Card({
  side,
  image,
  hiddenImage,
  letters,
  dealt,
  open,
  line,
  win,
}: {
  side: Side
  image: string
  /** 相手のカードの？の絵。これから本物に変わるとき、左上からじわーっと切り替える */
  hiddenImage?: string
  letters: BingoCard
  dealt: boolean
  open: Set<number>
  line: number[]
  win: boolean
}) {
  // ？のカードから本物に変わった間だけ、？の絵を下に残して、本物を左上から出していく
  const prevImage = useRef(image)
  const [wipeFrom, setWipeFrom] = useState<string | null>(null)
  useLayoutEffect(() => {
    const prev = prevImage.current
    prevImage.current = image
    if (!hiddenImage || prev !== hiddenImage || image === hiddenImage) return
    setWipeFrom(prev)
    const t = setTimeout(() => setWipeFrom(null), REVEAL_MS)
    return () => clearTimeout(t)
  }, [image, hiddenImage])
  if (!dealt) return <div className={`bingo-card is-${side} is-empty`} />
  const lineSet = new Set(line)
  return (
    <div className={`bingo-card is-${side}${win ? ' is-win' : ''}`}>
      {wipeFrom && <img className="bingo-sheet" src={wipeFrom} alt="" draggable={false} />}
      <img className={`bingo-sheet${wipeFrom ? ' is-wipe-in' : ''}`} src={image} alt="" draggable={false} />
      {letters.map((_, i) =>
        open.has(i) ? (
          <img
            key={i}
            className={`bingo-hole${lineSet.has(i) ? ' is-line' : ''}`}
            src={HOLE_IMAGE}
            alt=""
            draggable={false}
            style={cellStyle(i)}
          />
        ) : null,
      )}
      {win && <div className="bingo-win">BINGO!</div>}
    </div>
  )
}

/** 山札（card_1.webp の裏面を、残りの枚数だけ少しずらして重ねる） */
function Deck({ side, inDeck, left }: { side: Side; inDeck: boolean; left: number }) {
  return (
    <div className={`bingo-deck is-${side}`}>
      {inDeck && left > 0 ? (
        Array.from({ length: left }, (_, i) => (
          <img key={i} src={DECK_BACK_IMAGE} alt="" draggable={false} style={{ '--k': i } as CSSProperties} />
        ))
      ) : (
        <span className="bingo-deck-empty">{!inDeck && side === 'adult' ? '注文した\nカードが\n入ります' : ''}</span>
      )}
    </div>
  )
}

/** 吹き出しの中身：山札のカードを「・」でつなぐ。相手の分は、めくるまで？ */
function DeckList({
  side,
  inDeck,
  list,
  flipped,
  hidden,
}: {
  side: Side
  inDeck: boolean
  list: BingoItem[]
  flipped: BingoItem[]
  hidden: boolean
}) {
  // ？が公開された間だけ、左上からじわーっと出していく
  const prevHidden = useRef(hidden)
  const [wipe, setWipe] = useState(false)
  useLayoutEffect(() => {
    const was = prevHidden.current
    prevHidden.current = hidden
    if (!was || hidden) return
    setWipe(true)
    const t = setTimeout(() => setWipe(false), REVEAL_MS)
    return () => clearTimeout(t)
  }, [hidden])
  const items = inDeck ? marks(list, flipped) : list.map((c) => ({ c, used: false }))
  const allQ = items.every(({ used }) => !inDeck || (hidden && !used))
  return (
    <p className={`bingo-deck-list is-${side}${allQ ? ' is-all-q' : ''}${wipe ? ' is-wipe-in' : ''}`} style={{ fontSize: DECK_LIST_PX }}>
      {items.map(({ c, used }, i) => (
        <span key={i} className={`${used ? 'is-used' : ''}${!inDeck || (hidden && !used) ? ' is-q' : ''}`}>
          {i > 0 && <i>・</i>}
          {!inDeck || (hidden && !used) ? '？' : itemLabel(c)}
        </span>
      ))}
    </p>
  )
}

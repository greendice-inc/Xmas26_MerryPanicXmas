import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import GameTalk from '../components/GameTalk'
import MoodCard from '../components/MoodCard'
import { useGameLines } from '../script/scriptData'
import { useProducts } from '../santazon/useProducts'
import {
  JACK_ICON,
  ST4_MOOD,
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

type Beat = { kind: 'say'; line: Line; set?: Partial<Tut> } | { kind: 'flip'; who: Side } | { kind: 'mood' }
const say = (line: Line, set?: Partial<Tut>): Beat => ({ kind: 'say', line, set })

/** チュートリアルの説明（st4-tutorial）の、行ごとの演出 */
const TUTORIAL_FX: Record<number, Partial<Tut>> = { 0: { dealt: true }, 7: { decks: true }, 9: { reveal: true } }

/** チュートリアルの流れ：説明 → 交互に5枚めくる → ビンゴのあと → キモチ → ジャック機能（最後の行でアイコンが出る） */
function tutorialBeats(intro: Line[], after: Line[], jack: Line[]): Beat[] {
  return [
    ...intro.map((l, i) => say(l, TUTORIAL_FX[i])),
    { kind: 'flip', who: 'kid' },
    { kind: 'flip', who: 'adult' },
    { kind: 'flip', who: 'kid' },
    { kind: 'flip', who: 'adult' },
    { kind: 'flip', who: 'kid' },
    ...after.map((l) => say(l)),
    { kind: 'mood' },
    ...jack.map((l, i) => say(l, i === jack.length - 1 ? { jack: true } : undefined)),
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
  kidLine: number[]
  adultLine: number[]
}

function flow(round: BingoRound, kidOrder: number[], adultOrder: number[], flips: number): Flow {
  const seq: Flow['seq'] = []
  for (let i = 0; i < flips; i++) {
    const who: Side = i % 2 === 0 ? 'kid' : 'adult'
    const k = Math.floor(i / 2)
    const item = who === 'kid' ? round.kidDeck[kidOrder[k] ?? k] : round.adultDeck[adultOrder[k] ?? k]
    if (item) seq.push({ who, item })
  }
  let winner: Flow['winner'] = null
  let kidLine: number[] = []
  let adultLine: number[] = []
  const chars: string[] = []
  for (const s of seq) {
    chars.push(holeChar(s.item))
    kidLine = bingoCells(openedCells(round.kid, chars))
    adultLine = bingoCells(openedCells(round.adult, chars))
    if (kidLine.length || adultLine.length) {
      winner = kidLine.length ? 'kid' : 'adult'
      break
    }
  }
  if (!winner && seq.length >= round.kidDeck.length + round.adultDeck.length) winner = 'none'
  return {
    round,
    seq,
    kidFlipped: seq.filter((s) => s.who === 'kid').map((s) => s.item),
    adultFlipped: seq.filter((s) => s.who === 'adult').map((s) => s.item),
    winner,
    kidLine,
    adultLine,
  }
}

interface Props {
  doc: TeamDoc
  update: (patch: Partial<TeamDoc>) => void
  shopOpen: boolean
  /** ROUND2 が終わった。次のステージ（LAST）へ */
  onDone: () => void
}

/** ステージ4：カタカナビンゴ。チュートリアル → ROUND1 → ROUND2 */
export default function BingoGame({ doc, update, shopOpen, onDone }: Props) {
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
  const sockLine = useGameLines('st4-sock')[0]
  const ROUND_END = { r1: useGameLines('st4-r1-end'), r2: useGameLines('st4-r2-end') }
  // チュートリアルは、始まったときの台詞で最後まで進める（途中で台本が変わらないように）
  const beatsRef = useRef<Beat[]>([])
  const TUTORIAL_BEATS = beatsRef.current
  const [talk, setTalk] = useState<{ lines: Line[]; idx: number; then?: () => void } | null>(null)
  const [mood, setMood] = useState<{ then?: () => void } | null>(null)
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
  const cur = tutorial && beat >= 0 ? TUTORIAL_BEATS[beat] : undefined
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
      setTalk({ lines: [b.line], idx: 0, then: nextBeat })
    } else if (b.kind === 'mood') {
      setMood({ then: nextBeat })
    } else if (b.who === 'kid') {
      const t1 = setTimeout(() => setTut((t) => ({ ...t, flips: t.flips + 1 })), KID_FLIP_MS)
      const t2 = setTimeout(nextBeat, KID_FLIP_MS + AFTER_FLIP_MS)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorial, beat])
  const tutWaitFlip = cur?.kind === 'flip' && cur.who === 'adult'
  const [tutFlipped, setTutFlipped] = useState(-1)
  const tutFlip = () => {
    if (!tutWaitFlip || tutFlipped === beat) return
    setTutFlipped(beat)
    setTut((t) => ({ ...t, flips: t.flips + 1 }))
    setTimeout(nextBeat, AFTER_FLIP_MS)
  }

  // ---------- ラウンド ----------
  const round = r ? ROUNDS[r] : TUTORIAL
  const f = tutorial
    ? flow(TUTORIAL, [0, 1, 2], [0, 1, 2], tut.flips)
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
            if (r === 'r1') update({ bingo: { ...DEFAULT_BINGO, step: 'r2', jack: true }, order: null })
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
    }, AFTER_BINGO_MS)
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
    kidList: tutorial ? TUTORIAL_KID_LIST : round.kidDeck,
  }

  let center: ReactNode = null
  if (tutorial) {
    if (tutWaitFlip) center = <button className="bingo-flip-btn" onClick={tutFlip}>カードをめくる</button>
    else if (cur?.kind === 'flip') center = <div className="bingo-turn">ロビンの番</div>
  } else if (r) {
    if (!bingo.deckIn) center = <div className="bingo-hint">Santazonでアイテムを3つ注文して、山札をそろえよう</div>
    else if (!bingo.started)
      center = (
        <button
          className="bingo-flip-btn is-start"
          onClick={() => setBingo({ started: true, flips: 0, kidOrder: shuffled(round.kidDeck.length), adultOrder: shuffled(round.adultDeck.length) })}
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
  const label = tutorial ? 'チュートリアル' : r === 'r1' ? 'ROUND 1' : r === 'r2' ? 'ROUND 2' : ''

  return (
    <div className="bingo-game" ref={rootRef} style={BG}>
      <div className="bingo-head">
        {label && <div className="bingo-label">{label}</div>}
      </div>
      {/* めくったものは、上下の吹き出し（山札の中身）で印がつく */}
      <Board view={view} perspective="adult" center={center} />

      {jack && (
        <button className="bingo-jack" aria-label="ジャック機能（ロビンの画面を見る）" onClick={() => setJackOpen(true)}>
          <img src={JACK_ICON} alt="" />
        </button>
      )}

      {banner && <div className="bingo-banner" key={banner}>{banner}</div>}

      {mood && (
        <MoodCard
          mood={ST4_MOOD}
          onClose={() => {
            setMood(null)
            mood.then?.()
          }}
        />
      )}

      {jackOpen &&
        overlay(
          <div className="modal-back bingo-jack-back" onClick={() => setJackOpen(false)}>
            <div className="modal bingo-jack-modal" onClick={(e) => e.stopPropagation()}>
              <h2>
                <img src={JACK_ICON} alt="" />
                ロビンの画面（見るだけ）
              </h2>
              <div className="bingo-jack-view" style={BG}>
                <Board view={view} perspective="kid" />
              </div>
              <button onClick={() => setJackOpen(false)}>閉じる</button>
            </div>
          </div>,
        )}

      {(line || (solved && !talk)) &&
        overlay(
          <>
            <div
              className="hide-catch"
              onClick={line ? nextTalk : () => setBingo({ deckIn: true })}
            />
            <GameTalk
              key={line ? `${talk?.lines[0]?.text}${talk?.idx}` : 'sock'}
              // [番号] は、そのラウンドの宅配ソックスの番号
              line={line ?? { ...(sockLine ?? elf('')), text: (sockLine?.text ?? '').replace(/\[番号\]/g, round.problem?.code ?? '') }}
              compact={shopOpen}
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
  const chars = f.seq.map((s) => holeChar(s.item))
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
            image={hidden ? HIDDEN_SHEET[side] : f.round.sheets[side]}
            letters={letters}
            dealt={view.dealt}
            open={openedCells(letters, chars)}
            line={side === 'kid' ? f.kidLine : f.adultLine}
            win={f.winner === side}
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
        {last && (
          <div className={`bingo-face is-${last.who}`} key={f.seq.length}>
            <small>{last.who === 'kid' ? ST4_NAME : perspective === 'adult' ? 'あなた' : '大人'}</small>
            <b className={Array.from(last.item.name).length > 5 ? 'is-long' : ''}>{last.item.name}</b>
            <em>×{last.item.n}</em>
          </div>
        )}
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
  letters,
  dealt,
  open,
  line,
  win,
}: {
  side: Side
  image: string
  letters: BingoCard
  dealt: boolean
  open: Set<number>
  line: number[]
  win: boolean
}) {
  if (!dealt) return <div className={`bingo-card is-${side} is-empty`} />
  const lineSet = new Set(line)
  return (
    <div className={`bingo-card is-${side}${win ? ' is-win' : ''}`}>
      <img className="bingo-sheet" src={image} alt="" draggable={false} />
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
  const items = inDeck ? marks(list, flipped) : list.map((c) => ({ c, used: false }))
  const allQ = items.every(({ used }) => !inDeck || (hidden && !used))
  return (
    <p className={`bingo-deck-list is-${side}${allQ ? ' is-all-q' : ''}`}>
      {items.map(({ c, used }, i) => (
        <span key={i} className={`${used ? 'is-used' : ''}${!inDeck || (hidden && !used) ? ' is-q' : ''}`}>
          {i > 0 && <i>・</i>}
          {!inDeck || (hidden && !used) ? '？' : itemLabel(c)}
        </span>
      ))}
    </p>
  )
}

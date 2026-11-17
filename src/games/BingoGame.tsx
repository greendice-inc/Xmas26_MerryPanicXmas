import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import MoodCard from '../components/MoodCard'
import { useProducts } from '../santazon/useProducts'
import {
  backgroundImage,
  BINGO_CARD_IMAGE,
  BINGO_HIT_IMAGE,
  characterImage,
  JACK_ICON,
  ST4_MOOD,
  ST4_NAME,
  type Emotion,
} from '../scenario'
import { DEFAULT_BINGO, type BingoProgress, type TeamDoc } from '../types'
import {
  bingoCells,
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
const BG: CSSProperties = { backgroundImage: `url(${backgroundImage('Stage4')})` }

type Side = 'kid' | 'adult'

interface Line {
  who: 'elf' | 'kid'
  text: string
  emotion?: Emotion
}
const elf = (text: string, emotion?: Emotion): Line => ({ who: 'elf', text, emotion })
const kid = (text: string, emotion?: Emotion): Line => ({ who: 'kid', text, emotion })

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

const TUTORIAL_BEATS: Beat[] = [
  say(elf('お互いに3×3のビンゴカードが配られます。'), { dealt: true }),
  say(elf('次に、両プレイヤーにビンゴの穴をあけるためのアイテムを、Santazonで3つ注文していただきます。')),
  say(elf('今回はアイテムのカードをそのまま使います。具現化する必要はありません。')),
  say(elf('また、カードをみなさんが部屋に取りに行く必要はありません。')),
  say(elf('宅配ソックスの番号を導いていただければ、私の方で取り出しておきます。')),
  say(elf('Santazonに取り出し依頼ボタンを追加しておきます。ここにキーボックスの番号を入力して、取り出し依頼をしてください。')),
  say(elf('今回は私の方でアイテムを注文しますね。', '楽')),
  say(elf('お互いがアイテムを3つ注文したら、注文したカードをお互いの山札とします。'), { decks: true }),
  say(elf('山札のカードはお互いシャッフルしているので、表示されている順番で来るとは限りません。')),
  say(elf('今回は練習なので、お互いの？を明かした状態で進めます。'), { reveal: true }),
  say(elf('ビンゴカードと山札がそろったら、ロビンさんから交互に山札を1枚ずつオープンします。')),
  say(elf('どのような条件で穴が開くかは秘密です。今回の練習で推測してみてください。')),
  say(kid('じゃあめくるね。', '楽')),
  { kind: 'flip', who: 'kid' },
  { kind: 'flip', who: 'adult' },
  { kind: 'flip', who: 'kid' },
  { kind: 'flip', who: 'adult' },
  { kind: 'flip', who: 'kid' },
  say(elf('今回、ロビンさんが先にビンゴしたためロビンさんの勝利です。')),
  say(elf('お互い3枚めくってビンゴにならなかった場合は、お互いの負けとなります。')),
  say(elf('キモチヨメール使用中…')),
  { kind: 'mood' },
  say(elf('頑張って負けましょう（コソ）', '楽')),
  say(elf('ジャック機能を解放します。')),
  say(elf('ジャック機能を使うと、子供側の画面を見ることができます。')),
  say(elf('操作することはできません。あくまで見るだけです。秘密ですよ。')),
  say(elf('右上に追加しておきました。頑張ってください。', '楽'), { jack: true }),
]

const ROUND_END: Record<'r1' | 'r2', Line[]> = {
  r1: [kid('やったー！1回目は僕の勝ち！', '喜'), elf('・・・'), elf('ROUND2を開始します。')],
  r2: [kid('やったー！勝った！', '喜'), elf('・・・'), elf('良かったですね'), elf('では続いてLASTに進みましょう。', '楽')],
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

  const [talk, setTalk] = useState<{ lines: Line[]; idx: number; then?: () => void } | null>(null)
  const [mood, setMood] = useState<{ then?: () => void } | null>(null)
  const [jackOpen, setJackOpen] = useState(false)

  // ---------- チュートリアル ----------
  const [tut, setTut] = useState<Tut>(TUT0)
  const [beat, setBeat] = useState(-1)
  const tutorial = bingo.step === 'rule'
  useEffect(() => {
    if (!tutorial) return
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
      <Board view={view} perspective="adult" center={center} />
      {/* めくったカードの記録（めくった順に左から） */}
      {f.seq.length > 0 && (
        <div className="bingo-log">
          <span className="bingo-log-title">めくったカード</span>
          {f.seq.map((c, i) => (
            <div className={`bingo-log-card is-${c.who}`} key={i}>
              <small>{i + 1}. {c.who === 'kid' ? ST4_NAME : 'あなた'}</small>
              <b>{c.item.name}</b>
              <em>×{c.item.n}</em>
            </div>
          ))}
        </div>
      )}

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
            <TalkLine
              key={line ? `${talk?.lines[0]?.text}${talk?.idx}` : 'sock'}
              line={line ?? elf(`宅配ソックスの番号は「${round.problem?.code}」ですね。\nカードを取り出しておきます。`)}
              compact={shopOpen}
            />
          </>,
        )}
    </div>
  )
}

function TalkLine({ line, compact }: { line: Line; compact: boolean }) {
  return (
    <div className={`hide-elf bingo-talk${compact ? ' is-compact' : ''}`}>
      <img src={line.who === 'elf' ? characterImage('Common', line.emotion ?? '真顔') : characterImage('Stage4', line.emotion ?? '真顔')} alt="" />
      <p>
        <span>{line.who === 'elf' ? 'エルフ' : ST4_NAME}</span>
        {line.text}
        <i>▼</i>
      </p>
    </div>
  )
}

// ---------- 盤面 ----------
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

/** perspective の側が自分。相手のカードと山札の中身は、明かすまで？ */
function Board({ view, perspective, center }: { view: BoardView; perspective: Side; center?: ReactNode }) {
  const { flow: f } = view
  const chars = f.seq.map((s) => holeChar(s.item))
  // 左が大人、右がロビン。ジャック機能（ロビンの画面）でも並びは同じで、？になる側だけが入れ替わる
  const sides: Side[] = ['adult', 'kid']
  const last = f.seq[f.seq.length - 1]
  return (
    <div className="bingo-board">
      {sides.map((side, k) => {
        const mine = side === perspective
        const hidden = !mine && !view.reveal
        const cardLetters = side === 'kid' ? f.round.kid : f.round.adult
        const deckIn = side === 'kid' ? view.kidDeck : view.adultDeck
        const list = side === 'kid' ? view.kidList : f.round.adultDeck
        const flipped = side === 'kid' ? f.kidFlipped : f.adultFlipped
        const total = side === 'kid' ? f.round.kidDeck.length : f.round.adultDeck.length
        const owner = side === 'kid' ? ST4_NAME : perspective === 'adult' ? 'あなた' : '大人'
        const deck = (
          <Deck
            key="deck"
            inDeck={deckIn}
            left={total - flipped.length}
            list={list}
            hidden={hidden}
            flipped={flipped}
            side={side}
          />
        )
        const cardEl = (
          <Card
            key="card"
            letters={cardLetters}
            owner={owner}
            side={side}
            hidden={hidden}
            dealt={view.dealt}
            open={openedCells(cardLetters, chars)}
            line={side === 'kid' ? f.kidLine : f.adultLine}
            win={f.winner === side}
          />
        )
        return (
          <div className={`bingo-side is-${side}${k === 0 ? ' is-left' : ' is-right'}`} key={side}>
            {k === 0 ? [deck, cardEl] : [cardEl, deck]}
          </div>
        )
      })}
      <div className="bingo-center">
        <div className="bingo-open-slot">
          {last ? (
            <div className={`bingo-face is-${last.who}`} key={f.seq.length}>
              <small>{last.who === 'kid' ? `${ST4_NAME}がめくったカード` : perspective === 'adult' ? 'あなたがめくったカード' : '大人がめくったカード'}</small>
              <b>{last.item.name}</b>
              <em>×{last.item.n}</em>
            </div>
          ) : (
            <div className="bingo-face is-empty">めくったカード</div>
          )}
        </div>
        <div className="bingo-action">{center}</div>
      </div>
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

/** ビンゴカードのマスの位置（bingo_card.png 488×594 に合わせる） */
const cellStyle = (i: number): CSSProperties => {
  const col = i % 3
  const row = Math.floor(i / 3)
  return {
    left: `${((31 + col * 145) / 488) * 100}%`,
    top: `${((141 + row * 146) / 594) * 100}%`,
    width: `${(136 / 488) * 100}%`,
    height: `${(136 / 594) * 100}%`,
  }
}

function Card({
  letters,
  owner,
  side,
  hidden,
  dealt,
  open,
  line,
  win,
}: {
  letters: BingoCard
  owner: string
  side: Side
  hidden: boolean
  dealt: boolean
  open: Set<number>
  line: number[]
  win: boolean
}) {
  if (!dealt) return <div className="bingo-card is-empty" />
  const lineSet = new Set(line)
  return (
    <div className={`bingo-card is-${side}${win ? ' is-win' : ''}`}>
      <img className="bingo-card-bg" src={BINGO_CARD_IMAGE} alt="" draggable={false} />
      <span className="bingo-owner">{owner}</span>
      {letters.map((ch, i) => (
        <div className={`bingo-cell${lineSet.has(i) ? ' is-line' : ''}`} key={i} style={{ ...cellStyle(i), '--i': i } as CSSProperties}>
          <b className={hidden ? 'is-hidden' : ''} key={hidden ? 'h' : 'v'}>{hidden ? '？' : ch}</b>
          {open.has(i) && <img className="bingo-hit" src={BINGO_HIT_IMAGE} alt="" draggable={false} />}
        </div>
      ))}
      {win && <div className="bingo-win">BINGO!</div>}
    </div>
  )
}

function Deck({
  inDeck,
  left,
  list,
  hidden,
  flipped,
  side,
}: {
  inDeck: boolean
  left: number
  list: BingoItem[]
  hidden: boolean
  flipped: BingoItem[]
  side: Side
}) {
  return (
    <div className={`bingo-deck is-${side}`}>
      <div className="bingo-deck-title">山札</div>
      <div className="bingo-stack">
        {inDeck ? (
          Array.from({ length: left }, (_, i) => <i key={i} style={{ '--k': i } as CSSProperties} />)
        ) : (
          <span className="bingo-stack-empty">{side === 'adult' ? '注文した\nカードが\n入ります' : ''}</span>
        )}
        {inDeck && left === 0 && <span className="bingo-stack-empty">なし</span>}
      </div>
      {inDeck && (
        <ul className="bingo-list">
          {marks(list, flipped).map(({ c, used }, i) => (
            <li key={i} className={used ? 'is-used' : ''}>
              {hidden && !used ? '？' : itemLabel(c)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

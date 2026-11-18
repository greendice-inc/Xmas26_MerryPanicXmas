import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import AreaEditor from '../components/AreaEditor'
import GameTalk from '../components/GameTalk'
import { st3GameImage, type NovelLine } from '../scenario'
import { lineIndex, useGameLines } from '../script/scriptData'
import { DEFAULT_WORD, type TeamDoc, type WordProgress } from '../types'
import { resetWordAreas, saveWordAreas, useWordAreas, wordAreasToCode, type WordArea } from './wordAreas'

/** 「クリア！」を見せる長さ */
const CLEAR_MS = 2600
/** 「せいかい！」「最初から！」を見せる長さ */
const FLASH_MS = 1300

/** 会話の台詞は script/gameScenes.ts（セリフ編集の「ルール説明」など） */
type Line = NovelLine
const ROOM_GOAL = '必要なアイテムがあれば、発送してから部屋に向かおう。'
const CHAIR_GOAL = 'イスの上に立つのは禁止。イスの上にモノを置くのは大丈夫。'

/** ルール説明（st3-rule）の行ごとに見せる見本。「テブクロ → ネブクロ → クロネコ」 */
const RULE_DEMO: Record<string, { label: string; word: string }> = {
  demo1: { label: '押さえるワード', word: 'テブクロ' },
  demo2: { label: '押さえるワード', word: 'テブクロ' },
  demo3: { label: '問題', word: '眠る時に使うもの' },
  demo4: { label: '問題', word: '眠る時に使うもの' },
  demo5: { label: '答え', word: 'ネブクロ' },
  demo6: { label: '答え', word: 'クロネコ' },
}
/** 部屋でやるお題 */
const THEME = 'クリスマスツリー'

export interface WordSet {
  /** 最初に押さえるワード（そのまま見せる） */
  start: string
  /** [問題文, 答え]。答えは前のワードから一文字だけ変えたもの */
  steps: [string, string][]
}

export const WORD_GAMES: WordSet[] = [
  {
    start: 'ブレンド',
    steps: [
      ['算数で使うもの', 'ブンドキ'],
      ['入れもの', 'ドンブリ'],
      ['きのみ', 'ドングリ'],
      ['部屋のひとつ', 'リビング'],
      ['音が鳴るもの', 'ヨビリン'],
    ],
  },
  {
    start: 'ロッカー',
    steps: [
      ['スポーツの名前', 'サッカー'],
      ['イベントの名前', 'サーカス'],
      ['身に着けるもの', 'スカート'],
      // トーストは「ト」の丸に指が2本乗る
      ['食べ物', 'トースト'],
      ['冬の遊び', 'スケート'],
    ],
  },
]
/** 画像の縦横比（public/BG/Stage3 の画像に合わせる） */
export const ASPECT: Record<1 | 2 | 3, string> = { 1: '740 / 505', 2: '746 / 505', 3: '742 / 466' }

/** 文字ごとの数（並び順は問わない） */
function bag(word: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const ch of Array.from(word)) m.set(ch, (m.get(ch) ?? 0) + 1)
  return m
}
function sameBag(a: Map<string, number>, b: Map<string, number>) {
  if (a.size !== b.size) return false
  for (const [k, n] of a) if (b.get(k) !== n) return false
  return true
}

interface Props {
  doc: TeamDoc
  update: (patch: Partial<TeamDoc>) => void
  shopOpen: boolean
  /** 正しい注文が止められた。カイ・メイの話と椅子のダイアログを出す */
  chair: boolean
  onChairDone: () => void
}

/** ステージ3：押さえてワード。4本の指で丸を押さえ、一文字ずつ変えていく */
export default function WordGame({ doc, update, shopOpen, chair, onChairDone }: Props) {
  const word: WordProgress = { ...DEFAULT_WORD, ...doc.word }
  const wordRef = useRef(word)
  wordRef.current = word
  const setStep = (step: WordProgress['step']) => update({ word: { ...wordRef.current, step } })
  const debug = new URLSearchParams(location.search).get('debug') === 'true'

  const game = word.step === 'g2' ? 1 : 0
  const playing = word.step === 'g1' || word.step === 'g2'
  const { areas, saved } = useWordAreas(game)

  // 画面の外（注文ボタン）まで覆うため、会話などはプレイヤー画面の上に出す
  const [host, setHost] = useState<HTMLElement | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    setHost(rootRef.current?.closest<HTMLElement>('.screen.player') ?? null)
  }, [])
  const overlay = (node: ReactNode) => (host ? createPortal(node, host) : null)

  // ---------- 会話とダイアログ ----------
  const RULE = useGameLines('st3-rule')
  const AFTER_G1 = useGameLines('st3-after-g1')
  const AFTER_G2 = useGameLines('st3-after-g2')
  const CHAIR = useGameLines('st3-chair')
  // ラウンド2のあと：「room」の行から部屋の画面を見せる
  const roomFrom = lineIndex(AFTER_G2, 'room')
  const [talk, setTalk] = useState<{ lines: Line[]; idx: number; then?: () => void } | null>(null)
  const [dialog, setDialog] = useState<{ texts: string[]; idx: number; then?: () => void } | null>(null)
  const [clearFx, setClearFx] = useState(false)

  // ルール説明（入り直したときも、説明が済んでいなければ最初から）
  useEffect(() => {
    if (word.step === 'rule') setTalk({ lines: RULE, idx: 0, then: () => setStep('g1') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.step === 'rule'])

  // 正しい注文を止めに入る
  useEffect(() => {
    if (!chair) return
    setTalk({
      lines: CHAIR,
      idx: 0,
      then: onChairDone,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chair])

  // 画面を暗くして切り替える（out=暗くしていく / in=明るく戻る）
  const [fade, setFade] = useState<'out' | 'in' | null>(null)
  const nextTalk = () => {
    if (!talk || fade) return
    // 「ラウンド3に進みましょう」の次から部屋の画面：暗くして切り替え、下のボタンも出す
    if (talk.lines === AFTER_G2 && roomFrom >= 0 && talk.idx + 1 === roomFrom) {
      const next = { ...talk, idx: talk.idx + 1 }
      setFade('out')
      setTimeout(() => {
        setStep('room')
        setTalk(next)
        setFade('in')
        setTimeout(() => setFade(null), 1200)
      }, 600)
      return
    }
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
  const nextDialog = () => {
    if (!dialog) return
    if (dialog.idx + 1 < dialog.texts.length) return setDialog({ ...dialog, idx: dialog.idx + 1 })
    setDialog(null)
    dialog.then?.()
  }

  const onClear = () => {
    const second = wordRef.current.step === 'g2'
    setClearFx(true)
    setTimeout(() => {
      setClearFx(false)
      if (second)
        setTalk({
          lines: AFTER_G2,
          idx: 0,
          then: () => setStep('room'),
        })
      else setTalk({ lines: AFTER_G1, idx: 0, then: () => setStep('g2') })
    }, CLEAR_MS)
  }

  // ---------- エリア編集（?debug=true） ----------
  const [editing, setEditing] = useState(false)
  const [debugMenu, setDebugMenu] = useState(false)

  const line = talk?.lines[talk.idx]
  const busy = !!talk || !!dialog || clearFx

  // ラウンド2のあと「room」の行からは、まだ step が g2 のままでも、部屋の画面に切り替える
  const showRoom = word.step === 'room' || (talk?.lines === AFTER_G2 && roomFrom >= 0 && talk.idx >= roomFrom)
  // お題は「ワードはこちら。」（theme）の行で出す。それより前の行では、お題の場所だけ空けておく
  const themeFrom = lineIndex(AFTER_G2, 'theme')
  const themeShown = !(talk?.lines === AFTER_G2 && themeFrom >= 0 && talk.idx < themeFrom)
  const roomView = (
    <div className="word-room">
      <div className="word-head">
        <div className={`word-theme${themeShown ? ' is-pop' : ''}`} style={themeShown ? undefined : { visibility: 'hidden' }}>
          お題<b>{THEME}</b>
        </div>
        <div className="word-sub">{word.chairTold ? CHAIR_GOAL : ROOM_GOAL}</div>
      </div>
      <div className="word-field">
        <div className="word-stage" style={{ aspectRatio: ASPECT[3] }}>
          <img className="hide-bg" src={st3GameImage(3)} alt="" />
        </div>
      </div>
    </div>
  )

  let view: ReactNode
  if (editing && playing) {
    view = (
      <AreaEditor
        areas={areas}
        saved={saved}
        image={st3GameImage(game === 1 ? 2 : 1)}
        aspect={ASPECT[game === 1 ? 2 : 1]}
        round
        boxLabel={(a) => a.label}
        onSave={(next) => saveWordAreas(game, next)}
        onReset={() => resetWordAreas(game)}
        toCode={(next) => wordAreasToCode(game, next)}
        codeHint={`wordAreas.ts の DEFAULT_WORD_AREAS_${game + 1} に貼れます`}
        onClose={() => setEditing(false)}
      />
    )
  } else if (showRoom) {
    view = roomView
  } else if (playing) {
    view = (
      <WordBoard
        key={game}
        label={`${game + 1}ゲーム目`}
        set={WORD_GAMES[game]}
        areas={areas}
        image={st3GameImage(game === 1 ? 2 : 1)}
        aspect={ASPECT[game === 1 ? 2 : 1]}
        debug={debug}
        paused={busy}
        onClear={onClear}
      />
    )
  } else {
    // ルール説明中は1ゲーム目の画面を見せておく（触れない）。見本のワードを上に出す
    const demo = word.step === 'rule' && talk?.lines === RULE ? RULE_DEMO[RULE[talk.idx]?.id ?? ''] : undefined
    view = (
      <div className="word-room">
        {/* 見本が無いときも、見本の分の高さは空けておく（背景がずれないように） */}
        <div className="word-head">
          {demo && (
            <div className="word-demo" key={demo.word}>
              <div className="word-label">見本</div>
              <div className="word-prompt">
                <small>{demo.label}</small>
                <b>{demo.word}</b>
              </div>
            </div>
          )}
        </div>
        <div className="word-field">
          <div className="word-stage" style={{ aspectRatio: ASPECT[1] }}>
            <img className="hide-bg" src={st3GameImage(1)} alt="" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="word-game" ref={rootRef}>
      {view}


      {/* ?debug=true の隠しメニュー（左上の角を押すと開く）：エリア編集・強制クリア */}
      {debug && playing && !busy && (
        <div className="debug-hidden">
          <button className="debug-hidden-tap" aria-label="デバッグメニュー" onClick={() => setDebugMenu((o) => !o)} />
          {debugMenu && (
            <div className="debug-hidden-menu">
              <button
                onClick={() => {
                  setEditing((e) => !e)
                  setDebugMenu(false)
                }}
              >
                {editing ? 'ゲームに戻る' : 'エリア編集'}
              </button>
              <button
                disabled={editing}
                onClick={() => {
                  setDebugMenu(false)
                  onClear()
                }}
              >
                強制クリア
              </button>
            </div>
          )}
        </div>
      )}

      {fade &&
        overlay(<div className={fade === 'out' ? 'fade-to-black' : 'fade-black is-quick'} />)}

      {clearFx && (
        <div className="word-clear">
          <div className="word-clear-ring" />
          <div className="word-clear-ring is-late" />
          <div className="word-clear-text">クリア！</div>
        </div>
      )}


      {line &&
        overlay(
          <>
            <div className="hide-catch" onClick={nextTalk} />
            <GameTalk line={line} compact={shopOpen} low={!showRoom} />
          </>,
        )}

      {dialog &&
        overlay(
          <div className="hide-goal-back">
            <div className="hide-goal word-goal" key={dialog.idx}>
              <p>{dialog.texts[dialog.idx]}</p>
              <button onClick={nextDialog}>OK</button>
            </div>
          </div>,
        )}
    </div>
  )
}

interface BoardProps {
  label: string
  set: WordSet
  areas: WordArea[]
  image: string
  aspect: string
  debug: boolean
  /** 会話などが出ている間は、触っても判定しない */
  paused: boolean
  onClear: () => void
}

/** 丸の当たり判定の広さ（見えている丸の半径に対する倍率） */
const HIT_SCALE = 1.3
/** 指が離れても、押さえたままとみなす時間 */
const GRACE_MS = 1500

/**
 * 押さえてワードの盤面。指（ポインター）がどの丸に乗っているかを数えて判定する。
 * ・最初のワードを4本で押さえるとスタート
 * ・次のワードと同じ文字の組み合わせになったら成功。5回成功でクリア
 * ・変わらない文字の指が離れたら、最初のワードからやり直し
 * ?debug=true のときは、マウスのクリックで指を置く・外すを切り替えられる（Shift+クリックで同じ丸に2本目）
 */
export function WordBoard({ label, set, areas, image, aspect, debug, paused, onClear }: BoardProps) {
  const words = useMemo(() => [set.start, ...set.steps.map((s) => s[1])], [set])
  const stageRef = useRef<HTMLDivElement>(null)
  // ポインター → 乗っている丸の id（丸の外なら null）
  const fingers = useRef(new Map<string, string | null>())
  const [held, setHeld] = useState<string[]>([])
  // 次に押さえるワードの番号（0=最初のワード）
  const [idx, setIdx] = useState(0)
  const idxRef = useRef(0)
  const [flash, setFlash] = useState<{ kind: 'start' | 'ok' | 'miss'; n: number } | null>(null)
  const done = useRef(false)
  const areasRef = useRef(areas)
  areasRef.current = areas
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), FLASH_MS)
    return () => clearTimeout(t)
  }, [flash])

  const go = (i: number) => {
    ghosts.current = []
    idxRef.current = i
    setIdx(i)
  }

  const hit = (clientX: number, clientY: number): string | null => {
    const el = stageRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const px = ((clientX - r.left) / r.width) * 100
    const py = ((clientY - r.top) / r.height) * 100
    // 丸（楕円）の中か。指で押さえやすいよう、見えている丸より広く取る。重なるときは中心に近い方
    let best: { id: string; d: number } | null = null
    for (const a of areasRef.current) {
      const dx = (px - (a.x + a.w / 2)) / (a.w / 2)
      const dy = (py - (a.y + a.h / 2)) / (a.h / 2)
      const d = dx * dx + dy * dy
      if (d <= HIT_SCALE * HIT_SCALE && (!best || d < best.d)) best = { id: a.id, d }
    }
    return best?.id ?? null
  }

  // 指が離れた（丸から外れた）丸。GRACE_MS のあいだは、まだ押さえているものとして「離れてない」判定に数える
  const ghosts = useRef<{ id: string; until: number }[]>([])
  const lose = (id: string | null | undefined) => {
    if (!id) return
    ghosts.current.push({ id, until: Date.now() + GRACE_MS })
    setTimeout(evaluate, GRACE_MS + 30)
  }
  /** その丸に指が戻ってきたら、待っていた分を1つ消す */
  const regain = (id: string | null) => {
    if (!id) return
    const i = ghosts.current.findIndex((g) => g.id === id)
    if (i >= 0) ghosts.current.splice(i, 1)
  }

  const evaluate = () => {
    setHeld([...fingers.current.values()].filter((v): v is string => !!v))
    if (done.current || pausedRef.current) return
    const letterOf = new Map(areasRef.current.map((a) => [a.id, a.label]))
    const counts = new Map<string, number>()
    for (const id of fingers.current.values()) {
      const l = id ? letterOf.get(id) : undefined
      if (l) counts.set(l, (counts.get(l) ?? 0) + 1)
    }
    // 離れたばかりの指（猶予のあいだ）を足した数。「離れてない」の判定だけに使う
    const now = Date.now()
    ghosts.current = ghosts.current.filter((g) => g.until > now)
    const withGrace = new Map(counts)
    for (const g of ghosts.current) {
      const l = letterOf.get(g.id)
      if (l) withGrace.set(l, (withGrace.get(l) ?? 0) + 1)
    }
    const i = idxRef.current
    const target = bag(words[i])
    if (sameBag(counts, target)) {
      if (i === words.length - 1) {
        done.current = true
        go(i + 1)
        onClear()
        return
      }
      go(i + 1)
      setFlash({ kind: i === 0 ? 'start' : 'ok', n: Date.now() })
      return
    }
    if (i === 0) return
    // 変わらない文字は、押さえたままでないといけない
    const cur = bag(words[i - 1])
    for (const [l, n] of cur) {
      const keep = Math.min(n, target.get(l) ?? 0)
      if ((withGrace.get(l) ?? 0) < keep) {
        go(0)
        setFlash({ kind: 'miss', n: Date.now() })
        return
      }
    }
  }

  const down = (e: React.PointerEvent) => {
    e.preventDefault()
    // クリアしたら、もう背景のエリアは押せない
    if (done.current) return
    if (debug && e.pointerType === 'mouse') {
      // クリックで置く・外す。Shift+クリックは同じ丸にもう1本置く（トーストの「ト」用）
      const id = hit(e.clientX, e.clientY)
      if (!id) return
      const mine = [...fingers.current.keys()].filter((k) => k.startsWith(`m${id}:`))
      if (mine.length && !e.shiftKey) fingers.current.delete(mine[mine.length - 1])
      else fingers.current.set(`m${id}:${Date.now()}`, id)
      evaluate()
      return
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 取れなくても判定はできる */
    }
    const id = hit(e.clientX, e.clientY)
    regain(id)
    fingers.current.set(`p${e.pointerId}`, id)
    evaluate()
  }
  const move = (e: React.PointerEvent) => {
    if (done.current) return
    const k = `p${e.pointerId}`
    if (!fingers.current.has(k)) return
    const id = hit(e.clientX, e.clientY)
    const before = fingers.current.get(k)
    if (before === id) return
    // 丸の外へ出ただけなら、少しのあいだは押さえている扱い。別の丸に乗ったら、その丸で待っていた分を消す
    if (!id) lose(before)
    else regain(id)
    fingers.current.set(k, id)
    evaluate()
  }
  const up = (e: React.PointerEvent) => {
    const k = `p${e.pointerId}`
    const before = fingers.current.get(k)
    if (fingers.current.delete(k)) {
      lose(before)
      evaluate()
    }
  }

  const cleared = idx >= words.length
  const step = Math.min(idx, words.length - 1)
  const success = Math.max(0, Math.min(idx, words.length) - 1)
  const heldSet = new Set(cleared ? [] : held)

  return (
    <div className="word-room">
      <div className="word-head">
        <div className="word-label">{label}</div>
        {idx === 0 ? (
          <div className="word-prompt">
            <small>押さえるワード</small>
            <b>{set.start}</b>
          </div>
        ) : (
          <div className="word-prompt">
            {!cleared && <small>問題</small>}
            <b>{cleared ? 'クリア！' : set.steps[step - 1][0]}</b>
          </div>
        )}
        <div className="word-progress" aria-label={`${success}回成功`}>
          {set.steps.map((_, i) => (
            <i key={i} className={i < success ? 'is-on' : ''} />
          ))}
        </div>
      </div>
      <div className="word-sub">
        {idx === 0
          ? '一人2本ずつ、4本の指で押さえよう'
          : cleared
            ? ''
            : `いまのワード「${words[step - 1]}」から一文字だけ変えて押さえよう。変わらない文字の指は離さないでね`}
      </div>
      <div className="word-field">
        <div
          className={`word-stage is-play${cleared ? ' is-done' : ''}`}
          ref={stageRef}
          style={{ aspectRatio: aspect }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onContextMenu={(e) => e.preventDefault()}
        >
          <img className="hide-bg" src={image} alt="" draggable={false} />
          {areas.map((a) => (
            <div
              key={a.id}
              className={`word-spot${heldSet.has(a.id) ? ' is-held' : ''}${debug ? ' is-debug' : ''}`}
              style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%` }}
            >
              {debug && <span>{a.label}</span>}
            </div>
          ))}
        </div>
      </div>
      {flash && (
        <div className={`word-flash is-${flash.kind}`} key={flash.n}>
          {flash.kind === 'start' ? 'スタート！' : flash.kind === 'ok' ? 'せいかい！' : '指が離れちゃった！最初からやり直し'}
        </div>
      )}
    </div>
  )
}

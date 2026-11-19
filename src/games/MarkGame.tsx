import { useEffect, useRef, useState } from 'react'
import { hl, useLineSound } from '../components/GameTalk'
import { TenKeyPad } from '../components/TenKey'
import { lineImage } from '../script/gameScenes'
import { useGameLines } from '../script/scriptData'
import type { GameProps } from './index'

/** ステージ1：マークの点数当て（ゲーム1）。ボタンの絵は public/BG/Stage1/mark1〜5.webp */
const MARK_DIR = `${import.meta.env.BASE_URL}BG/Stage1/`
export const MARKS = [
  { id: 'sun', label: '太陽', image: `${MARK_DIR}mark1.webp`, answer: 30 },
  { id: 'umbrella', label: '傘', image: `${MARK_DIR}mark2.webp`, answer: 20 },
  { id: 'cloud', label: '雲', image: `${MARK_DIR}mark3.webp`, answer: 10 },
  { id: 'snow', label: '雪の結晶', image: `${MARK_DIR}mark4.webp`, answer: 0 },
  { id: 'bolt', label: '雷', image: `${MARK_DIR}mark5.webp`, answer: 1 },
] as const
/** 全マークの答え（シーンジャンプ・強制クリアで使う） */
export const ALL_MARK_SCORES: Record<string, number> = Object.fromEntries(MARKS.map((m) => [m.id, m.answer]))
/** ゲーム1の背景 */
const MARK_BG = `${MARK_DIR}1st_back_1.webp`

type MarkId = (typeof MARKS)[number]['id']

/** 1つの欄に入力できる最大桁数 */
const MAX_DIGITS = 3
/** 5つとも正しく埋まってから、次のセリフに進むまでの間（打ち終わった数字が見えるように） */
const JUDGE_DELAY = 600
/** 5つ埋まって間違っているとき、不正解のセリフを出すまでの間（「1」→「10」のように打っている途中で出さないよう、長めに待つ） */
const WRONG_DELAY = 1500

/** 案内役のエルフの台詞の種類。台詞は script/gameScenes.ts（セリフ編集の「マーク当て中」など） */
type Guide = 'start' | 'wrong' | 'done'

const ALL_SOLVED = Object.fromEntries(MARKS.map((m) => [m.id, m.answer])) as Partial<Record<MarkId, number>>
const toInputs = (s: Partial<Record<MarkId, number>>) =>
  Object.fromEntries(MARKS.map((m) => [m.id, s[m.id] !== undefined ? String(s[m.id]) : ''])) as Record<MarkId, string>

/**
 * 5つのマークそれぞれの下に入力欄がある。欄を選んでテンキーで数字を入れると、その欄に残る（1問ずつの判定はしない）。
 * 5つとも埋まった時点で裏で答え合わせをして、全部正しければ次のセリフへ。違っていれば不正解のセリフ
 */
export default function MarkGame({ onClear, solved: allDone, scores, onScore }: GameProps) {
  // ?debug=true のときは、答えを左に出す
  const debug = new URLSearchParams(location.search).get('debug') === 'true'
  const [inputs, setInputs] = useState<Record<MarkId, string>>(() =>
    toInputs(allDone ? ALL_SOLVED : ((scores ?? {}) as Partial<Record<MarkId, number>>)),
  )
  const [selected, setSelected] = useState<MarkId | null>(allDone ? null : MARKS[0].id)
  const [guide, setGuide] = useState<Guide>('start')
  const mark = useGameLines('st1-mark')
  // 間違っているときは、何度目でも「マーク当て：1回目の不正解」のセリフ
  const miss = useGameLines('st1-mark-miss1')
  // mark-start=最初 / mark-done=全部わかった（マーク当て中）
  const one = (id: string) => mark.filter((l) => l.id === id)
  const GUIDE: Record<Guide, typeof mark> = {
    start: one('mark-start'),
    wrong: miss,
    done: one('mark-done'),
  }
  const [guideIdx, setGuideIdx] = useState(0)
  const say = (g: Guide) => {
    setGuide(g)
    setGuideIdx(0)
  }
  const cleared = useRef(false)
  const onClearRef = useRef(onClear)
  onClearRef.current = onClear

  // 隠しメニューの「ゲームを強制クリア」：各欄に正解を自動で入力する（そのあとは、ふつうに解いたときと同じ流れ）
  useEffect(() => {
    const force = () => {
      setInputs(toInputs(ALL_SOLVED))
      setSelected(null)
    }
    window.addEventListener('mpx:force-clear', force)
    return () => window.removeEventListener('mpx:force-clear', force)
  }, [])

  const allFilled = MARKS.every((m) => inputs[m.id] !== '')
  const allRight = allFilled && MARKS.every((m) => Number(inputs[m.id]) === m.answer)

  // 5つ埋まったら裏で答え合わせ（判定ボタンはない）。全部正しければ次へ、違えば不正解のセリフ。少し待つあいだに書き換えたら、やり直し
  useEffect(() => {
    if (!allFilled || allDone || cleared.current) return
    if (!allRight) {
      const t = setTimeout(() => say('wrong'), WRONG_DELAY)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => {
      if (cleared.current) return
      cleared.current = true
      MARKS.forEach((m) => onScore?.(m.id, m.answer))
      setSelected(null)
      say('done')
      setTimeout(() => onClearRef.current(), 1500)
    }, JUDGE_DELAY)
    return () => clearTimeout(t)
  }, [inputs])

  const locked = allDone || cleared.current
  const pick = (id: MarkId) => {
    if (locked) return
    setSelected(id)
  }
  const edit = (f: (v: string) => string) => {
    if (!selected || locked) return
    setInputs((s) => ({ ...s, [selected]: f(s[selected]) }))
  }
  /** 「次へ」：右どなりの欄へ（最後の欄なら最初へ） */
  const next = () => {
    if (!selected) return
    const i = MARKS.findIndex((m) => m.id === selected)
    setSelected(MARKS[(i + 1) % MARKS.length].id)
  }

  // 「消す」を長押しすると、選んでいる欄を全部消す
  const delTimer = useRef<number | null>(null)
  const delLong = useRef(false)
  const delDown = () => {
    delLong.current = false
    delTimer.current = window.setTimeout(() => {
      delLong.current = true
      edit(() => '')
    }, 600)
  }
  const delUp = () => {
    if (delTimer.current != null) window.clearTimeout(delTimer.current)
    delTimer.current = null
  }

  const speak = GUIDE[guide][Math.min(guideIdx, GUIDE[guide].length - 1)]
  useLineSound(speak)

  return (
    <div className="game mark-game is-speak-bottom">
      <img className="mark-bg" src={MARK_BG} alt="" />
      {debug && (
        <ul className="mark-debug" aria-hidden>
          {MARKS.map((m) => (
            <li key={m.id}>
              <img src={m.image} alt="" />
              <b>{m.answer}</b> {m.label}
            </li>
          ))}
        </ul>
      )}
      <div className="mark-body">
       <div className="mark-panel is-five">
        <div className="mark-row">
          {MARKS.map((m, i) => (
            <button
              key={m.id}
              className={`mark-cell${selected === m.id ? ' is-selected' : ''}${inputs[m.id] !== '' ? ' is-filled' : ''}`}
              aria-label={`${i + 1}問目 ${m.label}`}
              onClick={() => pick(m.id)}
            >
              <img className="mark-img" src={m.image} alt="" draggable={false} />
              <span className="mark-input" aria-live="polite">{inputs[m.id]}</span>
            </button>
          ))}
        </div>
        {/* テンキーは、ソックスキーのナゾと同じ部品（大きさ・見た目が同じ）。OK の代わりに「次へ」で右の欄に移る */}
        <TenKeyPad
          className={`mark-keypad${selected && !locked ? '' : ' is-idle'}`}
          disabled={!selected || locked}
          okLabel="次へ"
          onKey={(d) => edit((v) => (v.length < MAX_DIGITS ? v + d : v))}
          onDelete={() => {
            if (!delLong.current) edit((v) => v.slice(0, -1))
          }}
          onOk={next}
          deleteProps={{ onPointerDown: delDown, onPointerUp: delUp, onPointerLeave: delUp }}
        />
       </div>
      </div>
      {/* すべて分かったあとは、続きの説明（画面の上に出る会話）に任せる */}
      {!allDone && speak?.slide && <img className="game-slide" src={speak.slide} alt="" />}
      {!allDone && speak && (
        <div className="mark-speak is-bottom">
          <img className="mark-speak-icon" src={lineImage(speak)} alt="" />
          <div
            className={`mark-speak-box${guideIdx + 1 < GUIDE[guide].length ? ' is-more' : ''}`}
            key={`${guide}${guideIdx}`}
            onClick={() => setGuideIdx((i) => Math.min(i + 1, GUIDE[guide].length - 1))}
          >
            {hl(speak.text)}
          </div>
        </div>
      )}
    </div>
  )
}

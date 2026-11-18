import { useEffect, useRef, useState } from 'react'
import { KV_IMAGE } from '../config'
import { hl, useLineSound } from '../components/GameTalk'
import { lineImage } from '../script/gameScenes'
import { useGameLines } from '../script/scriptData'
import type { GameProps } from './index'

/** ステージ1：マークの点数当て。点数は 0〜9 の一桁 */
const MARKS = [
  { id: 'heart', label: 'ハート', symbol: '❤️', answer: 1 },
  { id: 'note', label: '音符', symbol: '🎵', answer: 2 },
  { id: 'diamond', label: '菱形', symbol: '◆', answer: 3 },
  { id: 'star', label: '星', symbol: '⭐', answer: 0 },
] as const

type MarkId = (typeof MARKS)[number]['id']

/** テンキー：数字は横一列、その右に「消す」「確定」 */
const DIGIT_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const
const ACTION_KEYS = ['DEL', 'OK'] as const
const KEYS = [...DIGIT_KEYS, ...ACTION_KEYS] as const
/** 入力できる最大桁数 */
const MAX_DIGITS = 9

/** 案内役のエルフの台詞の種類。台詞は script/gameScenes.ts（セリフ編集の「マーク当て中」など） */
type Guide = 'start' | 'picking' | 'wrongFirst' | 'wrong' | 'right' | 'done'

const ALL_SOLVED = Object.fromEntries(MARKS.map((m) => [m.id, m.answer])) as Partial<Record<MarkId, number>>

export default function MarkGame({ onClear, solved: allDone }: GameProps) {
  const [solved, setSolved] = useState<Partial<Record<MarkId, number>>>(allDone ? ALL_SOLVED : {})
  const [selected, setSelected] = useState<MarkId | null>(null)
  const [input, setInput] = useState('')
  const [guide, setGuide] = useState<Guide>('start')
  const mark = useGameLines('st1-mark')
  const missFirst = useGameLines('st1-mark-miss1')
  const miss = useGameLines('st1-mark-miss')
  // 0=最初・選んだとき / 1=正解 / 2=全部わかった（マーク当て中）、不正解は別の場面
  const GUIDE: Record<Guide, typeof mark> = {
    start: mark.slice(0, 1),
    picking: mark.slice(0, 1),
    right: mark.slice(1, 2),
    done: mark.slice(2, 3),
    wrongFirst: missFirst,
    wrong: miss,
  }
  const [guideIdx, setGuideIdx] = useState(0)
  const missed = useRef(false)
  const say = (g: Guide) => {
    setGuide(g)
    setGuideIdx(0)
  }
  const cleared = useRef(false)
  const onClearRef = useRef(onClear)
  onClearRef.current = onClear

  const allSolved = MARKS.every((m) => solved[m.id] !== undefined)

  useEffect(() => {
    if (!allSolved || allDone) return
    say('done')
    const t = setTimeout(() => {
      if (cleared.current) return
      cleared.current = true
      onClearRef.current()
    }, 1500)
    return () => clearTimeout(t)
  }, [allSolved])

  const pick = (id: MarkId) => {
    if (solved[id] !== undefined) return
    setSelected(id)
    setInput('')
    say('picking')
  }

  const press = (key: (typeof KEYS)[number]) => {
    if (!selected) return
    if (key === 'DEL') setInput((v) => v.slice(0, -1))
    else if (key === 'OK') confirm()
    else setInput((v) => (v.length < MAX_DIGITS ? v + key : v))
  }

  const confirm = () => {
    if (!selected || input === '') return
    const mark = MARKS.find((m) => m.id === selected)!
    if (Number(input) === mark.answer) {
      setSolved((s) => ({ ...s, [selected]: mark.answer }))
      setSelected(null)
      setInput('')
      say('right')
    } else {
      setInput('')
      say(missed.current ? 'wrong' : 'wrongFirst')
      missed.current = true
    }
  }

  const speak = GUIDE[guide][Math.min(guideIdx, GUIDE[guide].length - 1)]
  useLineSound(speak)

  return (
    <div className="game mark-game">
      <img className="mark-bg" src={KV_IMAGE} alt="" />
      <div className="mark-body">
        <div className="mark-grid">
          {MARKS.map((m) => {
            const answer = solved[m.id]
            return (
              <div key={m.id} className="mark-slot">
                <span className="mark-score">{answer !== undefined ? answer : ''}</span>
                <button
                  className={`mark-btn${selected === m.id ? ' is-selected' : ''}${answer !== undefined ? ' is-solved' : ''}`}
                  aria-label={m.label}
                  disabled={answer !== undefined}
                  onClick={() => pick(m.id)}
                >
                  <span className="mark-symbol" aria-hidden>{m.symbol}</span>
                </button>
              </div>
            )
          })}
        </div>
        <div className="mark-pad">
          <div className="mark-input" aria-live="polite">{input || ' '}</div>
          <div className="mark-keypad">
            <div className="key-row digits">
              {DIGIT_KEYS.map((k) => (
                <button key={k} className="key-btn" onClick={() => press(k)}>{k}</button>
              ))}
            </div>
            <div className="key-row actions">
              <button className="key-btn is-del" onClick={() => press('DEL')}>消す</button>
              <button className="key-btn is-ok" disabled={!selected || input === ''} onClick={() => press('OK')}>確定</button>
            </div>
          </div>
        </div>
      </div>
      {/* すべて分かったあとは、続きの説明（画面の上に出る会話）に任せる */}
      {!allDone && speak?.slide && <img className="game-slide" src={speak.slide} alt="" />}
      {!allDone && speak && (
        <div className="mark-speak">
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

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

/** 入力できる最大桁数 */
const MAX_DIGITS = 9

/** 案内役のエルフの台詞の種類。台詞は script/gameScenes.ts（セリフ編集の「マーク当て中」など） */
type Guide = 'start' | 'picking' | 'wrongFirst' | 'wrong' | 'right' | 'done'

const ALL_SOLVED = Object.fromEntries(MARKS.map((m) => [m.id, m.answer])) as Partial<Record<MarkId, number>>

export default function MarkGame({ onClear, solved: allDone, scores, onScore }: GameProps) {
  // ?debug=true のときは、答えを左に出す
  const debug = new URLSearchParams(location.search).get('debug') === 'true'
  const [solved, setSolved] = useState<Partial<Record<MarkId, number>>>(allDone ? ALL_SOLVED : ((scores ?? {}) as Partial<Record<MarkId, number>>))
  const [selected, setSelected] = useState<MarkId | null>(null)
  const [input, setInput] = useState('')
  const [guide, setGuide] = useState<Guide>('start')
  const mark = useGameLines('st1-mark')
  const missFirst = useGameLines('st1-mark-miss1')
  const miss = useGameLines('st1-mark-miss')
  // mark-start=最初・選んだとき / mark-right=正解 / mark-done=全部わかった（マーク当て中）、不正解は別の場面
  const one = (id: string) => mark.filter((l) => l.id === id)
  const GUIDE: Record<Guide, typeof mark> = {
    start: one('mark-start'),
    picking: one('mark-start'),
    right: one('mark-right'),
    done: one('mark-done'),
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

  // 隠しメニューの「ゲームを強制クリア」：各マークに正解を自動で入力する（そのあとは、ふつうに解いたときと同じ流れ）
  useEffect(() => {
    const force = () => {
      Object.entries(ALL_SOLVED).forEach(([id, a]) => onScore?.(id, a as number))
      setSolved(ALL_SOLVED)
      setSelected(null)
      setInput('')
    }
    window.addEventListener('mpx:force-clear', force)
    return () => window.removeEventListener('mpx:force-clear', force)
  }, [])

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
    // マークを選んでも、吹き出しは変えない（「その調子！」などが出ていれば、そのまま）
  }

  const press = (key: string) => {
    if (!selected) return
    if (key === 'DEL') setInput((v) => v.slice(0, -1))
    else if (key === 'OK') confirm()
    else setInput((v) => (v.length < MAX_DIGITS ? v + key : v))
  }

  // 「消す」を長押しすると、入力を全部消す
  const delTimer = useRef<number | null>(null)
  const delLong = useRef(false)
  const delDown = () => {
    delLong.current = false
    delTimer.current = window.setTimeout(() => {
      delLong.current = true
      setInput('')
    }, 600)
  }
  const delUp = () => {
    if (delTimer.current != null) window.clearTimeout(delTimer.current)
    delTimer.current = null
  }

  const confirm = () => {
    if (!selected || input === '') return
    const mark = MARKS.find((m) => m.id === selected)!
    if (Number(input) === mark.answer) {
      setSolved((s) => ({ ...s, [selected]: mark.answer }))
      onScore?.(selected, mark.answer)
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
       <div className="mark-panel">
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
                  <img className="mark-img" src={m.image} alt="" draggable={false} />
                </button>
              </div>
            )
          })}
        </div>
        <div className="mark-entry">
          {/* 入力欄：区切りのない1つの枠（ソックスキーのナゾの枠と同じ色づかい） */}
          <div className={`mark-answer${selected ? ' is-cur' : ''}`} aria-live="polite">
            {input}
          </div>
          {/* テンキーは、ソックスキーのナゾと同じ部品（大きさ・見た目が同じ） */}
          <TenKeyPad
            className={`mark-keypad${selected ? '' : ' is-idle'}`}
            disabled={!selected}
            okDisabled={input === ''}
            onKey={(d) => press(d)}
            onDelete={() => {
              if (!delLong.current) press('DEL')
            }}
            onOk={() => press('OK')}
            deleteProps={{ onPointerDown: delDown, onPointerUp: delUp, onPointerLeave: delUp }}
          />
        </div>
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

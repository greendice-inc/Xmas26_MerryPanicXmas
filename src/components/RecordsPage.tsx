import { useEffect, useRef, useState } from 'react'
import { GAME_COUNT } from '../config'
import { hl } from './GameTalk'
import { MARKS } from '../games/MarkGame'
import { RECORDS } from '../scenario'

/**
 * 「記録」の画面。ステージごとのタブが左に並び、進んだステージから順に増えていく。
 * 文字だけの記録（st4-r1）は、textOf で渡された行を並べる。
 */
export default function RecordsPage({
  unlocked,
  records,
  textOf,
  iconOf = {},
  titleOf = {},
  markScores = {},
  onClose,
}: {
  /** ここまでのステージのタブだけを出す */
  unlocked: number
  records: string[]
  textOf: Record<string, string[]>
  /** 文字の記録の左に置くアイコン */
  iconOf?: Record<string, string>
  /** 見出しを、RECORDS の title から差し替える（キモチの「◯◯のキモチ」など） */
  titleOf?: Record<string, string>
  /** 「マークのルール」に出す、答えが合ったマークと得点 */
  markScores?: Record<string, number>
  onClose: () => void
}) {
  const [stage, setStage] = useState(Math.min(Math.max(unlocked, 1), GAME_COUNT))
  const list = records.filter((id) => RECORDS[id]?.stage === stage)

  // バーは出さず、ドラッグでページを送る。下に続きがあるときは、ぼかしと▼でサインを出す（Santazon のリストと同じ）
  const bodyRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: number; y: number; top: number; moved: boolean } | null>(null)
  const [more, setMore] = useState({ below: false, atTop: false })
  const check = () => {
    const el = bodyRef.current
    const below = !!el && el.scrollTop + el.clientHeight < el.scrollHeight - 4
    const atTop = below && !!el && el.scrollTop < 8
    setMore((p) => (p.below === below && p.atTop === atTop ? p : { below, atTop }))
  }
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
    check()
  }, [stage])
  useEffect(check, [list.length, markScores])
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // 指（タッチ）は、ブラウザ自身のスクロールに任せる。マウス・ペンだけドラッグで動かす
    if (e.pointerType === 'touch' || e.button !== 0) return
    dragRef.current = { id: e.pointerId, y: e.clientY, top: e.currentTarget.scrollTop, moved: false }
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    const el = bodyRef.current
    if (!d || !el || d.id !== e.pointerId) return
    // 画面は拡縮されているので、ポインタの動きを、この中の長さに直す
    const k = el.getBoundingClientRect().height / el.offsetHeight || 1
    const dy = (e.clientY - d.y) / k
    if (!d.moved && Math.abs(dy) < 8) return
    if (!d.moved) {
      d.moved = true
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* 取れなくてもスクロールはできる */
      }
    }
    el.scrollTop = d.top - dy
  }
  const onUp = () => {
    dragRef.current = null
  }
  return (
    <div className="records-page">
      <header className="records-head">
        <h1>記録</h1>
        <button className="records-close" onClick={onClose}>もどる</button>
      </header>
      <nav className="records-tabs">
        {/* まだ着いていないステージのタブは出さない */}
        {Array.from({ length: Math.min(unlocked, GAME_COUNT) }, (_, i) => i + 1).map((n) => (
          <button key={n} className={`records-tab${n === stage ? ' is-on' : ''}`} onClick={() => setStage(n)}>
            Stage{n}
          </button>
        ))}
      </nav>
      <section className="records-main">
       <div className="records-body" ref={bodyRef} onScroll={check} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {list.length === 0 && <p className="records-empty">このステージの記録は、まだありません</p>}
        {list.map((id) =>
          id === 'st1-rule' ? (
            <figure key={id} className="records-rule">
              <figcaption className="records-name">{titleOf[id] ?? RECORDS[id].title}</figcaption>
              <p className="records-lead">
                リングを投げて、ターゲットに入れよう！
              </p>
              <h3>ルール</h3>
              <ul>
                <li>赤い線のうしろからリングを投げる。</li>
                <li>ターゲットにリングが通るとポイントが入る。</li>
                <li>{hl('リングがターゲットに通らなかった場合、{失格}となる。')}</li>
              </ul>
              <h3>ターゲットの条件</h3>
              <ul>
                <li>動物であること。</li>
                <li>楽器を身に着けていること。</li>
                <li>マークが入ったタグを身に着けていること。</li>
              </ul>
              <h3>ゲームのマーク</h3>
              <ul>
                <li>ポイントは以下のマークによって決まる。</li>
              </ul>
              <div className="records-marks">
                {MARKS.map((m) => (
                  <div key={m.id} className="records-mark">
                    <img src={m.image} alt={m.label} />
                    <b>{markScores[m.id] ?? ''}</b>
                  </div>
                ))}
              </div>
            </figure>
          ) : iconOf[id] && textOf[id] ? (
            // アイコンつき：アイコンの右に、赤い見出しとその下の文
            <figure key={id} className="records-text">
              <div className="records-row">
                <img className="records-icon" src={iconOf[id]} alt="" />
                <div>
                  <figcaption className="records-name">{titleOf[id] ?? RECORDS[id].title}</figcaption>
                  {textOf[id].map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
                </div>
              </div>
            </figure>
          ) : (
            <figure key={id} className={textOf[id] ? 'records-text' : undefined}>
              <figcaption>{titleOf[id] ?? RECORDS[id].title}</figcaption>
              {textOf[id] ? (
                textOf[id].map((l, i) => <p key={i}>{l}</p>)
              ) : (
                <img src={RECORDS[id].image} alt="" />
              )}
            </figure>
          ),
        )}
       </div>
        {more.below && <div className="records-fade" aria-hidden />}
        {more.atTop && <div className="records-hint" aria-hidden>▼</div>}
      </section>
    </div>
  )
}

import { Fragment, useEffect, type ReactNode } from 'react'
import type { NovelLine } from '../scenario'
import { lineImage } from '../script/gameScenes'

/** 「{強調}」を赤字にする（吹き出しの span は話者名の札になるので、地の文は span で包まない） */
export function hl(text: string): ReactNode {
  return text
    .split(/(\{[^}]*\})/)
    .filter(Boolean)
    .map((s, i) => (s.startsWith('{') ? <b className="hl" key={i}>{s.slice(1, -1)}</b> : <Fragment key={i}>{s}</Fragment>))
}

/** 台詞が出たら効果音・音声を鳴らす。次の台詞に進んだら音声は止める */
export function useLineSound(line: NovelLine | undefined) {
  useEffect(() => {
    if (!line) return
    const play = (src?: string) => {
      if (!src) return null
      const a = new Audio(src)
      a.play().catch(() => {})
      return a
    }
    play(line.se)
    const voice = play(line.voice)
    return () => voice?.pause()
  }, [line])
}

/**
 * ゲーム画面の上で話す1行（セリフ編集の「ゲーム画面中」の場面）。
 * pos：bottom=下のボタンのすぐ上 / corner=右上に小さく / top=画面の上 / shop=Santazon を開いている間の左下。
 * wide=Santazon を開いている間の吹き出しを、画面の右端まで伸ばす（右下のボタンに重ねてよいとき）。
 * dim=しゃべっている間、背景をうっすら暗くする（照らす枠を出しているときは false）。
 * low=下のボタンを出していないので、画面の一番下に出す（位置を決めていない行だけ） / compact=Santazon を開いているので小さめにする / wait=タップで進めない（▼を出さない）
 */
export default function GameTalk({ line, compact, wait, low, dim = true, wide }: { line: NovelLine; compact?: boolean; wait?: boolean; low?: boolean; dim?: boolean; wide?: boolean }) {
  useLineSound(line)
  // Santazon を開いている間は、行の位置の指定に関わらず、いつも一番下（左下）で話す
  const pos = compact ? ` is-shop${wide ? ' is-wide' : ''}` : line.pos && line.pos !== 'bottom' ? ` is-${line.pos}` : low ? ' is-low' : ''
  return (
    <>
      {dim && <div className="talk-dim" />}
      {line.slide && <img className="game-slide" src={line.slide} alt="" />}
      <div className={`hide-elf guide-talk${pos}${wait ? ' is-wait' : ''}`}>
        <img src={lineImage(line)} alt="" />
        <p>
          <span>{line.speaker}</span>
          {hl(line.text)}
          {!wait && <i>▼</i>}
        </p>
      </div>
    </>
  )
}

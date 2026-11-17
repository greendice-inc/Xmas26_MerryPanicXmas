import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { characterImage, type Emotion } from '../scenario'

/**
 * ステージ1の案内。ゲーム画面の上でエルフとリンが話し、
 * 決まった台詞では、ボタンなどの周りを暗くして、そこだけ明るく見せる（スポットライト）
 */

interface Rect {
  x: number
  y: number
  w: number
  h: number
}
/** スポットライトを当てる場所（1920×1200 の画面の座標） */
export const SPOTS = {
  /** 左下の「注文」ボタン */
  menuOrder: { x: 40, y: 1040, w: 595, h: 120 },
  /** Santazon のアイテムリスト */
  szList: { x: 40, y: 290, w: 1250, h: 870 },
  /** Santazon の「注文する」ボタン */
  szOrder: { x: 1370, y: 660, w: 521, h: 261 },
  /** ゲーム画面の「ソックスキーを導く」ボタン（styles.css の .sock-key-btn と合わせる） */
  sock: { x: 1478, y: 834, w: 210, h: 156 },
} satisfies Record<string, Rect>

export interface GuideLine {
  who: 'elf' | 'kid'
  text: string
  emotion?: Emotion
  /** 照らす場所 */
  spot?: keyof typeof SPOTS
  /** この台詞では、タップで進めず、プレイヤーの操作を待つ（shop=Santazon を開く / sock=ソックスキーを導くを押す） */
  wait?: 'shop' | 'sock'
  /** リンがリングを投げたカットイン（仮） */
  cutin?: boolean
  /** 吹き出しの位置（top=画面の上 / shop=Santazon のカートに重ならない左下） */
  pos?: 'top' | 'shop'
}
const elf = (text: string, more: Partial<GuideLine> = {}): GuideLine => ({ who: 'elf', text, ...more })
const rin = (text: string, more: Partial<GuideLine> = {}): GuideLine => ({ who: 'kid', text, emotion: '楽', ...more })

/** マークと得点がすべて分かったあと。マークの画面のまま、Santazon の使い方を説明する */
export const RULES_AFTER_MARK: GuideLine[] = [
  elf('順調にナゾが解けているようですね。\n続きの説明をしましょう。'),
  rin('私も解けたわ！', { emotion: '喜' }),
  elf('リングを投げるチャンスは、各チーム{1回切り}です。'),
  elf('床にある印の上に立って、リングを投げてもらうのですが、\nこのリングは、{自分で選んで発送する}必要があります。'),
  rin('オッケー！\nじゃあ私は準備するわね。'),
  elf('リンさんはもう分かっているようですが、\n大人の皆さんにはきちんと説明しておきましょう。'),
  elf('{アイテム発送システム「santazon」}について。'),
  elf('あなたたちは、santazonを利用してアイテムの発送を\nお願いすることができます。'),
  elf('そして、そのアイテムは大人部屋の\n{「宅配ソックス」}に届けられます。'),
  elf('使い方はとっても簡単。\nまずは画面左下のボタンを押して画面を切り替え……', { spot: 'menuOrder', wait: 'shop', pos: 'top' }),
  elf('アイテムリストから必要なアイテムを選び、\nカートに入れる。', { spot: 'szList', pos: 'shop' }),
  elf('そして「注文する」ボタンを押せば……', { spot: 'szOrder', pos: 'shop' }),
  elf('……おや、リンさんが輪を投げたようですね。', { pos: 'shop', emotion: '哀' }),
  rin('やったー！一番ポイントが高いところに掛かった！\nこれで1億点ゲットだわ！', { emotion: '喜', cutin: true, pos: 'shop' }),
  elf('……これで、リンさんのポイントは確定しました。', { pos: 'shop' }),
  elf('このゲームでのあなたたちの目的は\n{リンさんを勝たせる}ことです。', { pos: 'shop' }),
  elf('「失格」になってもいけません。\nそんなことをしたら子どもたちは\nガッカリしてしまうでしょう。', { pos: 'shop' }),
  elf('まずは、部屋のターゲットを確認してください。', { pos: 'shop' }),
  elf('用意されたターゲットはどちらの部屋も同じなので、\nリンさんのポイントも分かるはずです。', { pos: 'shop' }),
  elf('それから、目的を果たすために\n必要なアイテムを選んで、カートに入れて、\n「とりよせ」ボタンを押してください。', { pos: 'shop', emotion: '楽' }),
]

/** 正しい注文が届いたあと。宅配ソックスの開け方（ソックスキー）を説明する */
export const SOCK_TUTORIAL: GuideLine[] = [
  elf('なるほど。\nそれなら確かにリンさんを勝たせられそうですね。', { emotion: '楽' }),
  elf('さて、ここでもうひとつ説明します。\n{宅配ソックスの開け方}について。'),
  elf('宅配ソックスのフタは、ロックされており、\n{ソックスキー}の正しい番号を打ち込まないと開きません。'),
  elf('これからあなたたちは大人部屋に行って\n実際にリングを投げてもらうわけですが……'),
  elf('宅配ソックスを開けないと、届いたアイテムは使えません。\n正しいソックスキーを導いてから行く必要があります。'),
  elf('画面右下の「ソックスキーを導く」ボタンを押すと、\nソックスキーを導くためのナゾが表示されます。'),
  elf('実際に押してみましょう。', { spot: 'sock', wait: 'sock', pos: 'top' }),
  elf('このナゾを解いて、答えを変換すれば、\n4ケタのソックスキーを導くことができます。'),
  elf('ソックスキーが分かったら、下の欄に入力して\n正しいかどうかを確認しましょう！', { emotion: '楽' }),
]

/** 「{強調}」を赤字にする */
export function hl(text: string): ReactNode {
  return text
    .split(/(\{[^}]*\})/)
    .filter(Boolean)
    // 吹き出しの span は話者名の札になるので、地の文は span で包まない
    .map((s, i) => (s.startsWith('{') ? <b className="hl" key={i}>{s.slice(1, -1)}</b> : <Fragment key={i}>{s}</Fragment>))
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

/**
 * 台詞を順に出す。wait の台詞では、shopOpen / sockOpen が true になったら次へ進む。
 * waiting は、いま待っているもの（親がボタンを押せるようにする）
 */
export function GuideTalk({
  lines,
  shopOpen,
  sockOpen,
  onWait,
  onDone,
}: {
  lines: GuideLine[]
  shopOpen: boolean
  sockOpen: boolean
  onWait: (w: GuideLine['wait'] | null) => void
  onDone: () => void
}) {
  const [idx, setIdx] = useState(0)
  const line = lines[idx]
  const wait = line?.wait ?? null

  useEffect(() => {
    onWait(wait)
    return () => onWait(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wait])

  // 待っていた操作が済んだら次へ
  useEffect(() => {
    if ((wait === 'shop' && shopOpen) || (wait === 'sock' && sockOpen)) setIdx((i) => i + 1)
  }, [wait, shopOpen, sockOpen])

  if (!line) return null
  const next = () => {
    if (idx + 1 < lines.length) setIdx(idx + 1)
    else onDone()
  }
  const img = line.who === 'elf' ? characterImage('Common', line.emotion ?? '真顔') : characterImage('Stage1', line.emotion ?? '楽')
  return (
    <>
      {!wait && <div className="hide-catch" onClick={next} />}
      {line.spot && <Spotlight rect={SPOTS[line.spot]} pass={!!wait} />}
      {line.cutin && (
        <div className="rin-cutin" key={`cut${idx}`}>
          <div className="rin-cutin-band" />
          <img src={characterImage('Stage1', '喜')} alt="" />
          <span>カットイン（仮）</span>
        </div>
      )}
      <div className={`hide-elf guide-talk${line.pos ? ` is-${line.pos}` : ''}${wait ? ' is-wait' : ''}`} key={idx}>
        <img src={img} alt="" />
        <p>
          <span>{line.who === 'elf' ? 'エルフ' : 'リン'}</span>
          {hl(line.text)}
          {!wait && <i>▼</i>}
        </p>
      </div>
    </>
  )
}

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import GameTalk from '../components/GameTalk'
import TenKey from '../components/TenKey'
import { useGameLines } from '../script/scriptData'
import { backgroundImage, JACK_ICON, st3GameImage, STF_NAME } from '../scenario'
import { DEFAULT_LAST, type LastProgress, type TeamDoc } from '../types'
import { LAST_ADULT_POINTS, LAST_KID_POINTS } from './lastData'
import { SOCK_KEY_IMAGE } from '../santazon/products'
import { ASPECT, WORD_GAMES, WordBoard } from './WordGame'
import { useWordAreas } from './wordAreas'

/** Santazon の画像（public/BG/Common/santazon） */
const SZ_DIR = `${import.meta.env.BASE_URL}BG/Common/santazon/`
const BG: CSSProperties = { backgroundImage: `url(${backgroundImage('StageF')})` }
/** ルドリーの得点が10点ずつ入る間隔 */
/** 1回目が入るまで */
const COUNT_FIRST_MS = 800
/** 「タン、タタン、タタン、タタン…」のリズム：2発ずつの組になる。組と組のあいだは長め、組の中の2発目は短め（少しだけ揺らす） */
const COUNT_LONG_MS = 520
const COUNT_SHORT_MS = 170
const COUNT_JITTER_MS = 30
/** だんだん間隔が短くなる：1回入るごとに、間隔が前の 0.98 倍になる（長い間隔も短い間隔も、同じ割合で縮むので、リズムは保ったまま速くなる） */
const COUNT_DECAY = 0.98
/** n 回目の10ポイントが入るまでの間 */
function nextCountDelay(n: number): number {
  if (n <= 1) return COUNT_FIRST_MS
  const ratio = COUNT_DECAY ** (n - 2)
  const base = (n % 2 === 0 ? COUNT_LONG_MS : COUNT_SHORT_MS) * ratio
  return Math.round(base + (Math.random() * 2 - 1) * COUNT_JITTER_MS * ratio)
}
/** ジャック機能で見える、ルドリーの注文ナゾ */
// E：ジャック機能で見るルドリーの画面に出ているナゾ
const KID_PROBLEM_IMAGE: string | undefined = SOCK_KEY_IMAGE('e')

/** 画面の外（注文ボタン）まで覆うため、会話などはプレイヤー画面の上に出す */
function usePortal() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    setHost(ref.current?.closest<HTMLElement>('.screen.player') ?? null)
  }, [])
  return { ref, overlay: (node: ReactNode) => (host ? createPortal(node, host) : null) }
}

/** 大人チームとルドリーの得点 */
function Points({ adult, kid, pop }: { adult: number; kid: number; pop?: number }) {
  return (
    <div className="last-points">
      <div className="last-score is-adult">
        <small>大人チーム</small>
        <b>{adult}</b>
        <span>pt</span>
      </div>
      <div className="last-vs">VS</div>
      <div className="last-score is-kid">
        <small>{STF_NAME}</small>
        <b>{kid}</b>
        <span>pt</span>
        {pop != null && (
          <em className="last-pop" key={pop}>
            +10
          </em>
        )}
      </div>
    </div>
  )
}

interface Props {
  doc: TeamDoc
  update: (patch: Partial<TeamDoc>) => void
  shopOpen: boolean
  /** 警告マークの通知を押した。マスターエルフの会話へ */
  onNotice: () => void
}

/** LAST：エントツギフトのゲーム画面。お互いの得点と、ジャック機能・キモチ */
export default function LastGame({ doc, update, shopOpen, onNotice }: Props) {
  const last: LastProgress = { ...DEFAULT_LAST, ...doc.last }
  const extractLines = useGameLines('st5-extract')
  // 取り出し依頼のあとの会話の、いま何行目か
  const [extractIdx, setExtractIdx] = useState(0)
  const extractLine = extractLines[extractIdx]
  const nextExtract = () => {
    if (extractIdx + 1 < extractLines.length) return setExtractIdx(extractIdx + 1)
    setExtractIdx(0)
    update({ last: { ...last, step: 'balls' } })
  }
  const { ref, overlay } = usePortal()
  const [jackOpen, setJackOpen] = useState(false)
  // 大人部屋でボールを入れたあと（通知が来たころ）には、大人の得点が入っている
  const adult = last.step === 'notice' || last.step === 'super' ? LAST_ADULT_POINTS : 0
  // ルドリーの画面は、大人がボールを入れて警告マークの通知が来たあと（宅配ソックスが開かなくなったとき）は、モニターが消えている
  const kidScreenOff = last.step === 'notice' || last.step === 'super'

  return (
    <div className="last-game" ref={ref} style={BG}>
      <Points adult={adult} kid={0} />

      <button className="bingo-jack" aria-label="ジャック機能（ルドリーの画面を見る）" onClick={() => setJackOpen(true)}>
        <img src={JACK_ICON} alt="" />
      </button>

      {jackOpen &&
        overlay(
          <div className="modal-back bingo-jack-back" onClick={() => setJackOpen(false)}>
            <div className="modal bingo-jack-modal" onClick={(e) => e.stopPropagation()}>
              <h2>
                <img src={JACK_ICON} alt="" />
                {STF_NAME}の画面
              </h2>
              {kidScreenOff ? (
                <div className="last-kid-screen is-off">画面が映っていない…</div>
              ) : (
                // ルドリーの画面：背景は Santazon。宅配ソックスのナゾが出ていて、「ソックスキーを導く」と「エルフに取り出し依頼」は押せない。見るだけで、ここからは答えられない
                <div className="last-kid-sz">
                  <div className="last-kid-sz-inner" style={{ backgroundImage: `url("${SZ_DIR}san_back 1.webp")` }}>
                    <img className="lk-btn" style={{ top: 660, height: 261 }} src={`${SZ_DIR}cart2.webp`} alt="" />
                    <img className="lk-btn is-off" style={{ top: 935, height: 111 }} src={`${SZ_DIR}cart3.webp`} alt="" />
                    <img className="lk-btn is-off" style={{ top: 1060, height: 111 }} src={`${SZ_DIR}cart4.webp`} alt="" />
                    <div className="sz-dialog-back">
                      <div className="sz-dialog sz-problem">
                        <div className="problem-body">
                          {KID_PROBLEM_IMAGE ? (
                            <img className="sz-problem-img" src={KID_PROBLEM_IMAGE} alt="" />
                          ) : (
                            <div className="sz-problem-img placeholder">問題画像（ルドリーの注文ナゾ）</div>
                          )}
                          <div>
                            <p className="last-kid-hint">わかったら打ち込もう！</p>
                            <TenKey length={4} onSubmit={() => {}} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <button onClick={() => setJackOpen(false)}>閉じる</button>
            </div>
          </div>,
        )}

      {last.step === 'extract' &&
        overlay(
          <>
            <div className="hide-catch" onClick={nextExtract} />
            {extractLine && <GameTalk line={extractLine} compact={shopOpen} />}
          </>,
        )}

      {last.step === 'notice' &&
        overlay(
          <div className="last-notice-back">
            <button className="last-notice" onClick={onNotice}>
              {/* 警告マーク（三角に！） */}
              <svg className="last-notice-mark" viewBox="0 0 120 108" aria-hidden>
                <path d="M60 6 L114 100 H6 Z" fill="#ffd400" stroke="#e00018" strokeWidth="9" strokeLinejoin="round" />
                <rect x="53" y="38" width="14" height="34" rx="6" fill="#e00018" />
                <circle cx="60" cy="86" r="8" fill="#e00018" />
              </svg>
              <b>マスターエルフより緊急のお知らせ</b>
              <small>タップして確認してください</small>
            </button>
          </div>,
        )}
    </div>
  )
}

/** LAST の最後：エルフがルドリーのボールを入れ、ルドリーが勝つ。終わったらエクストラゲームへ */
export function LastEnding() {
  const { ref, overlay } = usePortal()
  const [part, setPart] = useState<'talk1' | 'count' | 'talk2' | 'done' | 'extra'>('talk1')
  const [idx, setIdx] = useState(0)
  const [kid, setKid] = useState(0)

  // 10点ずつ、何回も入る
  useEffect(() => {
    if (part !== 'count') return
    if (kid >= LAST_KID_POINTS) {
      const t = setTimeout(() => {
        setIdx(0)
        setPart('talk2')
      }, 1200)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setKid((k) => k + 10), nextCountDelay(kid / 10 + 1))
    return () => clearTimeout(t)
  }, [part, kid])

  const end1 = useGameLines('st5-end1')
  const end2 = useGameLines('st5-end2')
  const lines = part === 'talk1' ? end1 : part === 'talk2' ? end2 : null
  // セリフ編集で台詞を全部消した場面は、すぐ次へ
  useEffect(() => {
    if (lines && !lines[idx]) setPart(part === 'talk1' ? 'count' : 'done')
  })
  const next = () => {
    if (!lines) return
    if (idx + 1 < lines.length) return setIdx(idx + 1)
    setPart(part === 'talk1' ? 'count' : 'done')
  }

  if (part === 'extra') return <ExtraGame onBack={() => setPart('done')} />

  return (
    <div className="last-game" ref={ref} style={BG}>
      <Points adult={LAST_ADULT_POINTS} kid={kid} pop={part === 'count' && kid > 0 ? kid : undefined} />
      {(part === 'talk2' || part === 'done') && kid >= LAST_KID_POINTS && <div className="last-winner">WINNER {STF_NAME}</div>}
      {part === 'done' && (
        <div className="last-end">
          <div className="last-end-title">ゲーム終了</div>
          <button className="big last-extra-btn" onClick={() => setPart('extra')}>
            エクストラゲーム
          </button>
        </div>
      )}
      {lines &&
        overlay(
          <>
            <div className="hide-catch" onClick={next} />
            {lines[idx] && <GameTalk line={lines[idx]} />}
          </>,
        )}
    </div>
  )
}

/** エクストラゲーム：ステージ3の押さえてワードを続けて遊ぶ（問題はあとで増やす） */
function ExtraGame({ onBack }: { onBack: () => void }) {
  const [n, setN] = useState(0)
  const [clear, setClear] = useState(false)
  const set = WORD_GAMES[n % WORD_GAMES.length]
  // 盤面の画像とタップエリアは、ステージ3の1ゲーム目・2ゲーム目のものを使う
  const game = n % 2
  const { areas } = useWordAreas(game)
  const debug = new URLSearchParams(location.search).get('debug') === 'true'

  useEffect(() => {
    if (!clear) return
    const t = setTimeout(() => {
      setClear(false)
      setN((x) => x + 1)
    }, 2600)
    return () => clearTimeout(t)
  }, [clear])

  return (
    <div className="word-game extra-game">
      <WordBoard
        key={n}
        label={`エクストラ ${n + 1}問目`}
        set={set}
        areas={areas}
        image={st3GameImage(game === 1 ? 2 : 1)}
        aspect={ASPECT[game === 1 ? 2 : 1]}
        debug={debug}
        paused={clear}
        onClear={() => setClear(true)}
      />
      <button className="sub extra-back" onClick={onBack}>
        もどる
      </button>
      {clear && (
        <div className="word-clear">
          <div className="word-clear-ring" />
          <div className="word-clear-ring is-late" />
          <div className="word-clear-text">クリア！</div>
        </div>
      )}
    </div>
  )
}

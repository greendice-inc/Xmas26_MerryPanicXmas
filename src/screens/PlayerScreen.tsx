import { useCallback, useEffect, useRef, useState } from 'react'
import Dots from '../components/Dots'
import GameMenu from '../components/GameMenu'
import KidsRoom from '../components/KidsRoom'
import Logo from '../components/Logo'
import NovelPart from '../components/NovelPart'
import ProblemDialog, { ArrivalNotice } from '../components/ProblemDialog'
import { GuideTalk, RULES_FX, SOCK_FX, type GuideFx } from '../games/Stage1Guide'
import Santazon, { type RequestResult, type SzGuide, type SzTab } from '../components/Santazon'
import BingoGame from '../games/BingoGame'
import { isBingoCart, ROUNDS, roundOf } from '../games/bingoData'
import HideSeek from '../games/HideSeek'
import LastGame, { LastEnding } from '../games/LastGame'
import { isLastCart, LAST_PROBLEMS, LAST_REQUEST_CODE } from '../games/lastData'
import WordGame from '../games/WordGame'
import { GAME_COUNT, KV_IMAGE, LAST_STAGE, ROOM_BY_TEAM } from '../config'
import { GAMES } from '../games'
import { useTeam } from '../net/hooks'
import { isCorrectCart, ORDER_STAGES, sockKeyOfItems } from '../santazon/products'
import { useProducts } from '../santazon/useProducts'
import { useGameLines, useScriptScene } from '../script/scriptData'
import { hl } from '../components/GameTalk'
import RecordsPage from '../components/RecordsPage'
import { PREVIEW } from '../preview'
import { ALL_MARK_SCORES } from '../games/MarkGame'
import { CLEAR, NOVEL, RECORDS, characterImage, LAST_MOOD, LAST_MOOD_AFTER, ST1_MOOD, ST2_MOOD, ST3_MOOD, ST4_MOOD, type Mood } from '../scenario'
import { setAdultSkip } from '../adultWait'
import { DEFAULT_BINGO, DEFAULT_LAST, DEFAULT_WORD, type OrderItem } from '../types'

/** 正しい注文をしてしてから、届いたポップアップが出るまで */
/** 注文から、商品が届くまで。「注文が確定しました」を自動で閉じる時間（Santazon の CONFIRM_MS）より、少し長くする */
const DELIVER_MS = 3500
/** ステージ4 ROUND2：ナゾを開いて少したってから出す案内 */
const R2_HINT = 'これまでに発送した際のアイテムとソックスキーは、\n「記録」画面で確認できます。'
const STAGE1_MARK_TASK = 'ゲームに使う５つのマークの得点を特定しよう。'
const STAGE1_TASK = '失格せずに、リンを勝たせる。'

/** 暗転からのフェードインの長さ（styles.css の .fade-black と合わせる） */
const FADE_MS = 2500
/** 場面転換で暗くなるまで（styles.css の .fade-to-black と合わせる） */
const BLACKOUT_MS = 600
/** かくれんぼのステージ */
const HIDE_STAGE = 2
/** 押さえてワードのステージ */
const WORD_STAGE = 3
/** ビンゴのステージ */
const BINGO_STAGE = 4

const hideImg = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.display = 'none'
}

export default function PlayerScreen({ team }: { team: number }) {
  const { products } = useProducts()
  const [doc, update, loaded] = useTeam(team)
  // セリフ編集で保存したセリフ（無ければコードのまま）
  const edited = useScriptScene(doc.stage, doc.phase)
  // 「はじめから／つづきから」を選んだか（再接続・リセット後は再び選ばせる）
  // プレビュー（?preview）は、入口の「はじめから／つづきから」を出さない
  const [entered, setEntered] = useState(PREVIEW)

  // フタが外れた瞬間に、暗転 → フェードインで会話を始める
  const [fading, setFading] = useState(false)
  // （会話パートが作られる前に fading を true にしたいので、描画中に判定する）
  const [prevLocked, setPrevLocked] = useState(doc.locked)
  if (prevLocked !== doc.locked) {
    setPrevLocked(doc.locked)
    if (entered && prevLocked && !doc.locked) setFading(true)
  }

  // マスターが全端末リセットしたら、「はじめから」を押した直後の状態（フタ待機）に戻る
  const seenReset = useRef<{ v: number | undefined } | null>(null)
  useEffect(() => {
    if (!loaded) return
    if (seenReset.current && doc.resetAt !== seenReset.current.v) {
      setEntered(true)
      setFading(false)
      setShopOpen(false)
      setCart([])
      setLocalProceedAt(null)
      setTaskOpen(false)
      setRecordsOpen(false)
      setClearNext(null)
      setChair(false)
      advancing.current = false
    }
    seenReset.current = { v: doc.resetAt }
  }, [doc.resetAt, loaded])

  // シーンジャンプしたら、手元の注文操作も消して、飛んだシーンから入る
  const seenEnter = useRef<{ v: number | undefined } | null>(null)
  useEffect(() => {
    if (!loaded) return
    if (seenEnter.current && doc.enterAt !== seenEnter.current.v) {
      setEntered(true)
      setFading(false)
      setShopOpen(false)
      setCart([])
      setLocalProceedAt(null)
      setTaskOpen(false)
      setArrivedSeenAt(null)
      setProblemOpen(false)
      setRecordsOpen(false)
      setClearNext(null)
      setChair(false)
      advancing.current = false
    }
    seenEnter.current = { v: doc.enterAt }
  }, [doc.enterAt, loaded])

  // Santazon（注文画面）
  const [shopOpen, setShopOpen] = useState(false)
  const [szTab, setSzTab] = useState<SzTab>('list')
  const [cart, setCart] = useState<OrderItem[]>([])
  const [recordsOpen, setRecordsOpen] = useState(false)
  // ステージ4 ROUND1 の説明で、取り出し依頼ボタンを光らせる
  const [requestGlow, setRequestGlow] = useState(false)
  // ステージ4：エルフ・ロビンが話している間は、下のボタンを押せない
  const [bingoLock, setBingoLock] = useState(false)
  // ステージ2の案内で目立たせる場所
  const [guide, setGuide] = useState<{ menu: boolean; sz: SzGuide | null }>({ menu: false, sz: null })
  const onGuide = useCallback(
    (g: { menu: boolean; sz: SzGuide | null }) => setGuide((p) => (p.menu === g.menu && p.sz === g.sz ? p : g)),
    [],
  )
  // クリアの会話を読み終えて「タップで次のステージ」を出しているステージ
  const [clearNext, setClearNext] = useState<number | null>(null)
  // ステージ3：正しい注文が止められて、カイ・メイが椅子の話をしている
  const [chair, setChair] = useState(false)
  // 場面転換：暗くしてから切り替え、フェードインで戻す
  const [blackout, setBlackout] = useState(false)
  const [fadeQuick, setFadeQuick] = useState(false)
  const blackoutThen = useRef<(() => void) | null>(null)
  const fadeThen = (fn: () => void) => {
    if (blackoutThen.current) return
    blackoutThen.current = fn
    setBlackout(true)
  }
  useEffect(() => {
    if (!blackout) return
    const t = setTimeout(() => {
      blackoutThen.current?.()
      blackoutThen.current = null
      setBlackout(false)
      setFadeQuick(true)
      setFading(true)
    }, BLACKOUT_MS)
    return () => clearTimeout(t)
  }, [blackout])
  const [taskOpen, setTaskOpen] = useState(false)
  // 「アイテムが届きました」を閉じた注文（の時刻）と、ソックスキーのナゾを開いているか
  const [arrivedSeenAt, setArrivedSeenAt] = useState<number | null>(null)
  const [problemOpen, setProblemOpen] = useState(false)
  // 「アイテムが届きました」のあと、ソックスキーを導くボタンを1回押すまで光らせる（押した注文の時刻）
  const [sockPressedAt, setSockPressedAt] = useState<number | null>(null)
  // ステージ1の案内で、プレイヤーの操作を待っているもの
  const [guideWait, setGuideWait] = useState<GuideFx['wait'] | null>(null)
  // 正解直後、Firestore の反映を待たずにエルフを出すための時刻
  const [localProceedAt, setLocalProceedAt] = useState<number | null>(null)
  const advancing = useRef(false)
  const stageRef = useRef(doc.stage)
  stageRef.current = doc.stage
  const orderRef = useRef(doc.order)
  orderRef.current = doc.order
  const updateRef = useRef(update)
  updateRef.current = update

  /** そのステージの正しい注文か（ビンゴはラウンドごとに違う） */
  const correctCart = (items: OrderItem[]) =>
    doc.stage === BINGO_STAGE
      ? isBingoCart(doc.bingo?.step, items, products)
      : doc.stage === LAST_STAGE
        ? isLastCart(doc.last?.step, items, products)
        : isCorrectCart(doc.stage, items)
  const bingoRound = doc.stage === BINGO_STAGE ? roundOf(doc.bingo?.step) : null
  const lastStep = doc.stage === LAST_STAGE ? (doc.last?.step ?? 'basket') : null
  const ballsLines = useGameLines('st5-balls')
  /** LAST の注文の問題（エントツとボール・スーパーボールと金庫で別） */
  const lastProblem = lastStep ? LAST_PROBLEMS[lastStep] : undefined

  /** このラウンドの問題（取り出し依頼で答える） */
  const requestProblem = bingoRound ? ROUNDS[bingoRound].problem : undefined
  /** 取り出し依頼。届いた注文の番号が合っていれば、解けたことにする */
  const onRequest = (code: string): RequestResult => {
    // LAST：ルドリーの宅配ソックスから取り出す（エルフが番号を確かめる）
    if (lastStep) {
      if (lastStep !== 'basket') return 'none'
      if (code !== LAST_REQUEST_CODE) return 'wrong'
      setShopOpen(false)
      update({ last: { ...DEFAULT_LAST, ...doc.last, step: 'extract' } })
      return 'ok'
    }
    const order = doc.order
    if (!order || order.status !== 'delivered' || !requestProblem?.request) return 'none'
    // 答えは、注文した商品のアイテム番号を桁ごとに足したもの
    if (code !== sockKeyOfItems(order.items, products)) return 'wrong'
    // Santazon は開いたまま。エルフが話してから、フェードでゲーム画面へ（BingoGame の onFadeToGame）
    onSolved()
    return 'ok'
  }

  // 宅配ソックスの番号（大人部屋に出す）。注文した商品のアイテム番号を、桁ごとに足したもの
  const sockCode = doc.order ? sockKeyOfItems(doc.order.items, products) : undefined
  // デバッグモード（?debug=true）：ソックスキーの答えを、画面の上に出す
  const debugMode = new URLSearchParams(location.search).get('debug') === 'true'
  const debugKey =
    lastStep === 'basket'
      ? `ソックスキー（ルドリー）取り出し依頼 ${LAST_REQUEST_CODE}`
      : doc.order
        ? `ソックスキー ${sockCode}`
        : cart.length
          ? `ソックスキー（カートの中身なら）${sockKeyOfItems(cart, products)}`
          : null
  // 正解のあと：スタッフが「次へ」を押す（または隠しメニューで進める）まで、エルフが待たせる。押された時刻が proceedAt
  const proceedAt = localProceedAt ?? doc.order?.proceedAt
  const showGuide =
    loaded &&
    doc.phase === 'game' &&
    ORDER_STAGES.includes(doc.stage) &&
    !!doc.order &&
    correctCart(doc.order.items) &&
    (doc.order.status === 'solved' || localProceedAt != null)
  const adultWait = showGuide && proceedAt == null
  const adultReady = showGuide && proceedAt != null

  const onSolved = () => {
    if (!doc.order) return
    advancing.current = false
    setLocalProceedAt(null)
    // 正解。スタッフの「次へ」が来るまで待つ（proceedAt なし）
    update({ order: { ...doc.order, status: 'solved', proceedAt: undefined, stayed: false } })
  }

  const goNext = () => {
    if (advancing.current) return
    advancing.current = true
    setLocalProceedAt(null)
    const stage = stageRef.current
    // ステージ3は、部屋から戻ったあとにクリアの会話がある
    if (stage === WORD_STAGE && doc.phase !== 'clear') update({ phase: 'clear' })
    // ステージが切り替わるときは、暗くしてから切り替えて、フェードインで戻す
    else if (stage >= GAME_COUNT) fadeThen(() => update({ phase: 'end' }))
    else fadeThen(() => update({ stage: stage + 1, phase: 'novel' }))
  }

  // ステージや場面が切り替わったら、「次に進む」の二重タップ防止を戻す（戻さないと、ステージ2のクリア後にタップしても進まない）
  useEffect(() => {
    advancing.current = false
  }, [doc.stage, doc.phase])

  // 正しい注文（ステージ1はタンバリン・フラフープ、ステージ3はペンギン・ダチョウ）は、数秒後に自動で届ける
  useEffect(() => {
    const order = doc.order
    if (!order || order.status !== 'ordered' || !correctCart(order.items)) return
    const t = setTimeout(() => {
      update({ order: { items: order.items, status: 'delivered', at: order.at } })
    }, DELIVER_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.order, doc.stage, doc.bingo?.step, doc.last?.step, products, update])

  // ステージ3：正しい注文のナゾを解いたら、子ども部屋でカイ・メイがイスに登っていた話になる
  const chairNow = doc.stage === WORD_STAGE && doc.phase === 'game' && doc.order?.status === 'solved' && !doc.word?.chairTold
  useEffect(() => {
    if (!chairNow) return
    setShopOpen(false)
    setChair(true)
    update({ word: { ...DEFAULT_WORD, ...doc.word, chairTold: true } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chairNow])

  // LAST：エントツとボールを発送して1分たったら、「タップで次に進む」を出す。タップすると警告マークの通知へ
  const toNotice = () => {
    setLocalProceedAt(null)
    update({ last: { ...DEFAULT_LAST, ...doc.last, step: 'notice' } })
  }

  useEffect(() => {
    if (!adultWait) {
      setAdultSkip(null)
      return
    }
    setAdultSkip(() => {
      const at = Date.now()
      setLocalProceedAt(at)
      const order = orderRef.current
      if (order) updateRef.current({ order: { ...order, proceedAt: at, stayed: false } })
    })
    return () => setAdultSkip(null)
  }, [adultWait])

  const startNew = () => {
    update({
      started: true,
      room: ROOM_BY_TEAM[team] ?? team,
      stage: 1,
      phase: 'novel',
      locked: true,
      order: null,
      orderedQty: [],
      searched: [],
      markCleared: false,
      markSolved: false,
      markScores: {},
      sockTold: false,
      searchUnlocked: false,
      records: [],
      hide: { tutorialDone: false, found: 0 },
      word: DEFAULT_WORD,
      bingo: DEFAULT_BINGO,
      last: DEFAULT_LAST,
    })
    setCart([])
    setRecordsOpen(false)
    setClearNext(null)
    setShopOpen(false)
    setLocalProceedAt(null)
    setTaskOpen(false)
    advancing.current = false
    setEntered(true)
  }

  let body
  if (!loaded) {
    body = (
      <div className="center-msg">
        <Dots />
        <div>接続中</div>
      </div>
    )
  } else if (!entered) {
    body = (
      <div className="start-menu">
        <Logo size="lg" />
        <div className="team-label">チーム {team}</div>
        <div className="start-buttons">
          <button className="big" onClick={startNew}>はじめから</button>
          <button className="big sub" disabled={!doc.started} onClick={() => setEntered(true)}>つづきから</button>
        </div>
      </div>
    )
  } else if (doc.phase === 'novel' && doc.locked) {
    // フタが外れるまで会話は始めない
    body = null
  } else if (doc.phase === 'novel') {
    body = (
      <>
        <NovelPart
          key={`n${doc.stage}`}
          scene={edited ?? NOVEL[doc.stage - 1]}
          // フェードインが終わって、何もない背景を少し見せてからキャラを出す
          lead={fading ? FADE_MS + 800 : undefined}
          onFinish={() => (doc.stage === HIDE_STAGE || doc.stage === WORD_STAGE || doc.stage === BINGO_STAGE || doc.stage === LAST_STAGE ? fadeThen(() => update({ phase: 'game' })) : update({ phase: 'game' }))}
        />
      </>
    )
  } else if (doc.phase === 'game') {
    if (doc.stage === 1 && doc.markCleared) {
      body = <KidsRoom />
    } else if (doc.stage === HIDE_STAGE) {
      body = (
        <HideSeek
          key={`g${doc.stage}`}
          doc={doc}
          update={update}
          shopOpen={shopOpen}
          szTab={szTab}
          onGuide={onGuide}
          onAllFound={() => fadeThen(() => update({ phase: 'clear' }))}
          onTutorialEnd={(then) =>
            fadeThen(() => {
              setShopOpen(false)
              then()
            })
          }
        />
      )
    } else if (doc.stage === WORD_STAGE) {
      body = (
        <WordGame
          key={`g${doc.stage}-${doc.enterAt ?? 0}`}
          doc={doc}
          update={update}
          shopOpen={shopOpen}
          chair={chair}
          onChairDone={() => setChair(false)}
        />
      )
    } else if (doc.stage === LAST_STAGE) {
      body = (
        <LastGame
          key={`g${doc.stage}-${doc.enterAt ?? 0}`}
          doc={doc}
          update={update}
          shopOpen={shopOpen}
          // 警告マークの通知から、フェードでマスターエルフの会話へ
          onNotice={() => fadeThen(() => update({ phase: 'clear', last: { ...DEFAULT_LAST, ...doc.last, step: 'super' } }))}
        />
      )
    } else if (doc.stage === BINGO_STAGE) {
      body = (
        <BingoGame
          key={`g${doc.stage}-${doc.enterAt ?? 0}`}
          doc={doc}
          update={update}
          shopOpen={shopOpen}
          // 取り出し依頼が通ったあと：暗くして Santazon を閉じ、ゲーム画面へ
          onFadeToGame={(then) =>
            fadeThen(() => {
              setShopOpen(false)
              then()
            })
          }
          onRequestGlow={setRequestGlow}
          // 「アイテムが届きました」を閉じたあと、ROUND1 の取り出し依頼の説明が始まる
          arrived={arrivedSeenAt === (doc.order?.at ?? null)}
          onLock={setBingoLock}
          onDone={() =>
            fadeThen(() => {
              // LAST の最初には、サッカーボールがリストに載っている（ROUND2 で1つ発送済みなので、在庫は 4/5）
              const ballId = products.find((p) => p.name.replace(/\s/g, '').startsWith('サッカーボール'))?.id
              update({
                stage: doc.stage + 1,
                phase: 'novel',
                order: null,
                bingo: { ...DEFAULT_BINGO, ...doc.bingo, step: 'done' },
                searched: ballId ? [...new Set([...doc.searched, ballId])] : doc.searched,
              })
            })
          }
        />
      )
    } else {
      const Game = GAMES[doc.stage - 1]
      body = (
        <Game
          key={`g${doc.stage}-${doc.markSolved ? 's' : ''}-${doc.enterAt ?? 0}`}
          stage={doc.stage}
          // ステージ1：マークと得点が分かったら、画面はそのままで続きの説明へ
          solved={doc.stage === 1 && !!doc.markSolved}
          scores={doc.markScores}
          onScore={(id, answer) => update({ markScores: { ...(doc.markScores ?? {}), [id]: answer } })}
          // 「全部わかったね」のあとは、暗くしてから次のセリフへ
          onClear={() => fadeThen(() => (doc.stage === 1 ? update({ markSolved: true }) : update({ phase: 'clear' })))}
        />
      )
    }
  } else if (doc.phase === 'clear') {
    body = (
      <NovelPart
        key={`c${doc.stage}`}
        scene={edited ?? CLEAR[doc.stage - 1]}
        onFinish={() => {
          if (doc.stage === 1) update({ phase: 'game', markCleared: true })
          // ステージ2・3は、会話のあとに「タップで次のステージに進む」を出す
          if (doc.stage === HIDE_STAGE || doc.stage === WORD_STAGE) setClearNext(doc.stage)
          // LAST：マスターエルフの話のあと、ルドリーのための注文に戻る
          if (doc.stage === LAST_STAGE) update({ phase: 'game' })
        }}
        endButton={
          doc.stage === 1 || doc.stage === HIDE_STAGE || doc.stage === WORD_STAGE || doc.stage === LAST_STAGE
            ? undefined
            : {
                label: '次に進む',
                onClick: () =>
                  fadeThen(() => (doc.stage >= GAME_COUNT ? update({ phase: 'end' }) : update({ stage: doc.stage + 1, phase: 'novel' }))),
              }
        }
      />
    )
  } else {
    // LAST の最後（エルフがルドリーのボールを入れる → エクストラゲーム）
    body = <LastEnding key={`end-${doc.enterAt ?? 0}`} />
  }

  // 会話・ゲーム画面は枠なしで、背景画像を画面全体に出す。下にメニューボタンを並べる
  const framed = loaded && entered
  const talking = doc.phase === 'novel' || doc.phase === 'clear' || doc.phase === 'end'
  // マークの得点当てでは、まだ注文できない
  // ステージ3は、押さえてワードを2つ終えて部屋のお題が出てから
  const markQuiz =
    (doc.stage === 1 && doc.phase === 'game' && !doc.markCleared) ||
    (doc.stage === WORD_STAGE && doc.phase === 'game' && (doc.word?.step ?? 'rule') !== 'room') ||
    // ステージ4は、ラウンド中で山札がそろう前だけ
    (doc.stage === BINGO_STAGE && doc.phase === 'game' && (!bingoRound || !!doc.bingo?.deckIn)) ||
    // LAST は、取り出したあとの会話と警告マークの通知のあいだは注文できない
    (lastStep != null && doc.phase === 'game' && (lastStep === 'extract' || lastStep === 'notice'))
  // ステージ1のリンのキモチは、マークが始まったときから記録に入る（保存はせず、いまの位置から決める）
  const markStarted = doc.started && (doc.stage > 1 || doc.phase === 'game' || doc.phase === 'clear' || doc.phase === 'end')
  const records = [...(markStarted ? ['st1-mood', 'st1-rule'] : []), ...(doc.records ?? [])].filter((id) => RECORDS[id])
  // ステージ4 ROUND1 で発送したアイテムと、ソックスキー（ROUND2 の「番号の法則」のナゾの手がかり）
  const r1Record = (() => {
    const items = (ROUNDS.r1.order ?? []).flatMap((w) => {
      const p = products.find((x) => x.name.replace(/\s/g, '').startsWith(w))
      return p ? [{ id: p.id, qty: 1, name: p.name, code: p.code }] : []
    })
    return [...items.map((i) => `${i.name}（アイテム番号 ${i.code}）`), `ソックスキー ${sockKeyOfItems(items, products)}`]
  })()
  // 「やるべきこと」：そのステージでやること と、子どものキモチ（ハートの代わり）
  const task: { text?: string; mood?: Mood } = (() => {
    if (doc.phase !== 'game') return {}
    if (doc.stage === 1) return doc.markCleared ? { text: STAGE1_TASK } : { text: STAGE1_MARK_TASK }
    if (doc.stage === HIDE_STAGE) return { mood: ST2_MOOD }
    if (doc.stage === WORD_STAGE) return (doc.word?.step ?? 'rule') === 'rule' ? {} : { mood: ST3_MOOD }
    if (doc.stage === BINGO_STAGE) return doc.bingo?.jack ? { mood: ST4_MOOD } : {}
    if (doc.stage === LAST_STAGE) return { mood: lastStep === 'super' ? LAST_MOOD_AFTER : LAST_MOOD }
    return {}
  })()
  // ステージ1の案内中に、注文ボタンだけ押せるようにする
  const canOrder = !markQuiz || guideWait === 'shop'
  const delivered = doc.order?.status === 'delivered'
  const orderAt = doc.order?.at ?? null

  // LAST の最後：ルドリーのための正しい注文が届いて、「アイテムが届きました」を閉じたら、フェードでエンディングへ（ナゾは出ない）
  const finalArrived = lastStep === 'super' && doc.phase === 'game' && delivered && !!doc.order && arrivedSeenAt === (doc.order.at ?? null)
  const finalGoing = useRef(false)
  useEffect(() => {
    if (!finalArrived) finalGoing.current = false
  }, [finalArrived])
  useEffect(() => {
    if (!finalArrived || finalGoing.current) return
    finalGoing.current = true
    fadeThen(() => {
      setShopOpen(false)
      setCart([])
      update({ phase: 'end', order: null })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalArrived])
  // 注文が変わったら、ナゾは閉じた状態から
  useEffect(() => setProblemOpen(false), [orderAt])
  const openProblem = () => {
    if (!delivered) return
    setShopOpen(false)
    setArrivedSeenAt(orderAt)
    setSockPressedAt(orderAt)
    setProblemOpen(true)
  }
  // Santazon の中から押したときは、Santazon を閉じず、その上にナゾを重ねて開く（ゲーム画面に切り替えない）
  const openProblemOverShop = () => {
    if (!delivered) return
    setArrivedSeenAt(orderAt)
    setSockPressedAt(orderAt)
    setProblemOpen(true)
  }
  // ステージ1：マークが分かったあとの説明（マークの画面のまま）
  const rulesGuide = loaded && entered && doc.stage === 1 && doc.phase === 'game' && !!doc.markSolved && !doc.markCleared && !blackout
  // ステージ1：正しい注文が届いたあとの、ソックスキーの説明
  // 1stの注文は、すぐにソックスキーの説明が入るので、「アイテムが届きました」の演出は出さない
  // （説明のあとで再読み込みしても、もう一度は流さない）
  const skipArrival = doc.stage === 1 && doc.phase === 'game' && delivered && !!doc.order && correctCart(doc.order.items)
  const sockReady =
    loaded && entered && doc.stage === 1 && doc.phase === 'game' && !!doc.markCleared && !doc.sockTold &&
    delivered && !!doc.order && correctCart(doc.order.items) && (arrivedSeenAt === orderAt || skipArrival)
  // 「注文が確定しました」の閉じるを押したら、暗くして（フェード）、santazon を開いたまま、ソックスキーの説明を始める（ゲーム画面には戻さない）
  const [sockFadedAt, setSockFadedAt] = useState<number | null>(null)
  const sockGuide = sockReady && sockFadedAt === orderAt && !blackout
  const onConfirmedClose = () => {
    if (doc.stage !== 1 || doc.phase !== 'game' || doc.sockTold || !doc.order || !correctCart(doc.order.items) || sockFadedAt === orderAt) return
    fadeThen(() => setSockFadedAt(orderAt))
  }
  // 再読み込みなどで santazon が開いていないときは、santazon を開いてから、最初のセリフ（「なるほど。それなら確かに〜」）を始める
  useEffect(() => {
    if (sockReady && !shopOpen && !blackout && sockFadedAt !== orderAt) {
      setSzTab('list')
      setShopOpen(true)
      setSockFadedAt(orderAt)
    }
  }, [sockReady, shopOpen, blackout, sockFadedAt, orderAt])
  // ステージ1の案内：santazon / ナゾの画面の上で話している途中に、その画面が閉じてしまったら開き直す
  // （開発中の再読み込みで、台詞の位置は残るのに「マーク当て中は閉じる」が走り直す、など）
  const reopenForGuide = (w: 'shop' | 'sock') => {
    if (w === 'shop') {
      setSzTab('list')
      setShopOpen(true)
    } else openProblem()
  }
  // 「アイテムが届きました」のあと、ナゾを開くまで：Santazon のボタン（と、それを開く下のボタン）を光らせる
  const sockGlow = doc.stage >= 2 && !markQuiz && delivered && arrivedSeenAt === orderAt && sockPressedAt !== orderAt
  // 会話中に開いたままの画面は閉じる。テキストを送る以外の操作を残さない
  useEffect(() => {
    if (!talking && !markQuiz) return
    setShopOpen(false)
    if (talking) {
      setTaskOpen(false)
      setRecordsOpen(false)
    }
  }, [talking, markQuiz])
  return (
    <div className="screen player">
      {debugMode && debugKey && <div className="debug-sockkey">{debugKey}</div>}
      {framed ? (
        <>
          <div className="play-area">
            {body}
            {!talking && shopOpen && (
              <Santazon
                doc={doc}
                update={update}
                cart={cart}
                setCart={(f) => setCart(f)}
                onClose={() => setShopOpen(false)}
                tab={szTab}
                onTab={setSzTab}
                searchUnlocked={!!doc.searchUnlocked || doc.stage > HIDE_STAGE}
                // 取り出し依頼ボタンはステージ4から、ずっと出す
                onRequest={doc.stage >= BINGO_STAGE ? onRequest : undefined}
                // 届いた注文のナゾ（閉じていても、ここから開き直せる）
                onOpenProblem={openProblemOverShop}
                sockGlow={sockGlow}
                requestGlow={requestGlow}
                onConfirmedClose={onConfirmedClose}
                guide={doc.phase === 'game' && doc.stage === HIDE_STAGE ? guide.sz : null}
              />
            )}
          </div>
          {/* 最後（エンディング・エクストラゲーム）は、下のボタンを出さない */}
          {/* 最後は出さない。ステージ3のゲーム中（部屋のお題が出るまで）も、ゲーム画面を大きく見せるために出さない */}
          {doc.phase !== 'end' && !(doc.stage === WORD_STAGE && doc.phase === 'game' && (doc.word?.step ?? 'rule') !== 'room') && <GameMenu
            shopOpen={shopOpen}
            locked={talking || (doc.stage === BINGO_STAGE && bingoLock)}
            onOrder={
              !canOrder
                ? undefined
                : () => {
                    if (!shopOpen) setSzTab('list')
                    setShopOpen(!shopOpen)
                  }
            }
            onTask={task.text || task.mood ? () => setTaskOpen(true) : undefined}
            onRecord={records.length ? () => setRecordsOpen(true) : undefined}
            guide={guideWait === 'shop' || (doc.phase === 'game' && doc.stage === HIDE_STAGE && guide.menu) || (sockGlow && !shopOpen && !talking) ? '注文' : null}
            guided={guideWait === 'shop' || (doc.phase === 'game' && doc.stage === HIDE_STAGE && (guide.menu || !!guide.sz))}
          />}
          {!talking && delivered && doc.order && arrivedSeenAt !== orderAt && !skipArrival && (
            <ArrivalNotice onClose={() => setArrivedSeenAt(orderAt)} />
          )}
          {!talking && delivered && doc.order && problemOpen && (
            <ProblemDialog
              order={doc.order}
              problem={bingoRound ? ROUNDS[bingoRound].problem : lastProblem}
              hint={bingoRound === 'r2' && records.includes('st4-r1') ? R2_HINT : undefined}
              onSolved={onSolved}
              onClose={() => setProblemOpen(false)}
            />
          )}
          {rulesGuide && (
            <GuideTalk
              key="rules"
              sceneId="st1-rules"
              fx={RULES_FX}
              shopOpen={shopOpen}
              sockOpen={problemOpen}
              onWait={setGuideWait}
              onReopen={reopenForGuide}
              onDone={() =>
                fadeThen(() => {
                  setShopOpen(false)
                  update({ markCleared: true })
                })
              }
            />
          )}
          {sockGuide && (
            <GuideTalk
              key="sock"
              sceneId="st1-sock"
              fx={SOCK_FX}
              shopOpen={shopOpen}
              sockOpen={problemOpen}
              onWait={setGuideWait}
              onReopen={reopenForGuide}
              // 「画面右下の…」の台詞で、自動で Santazon の画面に移る
              onOpenShop={() =>
                fadeThen(() => {
                  setSzTab('list')
                  setShopOpen(true)
                })
              }
              onDone={() => update({ sockTold: true })}
            />
          )}
          {!talking && adultWait && !chair && (
            <div className="sz-elf-back is-static">
              <div className="sz-elf-line">
                <img src={characterImage('Common', '真顔')} alt="" />
                <p className="is-three">
                  <span>エルフ</span>
                  {lastStep === 'balls' ? (
                    // LAST：エントツとボールの発送のあとの会話（セリフ編集の「エントツとボールを発送したあと」）
                    ballsLines.map((l, i) => <em key={i}>{hl(l.text)}</em>)
                  ) : (
                    <>
                      {/* LAST のルドリーのための注文は、大人部屋にはもう入れない */}
                      <em>{lastStep === 'super' ? <>【<b>行動シート</b>】に記入してください。</> : <>【<b>行動シート</b>】に記入して、大人部屋に向かいましょう。</>}</em>
                      <em>宅配ソックスの番号は「<b>{sockCode}</b>」です。</em>
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
          {!talking && adultReady && !chair && (
            <div className="stage-next" onClick={lastStep === 'balls' ? toNotice : goNext}>
              <div className="stage-next-row">
                <i>▼</i>
                <span>タップで次のステージに進む</span>
                <i>▼</i>
              </div>
            </div>
          )}
          {doc.phase === 'clear' && clearNext === doc.stage && (
            <div className="stage-next" onClick={goNext}>
              <div className="stage-next-row">
                <i>▼</i>
                <span>タップで次のステージに進む</span>
                <i>▼</i>
              </div>
            </div>
          )}
          {!talking && recordsOpen && (
            <RecordsPage
              unlocked={doc.phase === 'end' ? GAME_COUNT : doc.stage}
              records={records}
              textOf={{ 'st1-mood': ST1_MOOD.lines.map((l) => l.text), 'st4-r1': r1Record }}
              iconOf={{ 'st1-mood': ST1_MOOD.icon }}
              markScores={doc.markScores ?? (doc.markSolved || doc.stage > 1 ? ALL_MARK_SCORES : {})}
              onClose={() => setRecordsOpen(false)}
            />
          )}
          {!talking && taskOpen && (
            <div className="modal-back" onClick={() => setTaskOpen(false)}>
              <div className="modal task-modal">
                <h2>やるべきこと</h2>
                {task.text && <p className="task-text">{task.text}</p>}
                {/* 子どものキモチ（前はハートのボタンで見ていたもの） */}
                {task.mood && (
                  <div className="task-mood">
                    <img src={task.mood.icon} alt="" />
                    <div>
                      <h3>{task.mood.name}のキモチ</h3>
                      {task.mood.lines.map((l, i) => (
                        <p key={i}>
                          {l.who && <small>{l.who}</small>}
                          {task.mood!.lines.length > 1 ? `「${l.text}」` : l.text}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                
              </div>
            </div>
          )}
        </>
      ) : (
        body
      )}
      {blackout && <div className="fade-to-black" />}
      {fading && <div className={`fade-black${fadeQuick ? ' is-quick' : ''}`} onAnimationEnd={() => { setFading(false); setFadeQuick(false) }} />}
      {/* メインビジュアル（KV）のフタ。スタッフがロックを解除するまで操作不可 */}
      {entered && doc.locked && (
        <div className="cover">
          {/* 画像が読み込めなかったときの代替表示（画像の下に隠れている） */}
          <Logo size="lg" />
          <Dots />
          <div className="cover-sub">しばらくお待ちください</div>
          <img className="cover-kv-bg" src={KV_IMAGE} alt="" onError={hideImg} />
          <img className="cover-kv" src={KV_IMAGE} alt="" onError={hideImg} />
        </div>
      )}
    </div>
  )
}

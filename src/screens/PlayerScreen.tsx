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
import { isCorrectCart, isGame1LoseCart, ORDER_STAGES, PROBLEMS } from '../santazon/products'
import { useProducts } from '../santazon/useProducts'
import { useScriptScene } from '../script/scriptData'
import { CLEAR, NOVEL, RECORDS, characterImage, LAST_MOOD, LAST_MOOD_AFTER, ST1_MOOD, ST1_MOOD_AFTER, ST2_MOOD, ST3_MOOD, ST4_MOOD, type Mood } from '../scenario'
import { adultWaitMs, setAdultSkip } from '../adultWait'
import { DEFAULT_BINGO, DEFAULT_LAST, DEFAULT_WORD, type OrderItem } from '../types'

/** 正しい3点を注文してから、届いたポップアップが出るまで */
const DELIVER_MS = 3000
const STAGE1_TASK = 'リンさんを勝たせる。ただし「失格」になってはいけない。'

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
  const [entered, setEntered] = useState(false)

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
  // ステージ1の案内で、プレイヤーの操作を待っているもの
  const [guideWait, setGuideWait] = useState<GuideFx['wait'] | null>(null)
  // 正解直後、Firestore の反映を待たずにエルフを出すための時刻
  const [localProceedAt, setLocalProceedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
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
    if (code !== requestProblem.answer) return 'wrong'
    setShopOpen(false)
    onSolved()
    return 'ok'
  }

  const sockCode = (() => {
    const order = doc.order
    if (!order) return undefined
    if (lastProblem) return lastProblem.code
    const first = products.find((p) => p.id === order.items[0]?.id)
    if (first) return PROBLEMS[first.category].code
    if (isGame1LoseCart(order.items)) return PROBLEMS.game1.code
    return undefined
  })()
  const proceedAt = localProceedAt ?? doc.order?.proceedAt
  const stayed = !!doc.order?.stayed
  const showGuide =
    loaded &&
    doc.phase === 'game' &&
    ORDER_STAGES.includes(doc.stage) &&
    !!doc.order &&
    correctCart(doc.order.items) &&
    (doc.order.status === 'solved' || localProceedAt != null)
  const counting = showGuide && proceedAt != null && proceedAt > now
  const adultWait = counting || (showGuide && stayed)
  const adultReady = showGuide && !adultWait

  const onSolved = () => {
    if (!doc.order) return
    const nextProceedAt =
      ORDER_STAGES.includes(doc.stage) && correctCart(doc.order.items) ? Date.now() + adultWaitMs(doc.stage) : undefined
    if (nextProceedAt != null) {
      advancing.current = false
      setLocalProceedAt(nextProceedAt)
    }
    update({ order: { ...doc.order, status: 'solved', proceedAt: nextProceedAt, stayed: false } })
  }

  const goNext = () => {
    if (advancing.current) return
    advancing.current = true
    setLocalProceedAt(null)
    const stage = stageRef.current
    // ステージ3は、部屋から戻ったあとにクリアの会話がある
    if (stage === WORD_STAGE) update({ phase: 'clear' })
    else if (stage >= GAME_COUNT) update({ phase: 'end' })
    else update({ stage: stage + 1, phase: 'novel' })
  }

  // 正しい注文（ステージ1は王冠・タンバリン・フラフープ、ステージ3はペンギン・ダチョウ）は、数秒後に自動で届ける
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

  // LAST：エントツとボールを入れて待ち時間が終わったら、タップを待たずに【重要】の通知へ
  const ballsDone = adultReady && lastStep === 'balls'
  useEffect(() => {
    if (!ballsDone) return
    setLocalProceedAt(null)
    update({ last: { ...DEFAULT_LAST, ...doc.last, step: 'notice' } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ballsDone])

  useEffect(() => {
    if (!adultWait || proceedAt == null) return
    // タイマーはわずかに早く鳴ることがあるので、少し遅らせ、時刻も proceedAt 以上にする（早いと待ちのまま止まる）
    const t = setTimeout(() => setNow(Math.max(Date.now(), proceedAt)), Math.max(0, proceedAt - Date.now()) + 50)
    return () => clearTimeout(t)
  }, [adultWait, proceedAt])

  // スタッフのステイで proceedAt が未来に戻ったら、手元の時刻も合わせる
  useEffect(() => {
    const remote = doc.order?.proceedAt
    if (remote == null || remote <= Date.now()) return
    setLocalProceedAt((local) => (local != null && local >= remote ? local : remote))
  }, [doc.order?.proceedAt])

  useEffect(() => {
    if (!adultWait) {
      setAdultSkip(null)
      return
    }
    setAdultSkip(() => {
      const at = Date.now()
      setLocalProceedAt(at)
      setNow(at)
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
          // 【重要】の通知から、フェードでマスターエルフの会話へ
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
          onDone={() =>
            fadeThen(() => update({ stage: doc.stage + 1, phase: 'novel', order: null, bingo: { ...DEFAULT_BINGO, ...doc.bingo, step: 'done' } }))
          }
        />
      )
    } else {
      const Game = GAMES[doc.stage - 1]
      body = (
        <Game
          key={`g${doc.stage}-${doc.markSolved ? 's' : ''}`}
          stage={doc.stage}
          // ステージ1：マークと得点が分かったら、画面はそのままで続きの説明へ
          solved={doc.stage === 1 && !!doc.markSolved}
          onClear={() => (doc.stage === 1 ? update({ markSolved: true }) : update({ phase: 'clear' }))}
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
          if (doc.stage === HIDE_STAGE) setClearNext(doc.stage)
          // LAST：マスターエルフの話のあと、ルドリーのための注文に戻る
          if (doc.stage === LAST_STAGE) update({ phase: 'game' })
        }}
        endButton={
          doc.stage === 1 || doc.stage === HIDE_STAGE || doc.stage === LAST_STAGE
            ? undefined
            : {
                label: '次に進む',
                onClick: () =>
                  doc.stage >= GAME_COUNT ? update({ phase: 'end' }) : update({ stage: doc.stage + 1, phase: 'novel' }),
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
    // LAST は、取り出したあとの会話と【重要】の通知のあいだは注文できない
    (lastStep != null && doc.phase === 'game' && (lastStep === 'extract' || lastStep === 'notice'))
  const records = (doc.records ?? []).filter((id) => RECORDS[id])
  // 「やるべきこと」：そのステージでやること と、子どものキモチ（ハートの代わり）
  const task: { text?: string; mood?: Mood } = (() => {
    if (doc.phase !== 'game') return {}
    if (doc.stage === 1) return doc.markCleared ? { text: STAGE1_TASK, mood: ST1_MOOD_AFTER } : { mood: ST1_MOOD }
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
  // 注文が変わったら、ナゾは閉じた状態から
  useEffect(() => setProblemOpen(false), [orderAt])
  const openProblem = () => {
    if (!delivered) return
    setShopOpen(false)
    setArrivedSeenAt(orderAt)
    setProblemOpen(true)
  }
  // ステージ1：マークが分かったあとの説明（マークの画面のまま）
  const rulesGuide = loaded && entered && doc.stage === 1 && doc.phase === 'game' && !!doc.markSolved && !doc.markCleared && !blackout
  // ステージ1：正しい注文が届いたあとの、ソックスキーの説明
  const sockGuide =
    loaded && entered && doc.stage === 1 && doc.phase === 'game' && !!doc.markCleared && !doc.sockTold &&
    delivered && !!doc.order && correctCart(doc.order.items) && arrivedSeenAt === orderAt
  useEffect(() => {
    if (sockGuide) setShopOpen(false)
  }, [sockGuide])
  // ステージ1の案内：santazon / ナゾの画面の上で話している途中に、その画面が閉じてしまったら開き直す
  // （開発中の再読み込みで、台詞の位置は残るのに「マーク当て中は閉じる」が走り直す、など）
  const reopenForGuide = (w: 'shop' | 'sock') => {
    if (w === 'shop') {
      setSzTab('list')
      setShopOpen(true)
    } else openProblem()
  }
  // ソックスキーを導くボタンは、注文できる場面で出す（届くまでは灰色）
  const showSockKey = !markQuiz && doc.phase === 'game' && !shopOpen
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
                onOpenProblem={openProblem}
                guide={doc.phase === 'game' && doc.stage === HIDE_STAGE ? guide.sz : null}
              />
            )}
          </div>
          {/* 最後（エンディング・エクストラゲーム）は、下のボタンを出さない */}
          {doc.phase !== 'end' && <GameMenu
            shopOpen={shopOpen}
            locked={talking}
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
            guide={guideWait === 'shop' || (doc.phase === 'game' && doc.stage === HIDE_STAGE && guide.menu) ? '注文' : null}
            guided={guideWait === 'shop' || (doc.phase === 'game' && doc.stage === HIDE_STAGE && (guide.menu || !!guide.sz))}
          />}
          {showSockKey && !talking && (
            <button className="sock-key-btn" disabled={!delivered} onClick={openProblem}>
              <svg viewBox="0 0 64 80" aria-hidden>
                <path fill="currentColor" d="M16 24h30v24c0 1 1 4 6 6 7 3 10 8 7 14-3 6-12 8-20 5L22 65c-8-4-12-11-10-18l4-8V24z" />
                <rect x="12" y="6" width="38" height="20" rx="6" fill="#fff" stroke="currentColor" strokeWidth="4" />
              </svg>
              <span>ソックスキーを導く</span>
            </button>
          )}
          {!talking && delivered && doc.order && arrivedSeenAt !== orderAt && (
            <ArrivalNotice onClose={() => setArrivedSeenAt(orderAt)} />
          )}
          {!talking && delivered && doc.order && problemOpen && (
            <ProblemDialog
              order={doc.order}
              problem={bingoRound ? ROUNDS[bingoRound].problem : lastProblem}
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
              onDone={() => update({ sockTold: true })}
            />
          )}
          {!talking && adultWait && !chair && (
            <div className="sz-elf-back is-static">
              <div className="sz-elf-line">
                <img src={characterImage('Common', '真顔')} alt="" />
                <p className="is-three">
                  <span>エルフ</span>
                  {/* LAST のルドリーのための注文は、大人部屋にはもう入れない */}
                  <em>{lastStep === 'super' ? <>【<b>行動シート</b>】に記入してください。</> : <>【<b>行動シート</b>】に記入して、大人部屋に向かいましょう。</>}</em>
                  <em>宅配ソックスの番号は「<b>{sockCode}</b>」です。</em>
                </p>
              </div>
            </div>
          )}
          {!talking && adultReady && !chair && lastStep !== 'balls' && (
            <div className="stage-next" onClick={goNext}>
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
            <div className="modal-back" onClick={() => setRecordsOpen(false)}>
              <div className="modal records" onClick={(e) => e.stopPropagation()}>
                <h2>記録</h2>
                <div className="records-list">
                  {records.map((id) => (
                    <figure key={id}>
                      <img src={RECORDS[id].image} alt="" />
                      <figcaption>{RECORDS[id].title}</figcaption>
                    </figure>
                  ))}
                </div>
                <button onClick={() => setRecordsOpen(false)}>閉じる</button>
              </div>
            </div>
          )}
          {!talking && taskOpen && (
            <div className="modal-back" onClick={() => setTaskOpen(false)}>
              <div className="modal task-modal" onClick={(e) => e.stopPropagation()}>
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
                <button onClick={() => setTaskOpen(false)}>閉じる</button>
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

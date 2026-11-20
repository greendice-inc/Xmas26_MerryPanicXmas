import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GuideArrow } from '../games/Stage1Guide'
import {
  CATEGORIES,
  MAX_CART,
  formatCode,
  isCorrectCart,
  type CategoryKey,
  type Product,
} from '../santazon/products'
import { useProducts } from '../santazon/useProducts'
import { isBingoCart, SURPRISE_NAME, surpriseShipped } from '../games/bingoData'

/** 「注文が確定しました」を自動で閉じるまで。商品が届く（PlayerScreen の DELIVER_MS）より前に閉じる */
const CONFIRM_MS = 3000
import { isLastCart, lastOrderGate, type LastGate } from '../games/lastData'
import { hl } from './GameTalk'
import { useGameLines } from '../script/scriptData'
import { LAST_STAGE } from '../config'
import { characterImage } from '../scenario'
import TenKey from './TenKey'
import { DEFAULT_LAST, type OrderItem, type TeamDoc } from '../types'

interface Props {
  doc: TeamDoc
  update: (patch: Partial<TeamDoc>) => void
  cart: OrderItem[]
  setCart: (f: (c: OrderItem[]) => OrderItem[]) => void
  onClose: () => void
  /** 表示中のタブ。渡すと親が切り替えを管理する（ステージ2の案内で使う） */
  tab?: SzTab
  onTab?: (tab: SzTab) => void
  /** false = リスト追加検索タブを出さない（ステージ2の案内で解放するまで） */
  searchUnlocked?: boolean
  /** 案内で目立たせる場所 */
  guide?: SzGuide | null
  /** 正しい注文を確定する直前に呼ぶ。true を返すと注文しない（ステージ3の椅子の話） */
  onBeforeOrder?: () => boolean
  /** 取り出し依頼（ステージ4から）。入れた番号で取り出せたか */
  onRequest?: (code: string) => RequestResult
  /** 届いた注文のナゾ（宅配ソックスのナゾ）をもう一度開く */
  onOpenProblem?: () => void
  /** true の間は、ホームボタンで閉じられない */
  closeLocked?: boolean
  /** 「注文が確定しました」を閉じたとき */
  onConfirmedClose?: () => void
  /** 届いたあと、ナゾを開くまで「ソックスキーを導く」ボタンを光らせる */
  sockGlow?: boolean
}

/** ok=取り出せた / wrong=番号が違う / none=いま取り出せるものがない */
export type RequestResult = 'ok' | 'wrong' | 'none'
const REQUEST_MSG: Record<Exclude<RequestResult, 'ok'>, string> = {
  wrong: 'その番号では取り出せないみたい。もう一度確かめてみよう。',
  none: 'いま取り出せるアイテムはないみたい。',
}

/** Santazon の画像（public/BG/Common/santazon） */
const SZ_DIR = `${import.meta.env.BASE_URL}BG/Common/santazon/`
const SZ = {
  backList: `${SZ_DIR}san_back 1.webp`,
  backSearch: `${SZ_DIR}san_back2.webp`,
  /** カテゴリのタブ。on=選んでいる（紫）/ off=灰色 */
  cat: (k: string, on: boolean) => `${SZ_DIR}list_${k}${on ? 1 : 2}.webp`,
  item: `${SZ_DIR}item1.webp`,
  itemSurprise: `${SZ_DIR}item2.webp`,
  detail: `${SZ_DIR}item3.webp`,
  addCart: `${SZ_DIR}item4.webp`,
  order: `${SZ_DIR}cart1.webp`,
  shipped: `${SZ_DIR}cart2.webp`,
  sockKey: `${SZ_DIR}cart3.webp`,
  request: `${SZ_DIR}cart4.webp`,
  num: (d: string) => `${SZ_DIR}num${d}.webp`,
  numBox: `${SZ_DIR}num_box.webp`,
}

/** カテゴリのタブ。from=このステージから出す */
const CAT_TABS: { key: CategoryKey; img: string; label: string; from: number }[] = [
  { key: 'game1', img: 'a', label: '1st', from: 1 },
  { key: 'game3', img: 'b', label: '3rd', from: 3 },
  { key: 'game4', img: 'c', label: '4th', from: 4 },
  { key: 'final', img: 'd', label: 'Last', from: LAST_STAGE },
]

export type SzTab = 'list' | 'search'
/** tab=リスト追加検索タブを目立たせる / talk=説明中（どこも触れない） / drag2=マネキンの番号を1文字ずつ枠へドラッグしてもらう（その数字と枠と検索と結果の閉じるだけ触れる） / searched=リスト画面で「登録済みアイテム」を矢印で示す（どこも触れない） */
export type SzGuide = 'tab' | 'talk' | 'drag2' | 'searched'

/** リスト追加検索で、検索済みリストに載せてよい商品（名前が一致するか、前方一致） */
const SEARCH_LIST_NAMES = new Set(['マネキン', 'セーター', 'オーバーオール', 'スーパーボール', 'エントツ', '金庫'])
const SEARCH_LIST_PREFIXES = ['サッカーボール']
const canList = (name: string) => SEARCH_LIST_NAMES.has(name) || SEARCH_LIST_PREFIXES.some((x) => name.startsWith(x))

function ProductImage({ p }: { p: Product }) {
  if (!p.image) return null
  return <img src={p.image} alt="" />
}

/** 注文画面「Santazon」。見た目はネット通販サイト風 */
export default function Santazon({ doc, update, cart, setCart, onClose, tab: tabProp, onTab, searchUnlocked = true, guide, onBeforeOrder, onRequest, onOpenProblem, onConfirmedClose, sockGlow, closeLocked }: Props) {
  const { products } = useProducts()
  const productById = (id: string) => products.find((p) => p.id === id)
  const [ownTab, setOwnTab] = useState<SzTab>('list')
  const tab = searchUnlocked ? (tabProp ?? ownTab) : 'list'
  const setTab = (t: SzTab) => {
    setOwnTab(t)
    onTab?.(t)
  }
  // 初期値は現在のステージのカテゴリ。選び直したら、そちらを優先する
  // LAST はファイナルゲーム用アイテムから
  const isLast = doc.stage >= LAST_STAGE
  const stageCategory: CategoryKey = isLast ? 'final' : doc.stage >= 4 ? 'game4' : doc.stage >= 3 ? 'game3' : 'game1'
  const [picked, setPicked] = useState<CategoryKey | null>(null)
  const category = picked ?? stageCategory
  const [showSearched, setShowSearched] = useState(false)
  const [detail, setDetail] = useState<Product | null>(null)
  const [help, setHelp] = useState(false)
  // リストはバーを出さず、ドラッグでスクロールする。いちばん上にいて下に続きがあるときは、▼でサインを出す
  const listRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: number; y: number; top: number; moved: boolean } | null>(null)
  const justDragged = useRef(false)
  // moreBelow=まだ下に続く（白いグラデーション）/ atTop=いちばん上（▼のサイン）
  const [scrollState, setScrollState] = useState({ moreBelow: false, atTop: false })
  const checkMore = () => {
    const el = listRef.current
    const moreBelow = !!el && el.scrollTop + el.clientHeight < el.scrollHeight - 4
    const atTop = moreBelow && !!el && el.scrollTop < 8
    setScrollState((p) => (p.moreBelow === moreBelow && p.atTop === atTop ? p : { moreBelow, atTop }))
  }
  const onListDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // 指（タッチ）は、ブラウザ自身のスクロールに任せる。マウス・ペンだけドラッグで動かす
    if (e.pointerType === 'touch' || e.button !== 0) return
    dragRef.current = { id: e.pointerId, y: e.clientY, top: e.currentTarget.scrollTop, moved: false }
  }
  const onListMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    const el = listRef.current
    if (!d || !el || d.id !== e.pointerId) return
    // 画面は拡縮されているので、ポインタの動きを、このリストの中の長さに直す
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
  const onListUp = () => {
    // ドラッグしたあとは、離した場所のボタンを押したことにしない
    if (dragRef.current?.moved) {
      justDragged.current = true
      setTimeout(() => (justDragged.current = false), 0)
    }
    dragRef.current = null
  }
  // 案内「登録済みアイテム」の矢印の先（この画面の座標）
  const rootRef = useRef<HTMLDivElement>(null)
  const [searchedArrow, setSearchedArrow] = useState<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    const root = rootRef.current
    const btn = root?.querySelector<HTMLElement>('.sz-cat.is-wide')
    if (guide !== 'searched' || tab !== 'list' || !root || !btn) return setSearchedArrow(null)
    const r = root.getBoundingClientRect()
    const k = r.width / root.offsetWidth
    const b = btn.getBoundingClientRect()
    setSearchedArrow({ x: (b.left + b.width / 2 - r.left) / k, y: (b.bottom - r.top) / k + 4 })
  }, [guide, tab])
  const [rejected, setRejected] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const closeConfirmed = () => {
    setConfirmed(false)
    onConfirmedClose?.()
  }
  // 「注文が確定しました」は、少しして自動で閉じる（届くのは、これより後）
  const closeRef = useRef(closeConfirmed)
  closeRef.current = closeConfirmed
  useEffect(() => {
    if (!confirmed) return
    const t = setTimeout(() => closeRef.current(), CONFIRM_MS)
    return () => clearTimeout(t)
  }, [confirmed])
  const [requesting, setRequesting] = useState(false)
  // 注文を止めたときのメッセージ（真ん中の表示 → エルフ）
  const [gate, setGate] = useState<LastGate | null>(null)
  // 会話（scene）のときの、いま何行目か
  const [gateIdx, setGateIdx] = useState(0)
  const gateLines = { basket: useGameLines('st5-basket'), again: useGameLines('st5-again'), final: useGameLines('st5-final'), wrong: useGameLines('st5-wrong') }
  const [requestMsg, setRequestMsg] = useState<string | null>(null)

  // 中央の表示を閉じたら、エルフの会話（またはひと言）へ
  const closeGateCenter = () => {
    setGateIdx(0)
    setGate(gate ? { elf: gate.elf, scene: gate.scene } : null)
  }
  // 最後のチャンスの通告への答え。はい＝発送の判定へ（不正解ならはじく）/ いいえ＝そのまま閉じる
  const answerFinal = (yes: boolean) => {
    setGate(null)
    setGateIdx(0)
    if (yes) confirm(true)
  }
  // 会話を1行進める。最後まで話したら閉じる（埋まっていた話のあとは、取り出し依頼ボタンが使えるようになる）
  const nextGate = () => {
    if (!gate?.scene) return
    if (gateIdx + 1 < gateLines[gate.scene].length) return setGateIdx(gateIdx + 1)
    if (gate.scene === 'basket') update({ last: { ...DEFAULT_LAST, ...doc.last, basketTold: true } })
    setGate(null)
    setGateIdx(0)
  }
  // LAST：空になる前（会話を聞く前）と、空になったあとは、取り出し依頼ボタンを押せない
  const requestOff = isLast && !(doc.last?.step === 'basket' && !!doc.last?.basketTold)

  // 届く途中・解答中は新しい注文ができない。考え直す注文と、解き終わった注文は入れ直せる
  const ordering = !!doc.order && (doc.order.status === 'ordered' || doc.order.status === 'delivered')
  const cartCount = cart.reduce((s, i) => s + i.qty, 0)
  const full = cartCount >= MAX_CART

  // サプライズアイテムは、子どもたちが発送した分だけ減る（ロビン：ビンゴの各ラウンドで3個、ルドリー：ファイナルゲームの開始時に1個）
  const kidOrdered = (p: Product) => (p.name === SURPRISE_NAME ? surpriseShipped(doc.stage, LAST_STAGE, doc.bingo?.step) : 0)
  const remaining = (p: Product) =>
    p.available -
    kidOrdered(p) -
    (doc.orderedQty.find((i) => i.id === p.id)?.qty ?? 0) -
    (cart.find((i) => i.id === p.id)?.qty ?? 0)

  const add = (p: Product) =>
    setCart((c) =>
      c.some((i) => i.id === p.id)
        ? c.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i))
        : [...c, { id: p.id, qty: 1 }],
    )
  const dec = (id: string) =>
    setCart((c) => c.flatMap((i) => (i.id !== id ? [i] : i.qty > 1 ? [{ ...i, qty: i.qty - 1 }] : [])))

  const confirm = (finalTold = false) => {
    if (!cart.length || ordering) return
    // LAST の最後（ルドリーのための注文）：中身が何であっても、先に「最後のチャンス」の通告を出す。通告のあとで、普通に判定する
    if (isLast && doc.last?.step === 'super' && !finalTold) {
      setGateIdx(0)
      setGate({ scene: 'final' })
      return
    }
    // LAST：宅配ソックスが埋まっている・見落としがあるなど、決まった注文だけ特別なメッセージで止める
    const stop = isLast ? lastOrderGate(doc.last?.step, cart, products) : null
    if (stop) {
      setGateIdx(0)
      setGate(stop)
      return
    }
    const correct =
      doc.stage === 4
        ? isBingoCart(doc.bingo?.step, cart, products)
        : isLast
          ? isLastCart(doc.last?.step, cart, products)
          : isCorrectCart(doc.stage, cart)
    if (correct) {
      if (onBeforeOrder?.()) return
      const orderedQty = [...doc.orderedQty]
      cart.forEach((c) => {
        const e = orderedQty.find((o) => o.id === c.id)
        if (e) e.qty += c.qty
        else orderedQty.push({ ...c })
      })
      update({ order: { items: cart, status: 'ordered', at: Date.now() }, orderedQty: orderedQty.map((o) => ({ ...o })) })
      setCart(() => [])
      setConfirmed(true)
    } else {
      update({ order: { items: cart, status: 'wrong', at: Date.now() } })
      setRejected(true)
    }
  }

  // カテゴリのタブ（2nd・5th は商品がないので出さない）。ステージが進むほど増える
  const tabs = CAT_TABS.filter((t) => doc.stage >= t.from)
  const selected = tabs.some((t) => t.key === category) ? category : tabs[tabs.length - 1].key
  const listed = products.filter((p) => p.category === selected && p.listed)
  const searchedProducts = doc.searched.map(productById).filter((p): p is Product => !!p)
  const rows = showSearched ? searchedProducts : listed
  // リストの中身が変わったとき（タブ・カテゴリ・件数）にだけ、スクロールのサインを確かめる。
  // 毎回の描画で確かめると、サインの出入りで描画が止まらなくなることがある
  useLayoutEffect(() => {
    checkMore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selected, showSearched, rows.length])
  const openSearched = () => {
    setTab('list')
    setShowSearched(true)
  }
  // カートは3枠。同じ商品を2つ入れたら2枠使う
  const units = cart.flatMap((i) => Array.from({ length: i.qty }, () => i.id))
  const delivered = doc.order?.status === 'delivered'

  return (
    <div
      ref={rootRef}
      className={`santazon is-${tab}${guide ? ' is-guided' : ''}${guide === 'drag2' ? ' is-drag2' : ''}`}
      style={{ backgroundImage: `url("${tab === 'list' ? SZ.backList : SZ.backSearch}")` }}
    >
      {/* 閉じさせない間（ビンゴ ROUND1 の最初の注文から、エルフの説明が終わるまで）は、ホームボタンを出さない */}
      {!closeLocked && <button className="sz-home" onClick={onClose} aria-label="ホームに戻る" />}
      <button className="sz-help" onClick={() => setHelp(true)}>？ 使い方</button>
      <button className="sz-tab is-list" aria-label="リスト" onClick={() => setTab('list')} />
      {searchUnlocked && (
        <button
          className={`sz-tab is-search${guide === 'tab' ? ' is-guide' : ''}`}
          aria-label="リスト登録"
          onClick={() => {
            setTab('search')
            setShowSearched(false)
          }}
        />
      )}

      {tab === 'list' ? (
        <>
          <nav className="sz-cats">
            {tabs.map((t) => (
              <button
                key={t.key}
                className="sz-cat"
                aria-label={t.label}
                onClick={() => {
                  setPicked(t.key)
                  setShowSearched(false)
                }}
              >
                <img src={SZ.cat(t.img, !showSearched && selected === t.key)} alt={t.label} draggable={false} />
              </button>
            ))}
            <button className="sz-cat is-wide" aria-label="登録済みアイテム" onClick={openSearched}>
              <img src={SZ.cat('e', showSearched)} alt="登録済みアイテム" draggable={false} />
            </button>
          </nav>

          <div
            className="sz-list"
            ref={listRef}
            onScroll={checkMore}
            onPointerDown={onListDown}
            onPointerMove={onListMove}
            onPointerUp={onListUp}
            onPointerCancel={onListUp}
            onClickCapture={(e) => {
              if (justDragged.current) {
                e.stopPropagation()
                e.preventDefault()
              }
            }}
          >
            {rows.length === 0 && (
              <div className="sz-empty">{showSearched ? 'まだ登録したアイテムはありません' : 'このカテゴリに掲載中の商品はありません'}</div>
            )}
            {rows.map((p) => {
              const left = remaining(p)
              const soldOut = left <= 0
              const surprise = p.name === SURPRISE_NAME
              return (
                <div
                  className={`sz-item${soldOut ? ' sold-out' : ''}${surprise ? ' is-surprise' : ''}`}
                  key={p.id}
                  style={{ backgroundImage: `url("${surprise ? SZ.itemSurprise : SZ.item}")` }}
                >
                  {/* サプライズアイテムは、名前が画像に入っている */}
                  <div className="sz-item-name" style={surprise ? { visibility: 'hidden' } : undefined}>
                    <b>{p.name}</b>
                    <small>{formatCode(p.code)}</small>
                  </div>
                  {/* 詳細ボタンは、アイテム登録で「なし」にした商品には出さない */}
                  {p.hasDetail && (
                    <button className="sz-item-btn is-detail" aria-label="詳細" onClick={() => setDetail(p)}>
                      <img src={SZ.detail} alt="" draggable={false} />
                    </button>
                  )}
                  <button className="sz-item-btn is-cart" aria-label="カートに追加" disabled={soldOut || full || ordering} onClick={() => add(p)}>
                    <img src={SZ.addCart} alt="" draggable={false} />
                  </button>
                  <div className="sz-item-stock">
                    {Math.max(0, left)}/{p.stock}
                  </div>
                </div>
              )
            })}
          </div>

          {scrollState.moreBelow && <div className="sz-scroll-fade" aria-hidden />}
          {scrollState.atTop && <div className="sz-scroll-hint" aria-hidden>▼</div>}

          <aside className="sz-cart">
            {Array.from({ length: MAX_CART }, (_, i) => {
              const p = units[i] ? productById(units[i]) : undefined
              return (
                <div className="sz-cart-slot" key={i}>
                  {p && (
                    <>
                      <span>{p.name}</span>
                      <button aria-label="カートから外す" onClick={() => dec(p.id)}>✕</button>
                    </>
                  )}
                </div>
              )
            })}
            <button className="sz-order" disabled={!cart.length || ordering} onClick={() => confirm()} aria-label={ordering ? '発送済み' : '注文する'}>
              <img src={ordering ? SZ.shipped : SZ.order} alt="" draggable={false} />
            </button>
            <button className={`sz-side-btn is-sock${sockGlow ? ' is-glow' : ''}`} disabled={!delivered || !onOpenProblem} onClick={onOpenProblem} aria-label="ソックスキーを導く">
              <img src={SZ.sockKey} alt="" draggable={false} />
            </button>
            {onRequest && (
              <button className="sz-side-btn is-request" disabled={requestOff} onClick={() => setRequesting(true)} aria-label="エルフに取り出し依頼">
                <img src={SZ.request} alt="" draggable={false} />
              </button>
            )}
          </aside>
        </>
      ) : (
        <SearchTab
          products={products}
          searched={doc.searched}
          onFound={(ids) => {
            const addIds = ids.filter((id) => {
              const p = productById(id)
              return !!p && canList(p.name) && !doc.searched.includes(id)
            })
            if (addIds.length) update({ searched: [...doc.searched, ...addIds] })
          }}
          onOpenSearched={openSearched}
          // LAST：警告を受けたあと（ルドリーのためのスーパーボールを探す場面）は、説明文の下に一文が足される
          extraLine={isLast && doc.last?.step === 'super' ? LAST_EXTRA_LINE : undefined}
          guide={guide ?? null}
          // 案内中は、結果を閉じたら自動でリスト画面に戻る
          onResultClosed={() => {
            if (guide !== 'drag2') return
            setTab('list')
            setShowSearched(false)
          }}
        />
      )}

      {searchedArrow && <GuideArrow key="searched-arrow" x={searchedArrow.x} y={searchedArrow.y} up />}

      {detail && (
        <div className="sz-dialog-back" onClick={() => setDetail(null)}>
          <div className="sz-dialog" onClick={(e) => e.stopPropagation()}>
            {detail.image && (
              <div className="sz-thumb sz-thumb-lg">
                <ProductImage p={detail} />
              </div>
            )}
            <h2>{detail.name}</h2>
            <p>{detail.description || '詳しい説明は準備中です。'}</p>
            <button className="sz-btn sz-yellow" onClick={() => setDetail(null)}>閉じる</button>
          </div>
        </div>
      )}

      {help && (
        <div className="sz-dialog-back" onClick={() => setHelp(false)}>
          <div className="sz-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Santazonの使い方</h2>
            <p>必要なアイテムを3つまでカートに追加して、注文確定ボタンを押すと、注文したものが宅配ソックスに届きます。</p>
            <p>宅配ソックスの番号は、注文したあとに出てくる謎を解くとわかります。</p>
            <button className="sz-btn sz-yellow" onClick={() => setHelp(false)}>閉じる</button>
          </div>
        </div>
      )}

      {rejected && (
        <div className="sz-elf-back" onClick={() => setRejected(false)}>
          <div className="sz-elf-line">
            <img src={characterImage('Common', '真顔')} alt="" />
            <p>
              <span>エルフ</span>
              注文するものをもう一度考えた方がよさそうだね。
            </p>
          </div>
        </div>
      )}

      {requesting && onRequest && (
        <div className="sz-dialog-back" onClick={() => setRequesting(false)}>
          <div className="sz-dialog sz-request-dialog" onClick={(e) => e.stopPropagation()}>
            <button className="sz-close" onClick={() => setRequesting(false)} aria-label="閉じる">✕</button>
            <h2>取り出し依頼</h2>
            <p>キーボックスの番号（4桁）を入力してください。</p>
            <TenKey
              length={4}
              okLabel="依頼"
              onSubmit={(code) => {
                const r = onRequest(code)
                if (r === 'ok') setRequesting(false)
                else setRequestMsg(REQUEST_MSG[r])
              }}
            />
          </div>
        </div>
      )}

      {gate?.center && (
        <div className="sz-dialog-back" onClick={() => closeGateCenter()}>
          <div className="sz-dialog sz-gate" onClick={(e) => e.stopPropagation()}>
            <p style={{ whiteSpace: 'pre-line' }}>{gate.center}</p>
            <button className="sz-btn sz-yellow" onClick={() => closeGateCenter()}>閉じる</button>
          </div>
        </div>
      )}
      {gate && !gate.center && gate.scene && gateLines[gate.scene][gateIdx] && (
        <div className="sz-elf-back" onClick={gate.scene === 'final' && gateIdx + 1 >= gateLines.final.length ? undefined : nextGate}>
          <div className="sz-elf-line">
            <img src={characterImage('Common', gateLines[gate.scene][gateIdx].emotion ?? '真顔')} alt="" />
            <p className="is-pre">
              <span>{gateLines[gate.scene][gateIdx].speaker}</span>
              {hl(gateLines[gate.scene][gateIdx].text)}
            </p>
          </div>
          {/* 最後のチャンスの通告：はい＝判定へ / いいえ＝そのまま閉じる（最後の行で選ぶ） */}
          {gate.scene === 'final' && gateIdx + 1 >= gateLines.final.length && (
            <div className="sz-choice">
              <button className="sz-btn sz-yellow" onClick={() => answerFinal(true)}>はい</button>
              <button className="sz-btn sz-light" onClick={() => answerFinal(false)}>いいえ</button>
            </div>
          )}
        </div>
      )}
      {gate && !gate.center && !gate.scene && gate.elf && (
        <div className="sz-elf-back" onClick={() => setGate(null)}>
          <div className="sz-elf-line">
            <img src={characterImage('Common', '真顔')} alt="" />
            <p className="is-pre">
              <span>エルフ</span>
              {gate.elf}
            </p>
          </div>
        </div>
      )}

      {requestMsg && (
        <div className="sz-elf-back" onClick={() => setRequestMsg(null)}>
          <div className="sz-elf-line">
            <img src={characterImage('Common', '真顔')} alt="" />
            <p>
              <span>エルフ</span>
              {requestMsg}
            </p>
          </div>
        </div>
      )}

      {confirmed && (
        <div className="sz-dialog-back" onClick={closeConfirmed}>
          <div className="sz-dialog sz-confirmed" onClick={(e) => e.stopPropagation()}>
            <p>
              注文が確定しました。<br/>商品が届くまでお待ちください。
            </p>
            <button className="sz-btn sz-yellow" onClick={closeConfirmed}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProductDetail({ p }: { p: Product }) {
  return (
    <div className="sz-detail">
      {p.image && (
        <div className="sz-thumb sz-thumb-lg">
          <ProductImage p={p} />
        </div>
      )}
      <div className="sz-detail-text">
        <div className="sz-name sz-name-lg">{p.name}</div>
        <div className="sz-code">リスト追加検索番号：{formatCode(p.code)}</div>
        <p>{p.description || '詳しい説明は準備中です。'}</p>
      </div>
    </div>
  )
}

/** 枠に文字を並べたときに、その商品を探す合言葉 */
const SPECIAL_WORDS: Record<string, string> = {
  オバオル: 'オーバーオール',
  スパボル: 'スーパーボール',
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

/** 下の説明文。ここにある文字も、枠へドラッグできる */
const HINT_LINES = [
  '画面中のオレンジの文字を引っ張って、',
  'バーで繋がれた4つのパープルの枠に当てはめることで',
  'アイテムを指定すること。',
]
/** LAST：警告を受けたあと、説明文の下にしれっと足す一文（この文字を使って「スパボル」を並べられる） */
const LAST_EXTRA_LINE = 'ボスエルフの命令により、もう大人部屋に入ることはできない。'

/** 4桁のコードを、下の数字パネルをドラッグして四角にはめ込み、商品を検索する */
function SearchTab({
  products,
  searched,
  onFound,
  onOpenSearched,
  guide,
  onResultClosed,
  extraLine,
}: {
  products: Product[]
  searched: string[]
  onFound: (ids: string[]) => void
  onOpenSearched: () => void
  guide: SzGuide | null
  onResultClosed: () => void
  /** 説明文の下に足す一文 */
  extraLine?: string
}) {
  const hintLines = extraLine ? [...HINT_LINES, extraLine] : HINT_LINES
  const rootRef = useRef<HTMLDivElement>(null)

  const [slots, setSlots] = useState<(string | null)[]>([null, null, null, null])
  const emptyIdx = slots.findIndex((v) => v === null)
  const [drag, setDrag] = useState<{ digit: string; x: number; y: number } | null>(null)
  const [result, setResult] = useState<Product[] | 'none' | null>(null)

  // 画面は拡縮されているので、ポインタ座標をこの要素内の座標に直す
  const local = (e: React.PointerEvent) => {
    const el = rootRef.current!
    const r = el.getBoundingClientRect()
    const s = r.width / el.offsetWidth
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }
  }

  const down = (digit: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ digit, ...local(e) })
  }
  const move = (e: React.PointerEvent) => {
    if (drag) setDrag({ ...drag, ...local(e) })
  }
  const up = (e: React.PointerEvent) => {
    if (!drag) return
    const hit = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.slot !== undefined)
    if (hit) {
      // 案内中は、指している枠（左から順）に入れる
      const idx = guide === 'drag2' && emptyIdx >= 0 ? emptyIdx : Number(hit.dataset.slot)
      setSlots((s) => s.map((v, i) => (i === idx ? drag.digit : v)))
      setResult(null)
    }
    setDrag(null)
  }

  const filled = slots.every((s) => s !== null)

  // マネキンのアイテム番号の、次に入れる数字を枠へドラッグするところを、矢印でくり返し見せる（座標はこの画面の中）
  const [arrow, setArrow] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null)
  const guideDigit = (products.find((p) => p.name === 'マネキン')?.code ?? '')[emptyIdx] ?? null
  useLayoutEffect(() => {
    const root = rootRef.current
    const from = guideDigit ? root?.querySelector<HTMLElement>(`.sz-panel[aria-label="${guideDigit}"]`) : null
    const to = emptyIdx >= 0 ? root?.querySelector<HTMLElement>(`.sz-slot[data-slot="${emptyIdx}"]`) : null
    if (guide !== 'drag2' || !root || !from || !to) return setArrow(null)
    const r = root.getBoundingClientRect()
    const k = r.width / root.offsetWidth
    const at = (el: HTMLElement) => {
      const b = el.getBoundingClientRect()
      return { x: (b.left + b.width / 2 - r.left) / k, y: (b.top + b.height / 2 - r.top) / k }
    }
    const a = at(from)
    const b = at(to)
    setArrow({ sx: a.x, sy: a.y, ex: b.x, ey: b.y })
  }, [guide, emptyIdx, guideDigit])
  const search = () => {
    const code = slots.join('')
    // 文字を並べたときだけの特別な検索（番号は要らない）
    const special = SPECIAL_WORDS[code]
    const found = special ? products.filter((p) => p.name === special) : products.filter((p) => p.code === code)
    setResult(found.length ? found : 'none')
    onFound(found.map((p) => p.id))
  }
  const closeResult = () => {
    setResult(null)
    onResultClosed()
  }
  const clear = () => {
    setSlots([null, null, null, null])
    setResult(null)
  }

  return (
    <div className="sz-search" ref={rootRef}>
      <p className="sz-search-lead">
        商品を指定するとアイテムをリストに追加できます。
        <br />
        一度登録したものは「登録済みアイテム」から確認できます。
      </p>
      <button className="sz-search-list" onClick={onOpenSearched} aria-label={`登録済みアイテム（${searched.length}）`}>
        <img src={SZ.cat('e', false)} alt="" draggable={false} />
        <span>{searched.length}</span>
      </button>

      {/* デバッグモード（?debug=true）：リスト登録で出せるアイテムを、左に小さく出しておく */}
      {new URLSearchParams(location.search).get('debug') === 'true' && (
        <ul className="sz-debug-items" aria-hidden>
          {products
            .filter((p) => canList(p.name))
            .map((p) => (
              <li key={p.id}>
                <b>{formatCode(p.code)}</b> {p.name}
              </li>
            ))}
        </ul>
      )}

      <div className="sz-slots">
        {slots.map((v, i) => (
          <div key={i} className="sz-slot-wrap">
            {i > 0 && <span className="sz-dash">ー</span>}
            <div
              className={`sz-slot${v ? ' filled' : ''}${v && !DIGITS.includes(v) ? ' is-char' : ''}`}
              data-slot={i}
              style={{ backgroundImage: `url("${v && DIGITS.includes(v) ? SZ.num(v) : SZ.numBox}")` }}
              onClick={() => setSlots((s) => s.map((x, j) => (j === i ? null : x)))}
            >
              {v && !DIGITS.includes(v) ? v : ''}
            </div>
          </div>
        ))}
      </div>

      <div className="sz-search-actions">
        <button className={`sz-btn sz-yellow${guide === 'drag2' && filled ? ' is-guide' : ''}`} disabled={!filled} onClick={search}>検索</button>
        <button className="sz-btn sz-light" onClick={clear}>クリア</button>
      </div>

      {/* 検索結果は、他の部品に押しつぶされないよう、上に重ねて出す */}
      <div className="sz-result" />
      {result && (
        <div className="sz-result-back" onClick={closeResult}>
          <div className="sz-result-pop" onClick={(e) => e.stopPropagation()}>
            {result === 'none' ? (
              <div className="sz-result-none">該当する商品は見つかりませんでした</div>
            ) : (
              result.map((p) => <ProductDetail p={p} key={p.id} />)
            )}
            <button className={`sz-btn sz-yellow${guide === 'drag2' ? ' is-guide' : ''}`} onClick={closeResult}>閉じる</button>
          </div>
        </div>
      )}

      <div className="sz-panels">
        {DIGITS.map((d) => (
          <button
            key={d}
            className={`sz-panel${guide === 'drag2' && d === guideDigit ? ' is-guide' : ''}`}
            aria-label={d}
            onPointerDown={down(d)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            <img src={SZ.num(d)} alt="" draggable={false} />
          </button>
        ))}
      </div>

      <p className="sz-search-hint">
        {hintLines.map((line, li) => (
          <span className="sz-hint-line" key={li}>
            {[...line].map((ch, ci) =>
              ch === '、' || ch === '。' || ch === ' ' ? (
                <span key={`${li}-${ci}`}>{ch}</span>
              ) : (
                <button
                  key={`${li}-${ci}`}
                  className="sz-hint-ch"
                  onPointerDown={down(ch)}
                  onPointerMove={move}
                  onPointerUp={up}
                  onPointerCancel={up}
                >
                  {ch}
                </button>
              ),
            )}
            {li < hintLines.length - 1 && <br />}
          </span>
        ))}
      </p>

      {arrow && !drag && (
        <svg
          // 行き先が変わるたびに作り直して、動きを最初からやり直す。
          // 作り直さないと、端末によっては（iPad の Safari など）動いている途中の矢印が前の行き先（--dx/--dy）のまま動き、1つ右の枠などへ向かってしまう
          key={`${emptyIdx}-${guideDigit}-${Math.round(arrow.sx)}-${Math.round(arrow.ex)}-${Math.round(arrow.ey)}`}
          className="sz-drag-arrow"
          viewBox="0 0 120 150"
          style={{
            left: arrow.sx - 60,
            top: arrow.sy,
            ['--dx' as string]: `${arrow.ex - arrow.sx}px`,
            ['--dy' as string]: `${arrow.ey - arrow.sy}px`,
            // 矢印の先を、動く向き（数字 → 枠）に向ける。「1」のように横へ大きく動くときも、先が進む方を指す
            ['--rot' as string]: `${(Math.atan2(arrow.ex - arrow.sx, arrow.sy - arrow.ey) * 180) / Math.PI}deg`,
          }}
          aria-hidden
        >
          <path d="M38 144h44V74h32L60 6 6 74h32z" fill="#ff8a00" stroke="#2a2a30" strokeWidth="8" strokeLinejoin="round" />
        </svg>
      )}

      {drag && (
        <div className={`sz-panel sz-ghost${DIGITS.includes(drag.digit) ? '' : ' is-char'}`} style={{ left: drag.x - 77, top: drag.y - 77 }}>
          {DIGITS.includes(drag.digit) ? <img src={SZ.num(drag.digit)} alt="" /> : drag.digit}
        </div>
      )}
    </div>
  )
}

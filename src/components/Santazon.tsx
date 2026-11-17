import { useRef, useState } from 'react'
import {
  CATEGORIES,
  MAX_CART,
  formatCode,
  isCorrectCart,
  type CategoryKey,
  type Product,
} from '../santazon/products'
import { useProducts } from '../santazon/useProducts'
import { isBingoCart, roundOf, SURPRISE_KID_ORDER, SURPRISE_NAME } from '../games/bingoData'
import { isLastCart, lastOrderGate } from '../games/lastData'
import { LAST_STAGE } from '../config'
import { characterImage } from '../scenario'
import TenKey from './TenKey'
import type { OrderItem, TeamDoc } from '../types'

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
/** tab=リスト追加検索タブを目立たせる / talk=説明中（どこも触れない） */
export type SzGuide = 'tab' | 'talk'

/** リスト追加検索で、検索済みリストに載せてよい商品（名前が一致するか、前方一致） */
const SEARCH_LIST_NAMES = new Set(['マネキン', 'セーター', 'オーバーオール', 'スーパーボール', 'エントツ', '金庫'])
const SEARCH_LIST_PREFIXES = ['サッカーボール']
const canList = (name: string) => SEARCH_LIST_NAMES.has(name) || SEARCH_LIST_PREFIXES.some((x) => name.startsWith(x))

function ProductImage({ p }: { p: Product }) {
  if (!p.image) return null
  return <img src={p.image} alt="" />
}

/** 注文画面「Santazon」。見た目はネット通販サイト風 */
export default function Santazon({ doc, update, cart, setCart, onClose, tab: tabProp, onTab, searchUnlocked = true, guide, onBeforeOrder, onRequest, onOpenProblem }: Props) {
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
  const [rejected, setRejected] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [requesting, setRequesting] = useState(false)
  // 注文を止めたときのメッセージ（真ん中の表示 → エルフ）
  const [gate, setGate] = useState<{ center?: string; elf?: string } | null>(null)
  const [requestMsg, setRequestMsg] = useState<string | null>(null)

  // 届く途中・解答中は新しい注文ができない。考え直す注文と、解き終わった注文は入れ直せる
  const ordering = !!doc.order && (doc.order.status === 'ordered' || doc.order.status === 'delivered')
  const cartCount = cart.reduce((s, i) => s + i.qty, 0)
  const full = cartCount >= MAX_CART

  // ステージ4：サプライズアイテムは、ロビンがラウンドごとに注文している
  const bingoRound = doc.stage === 4 ? roundOf(doc.bingo?.step) : null
  const kidOrdered = (p: Product) =>
    bingoRound && p.category === 'game4' && p.name === SURPRISE_NAME ? SURPRISE_KID_ORDER * (bingoRound === 'r1' ? 1 : 2) : 0
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

  const confirm = () => {
    if (!cart.length || ordering) return
    // LAST：宅配ソックスが埋まっている・見落としがあるなど、決まった注文だけ特別なメッセージで止める
    const stop = isLast ? lastOrderGate(doc.last?.step, cart, products) : null
    if (stop) {
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
  const openSearched = () => {
    setTab('list')
    setShowSearched(true)
  }
  // カートは3枠。同じ商品を2つ入れたら2枠使う
  const units = cart.flatMap((i) => Array.from({ length: i.qty }, () => i.id))
  const delivered = doc.order?.status === 'delivered'

  return (
    <div
      className={`santazon is-${tab}${guide ? ' is-guided' : ''}`}
      style={{ backgroundImage: `url("${tab === 'list' ? SZ.backList : SZ.backSearch}")` }}
    >
      <button className="sz-home" onClick={onClose} aria-label="ホームに戻る" />
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

          <div className="sz-list">
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
                  <button className="sz-item-btn is-detail" aria-label="詳細" onClick={() => setDetail(p)}>
                    <img src={SZ.detail} alt="" draggable={false} />
                  </button>
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
            <button className="sz-order" disabled={!cart.length || ordering} onClick={confirm} aria-label={ordering ? '発送済み' : '注文する'}>
              <img src={ordering ? SZ.shipped : SZ.order} alt="" draggable={false} />
            </button>
            <button className="sz-side-btn is-sock" disabled={!delivered || !onOpenProblem} onClick={onOpenProblem} aria-label="ソックスキーを導く">
              <img src={SZ.sockKey} alt="" draggable={false} />
            </button>
            {onRequest && (
              <button className="sz-side-btn is-request" onClick={() => setRequesting(true)} aria-label="エルフに取り出し依頼">
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
          guided={!!guide}
        />
      )}

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
        <div className="sz-dialog-back" onClick={() => setGate({ elf: gate.elf })}>
          <div className="sz-dialog sz-gate" onClick={(e) => e.stopPropagation()}>
            <p>{gate.center}</p>
            <button className="sz-btn sz-yellow" onClick={() => setGate({ elf: gate.elf })}>閉じる</button>
          </div>
        </div>
      )}
      {gate && !gate.center && gate.elf && (
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
        <div className="sz-dialog-back" onClick={() => setConfirmed(false)}>
          <div className="sz-dialog" onClick={(e) => e.stopPropagation()}>
            <p>注文が確定しました。商品が届くまでしばらくお待ちください。</p>
            <button className="sz-btn sz-yellow" onClick={() => setConfirmed(false)}>閉じる</button>
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
  'アイテムを指定すること',
]

/** 4桁のコードを、下の数字パネルをドラッグして四角にはめ込み、商品を検索する */
function SearchTab({
  products,
  searched,
  onFound,
  onOpenSearched,
  guided,
}: {
  products: Product[]
  searched: string[]
  onFound: (ids: string[]) => void
  onOpenSearched: () => void
  /** 説明中。下の説明文はいじれないので隠す */
  guided: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  const [slots, setSlots] = useState<(string | null)[]>([null, null, null, null])
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
      const idx = Number(hit.dataset.slot)
      setSlots((s) => s.map((v, i) => (i === idx ? drag.digit : v)))
      setResult(null)
    }
    setDrag(null)
  }

  const filled = slots.every((s) => s !== null)
  const search = () => {
    const code = slots.join('')
    // 文字を並べたときだけの特別な検索（番号は要らない）
    const special = SPECIAL_WORDS[code]
    const found = special ? products.filter((p) => p.name === special) : products.filter((p) => p.code === code)
    setResult(found.length ? found : 'none')
    onFound(found.map((p) => p.id))
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
        <button className="sz-btn sz-yellow" disabled={!filled} onClick={search}>検索</button>
        <button className="sz-btn sz-light" onClick={clear}>クリア</button>
      </div>

      {/* 検索結果は、他の部品に押しつぶされないよう、上に重ねて出す */}
      <div className="sz-result" />
      {result && (
        <div className="sz-result-back" onClick={() => setResult(null)}>
          <div className="sz-result-pop" onClick={(e) => e.stopPropagation()}>
            {result === 'none' ? (
              <div className="sz-result-none">該当する商品は見つかりませんでした</div>
            ) : (
              result.map((p) => <ProductDetail p={p} key={p.id} />)
            )}
            <button className="sz-btn sz-yellow" onClick={() => setResult(null)}>閉じる</button>
          </div>
        </div>
      )}

      <div className="sz-panels">
        {DIGITS.map((d) => (
          <button
            key={d}
            className="sz-panel"
            aria-label={d}
            onPointerDown={down(d)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            <img src={SZ.num(d)} alt="" draggable={false} />
          </button>
        ))}
      </div>

      <p className="sz-search-hint" style={guided ? { visibility: 'hidden' } : undefined}>
        {HINT_LINES.map((line, li) => (
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
            {li < HINT_LINES.length - 1 && <br />}
          </span>
        ))}
      </p>

      {drag && (
        <div className={`sz-panel sz-ghost${DIGITS.includes(drag.digit) ? '' : ' is-char'}`} style={{ left: drag.x - 77, top: drag.y - 77 }}>
          {DIGITS.includes(drag.digit) ? <img src={SZ.num(drag.digit)} alt="" /> : drag.digit}
        </div>
      )}
    </div>
  )
}

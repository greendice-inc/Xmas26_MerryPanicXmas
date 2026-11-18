import { useEffect, useRef, useState } from 'react'
import TenKey from './TenKey'
import { PROBLEMS, sockKeyOfItems } from '../santazon/products'
import { useProducts } from '../santazon/useProducts'
import { characterImage } from '../scenario'
import type { Order } from '../types'

/** 「アイテムが届きました。」のアニメーション（最後の「タップしてとじる」が出るところ）が終わるまで */
const ARRIVE_MS = 2700
/** 「正解！」を見せる長さ */
const CORRECT_MS = 1600
/** ナゾを開いてから、案内を出すまで */
const HINT_MS = 3000

function ProblemVisual({ src, onZoom }: { src?: string; onZoom: () => void }) {
  return (
    <div className="problem-center">
      <div className="problem-frame">
        <button className="problem-zoom" onClick={onZoom} aria-label="問題画像を大きく見る">
          {src ? <img className="sz-problem-img" src={src} alt="" /> : <span className="sz-problem-img placeholder">問題画像</span>}
        </button>
        <button className="problem-mag" onClick={onZoom} aria-label="大きく見る">
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle cx="10.5" cy="10.5" r="6.2" fill="none" stroke="currentColor" strokeWidth="2.2" />
          <path d="M10.5 8.2v4.6M8.2 10.5h4.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M15.2 15.2 20.4 20.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        </button>
      </div>
    </div>
  )
}

/** 届いたときの演出：真ん中にプレゼントが落ちてきて、はずみ、ふたが少し持ち上がって光る */
function DeliveryScene() {
  return (
    <svg className="arrive-scene" viewBox="0 0 800 560" aria-hidden>
      <defs>
        <radialGradient id="arrGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffe9a0" stopOpacity=".85" />
          <stop offset=".45" stopColor="#ffb347" stopOpacity=".28" />
          <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="arrShine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".32" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* うしろの光（ふたが持ち上がるときにふくらむ） */}
      <circle className="arrive-glow" cx="400" cy="290" r="290" fill="url(#arrGlow)" />

      {/* 影 */}
      <ellipse className="arrive-shadow" cx="412" cy="432" rx="180" ry="18" fill="#000" opacity=".25" />

      {/* 箱は、斜め上から見た立体（正面・右の側面・上の面）。右奥へ (+64, -36) */}
      <g className="arrive-box" strokeLinejoin="round" strokeWidth="3" stroke="#a85200">
        {/* 本体：右の側面 → 正面 */}
        <path d="M470 262L534 226V384L470 420Z" fill="#d9690a" />
        <path d="M470 322L534 286V310L470 346Z" fill="#a81a2b" stroke="#7e1220" />
        <path d="M280 262H470V420H280Z" fill="#ff8a1f" />
        <path d="M280 262H470V420H280Z" fill="url(#arrShine)" stroke="none" />
        <path d="M280 322H470V346H280Z" fill="#e0283a" stroke="#9d1830" />
        <path d="M362 262H388V420H362Z" fill="#e0283a" stroke="#9d1830" />
        <path d="M280 410H470V420H280Z" fill="#000" opacity=".12" stroke="none" />

        {/* ふた：右の側面 → 正面 → 上の面 → リボン → 蝶結び（持ち上がる） */}
        <g className="arrive-lid">
          <path d="M482 212L546 176V230L482 266Z" fill="#d9690a" />
          <path d="M268 212H482V266H268Z" fill="#ff8a1f" />
          <path d="M268 212H482V266H268Z" fill="url(#arrShine)" stroke="none" />
          <path d="M362 212H388V266H362Z" fill="#e0283a" stroke="#9d1830" />
          <path d="M268 212L332 176H546L482 212Z" fill="#ffb04d" />
          <path d="M294 198L307 190H521L508 198Z" fill="#ff4a5c" stroke="#9d1830" />
          <path d="M362 212L426 176H452L388 212Z" fill="#ff4a5c" stroke="#9d1830" />
          {/* 蝶結び */}
          <g stroke="#9d1830" strokeWidth="4">
            <path d="M407 190C372 140 322 156 350 186C366 194 392 192 407 190Z" fill="#ff4a5c" />
            <path d="M407 190C442 140 492 156 464 186C448 194 422 192 407 190Z" fill="#e0283a" />
            <path d="M407 190C384 162 358 166 366 184C378 190 394 190 407 190Z" fill="#c21f31" stroke="none" />
            <ellipse cx="407" cy="190" rx="17" ry="14" fill="#ff4a5c" />
          </g>
        </g>
      </g>

      {/* キラキラ */}
      <g className="arrive-sparkles" fill="#ffe14d" stroke="#e6a800" strokeWidth="2">
        <path className="sp" d="M215 300q3-16 18-18q-15-3-18-18q-3 15-18 18q15 2 18 18z" />
        <path className="sp" d="M590 330q3-16 18-18q-15-3-18-18q-3 15-18 18q15 2 18 18z" />
        <path className="sp" d="M280 170q2-11 12-12q-10-2-12-12q-2 10-12 12q10 1 12 12z" />
        <path className="sp" d="M530 150q2-11 12-12q-10-2-12-12q-2 10-12 12q10 1 12 12z" />
      </g>
    </svg>
  )
}

/**
 * 注文した商品が届いたときの通知。タップで閉じる。
 * ナゾは、このあと「ソックスキーを導く」ボタンから開く
 */
export function ArrivalNotice({ onClose }: { onClose: () => void }) {
  // 届いたアニメーションが終わるまでは、タップを受け付けない
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), ARRIVE_MS)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="sz-dialog-back sz-top">
      <button className="problem-arrive" style={ready ? undefined : { pointerEvents: 'none' }} onClick={ready ? onClose : undefined}>
        <DeliveryScene />
        <span className="arrive-text">アイテムが届きました。</span>
        <span className="arrive-hint">タップしてとじる</span>
      </button>
    </div>
  )
}

/** 宅配ソックスのナゾ（ソックスキーを導く）。正解すると onSolved が呼ばれる */
export default function ProblemDialog({
  order,
  problem: given,
  hint,
  onSolved,
  onClose,
}: {
  order: Order
  /** 注文の中身ではなく、ステージで決まる問題（ステージ4のラウンドごと） */
  problem?: { image?: string; request?: boolean }
  /** ナゾを開いて少したってから、ポップアップで出す案内（ステージ4 ROUND2 の記録の案内） */
  hint?: string
  onSolved: () => void
  onClose: () => void
}) {
  const [wrong, setWrong] = useState(0)
  const [zoom, setZoom] = useState(false)
  // 正解したら「正解！」を見せてから、次へ進む
  const [correct, setCorrect] = useState(false)
  const clearing = useRef(false)
  const [hintOpen, setHintOpen] = useState(false)
  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHintOpen(true), HINT_MS)
    return () => clearTimeout(t)
  }, [hint])

  const debug = new URLSearchParams(location.search).get('debug') === 'true'
  const { products } = useProducts()
  const first = products.find((p) => p.id === (order.items[0]?.id ?? ''))
  const base = given ?? (first ? PROBLEMS[first.category] : undefined)
  // 答えは、注文した商品のアイテム番号を桁ごとに足したもの（ソックスキーの番号）
  const answer = sockKeyOfItems(order.items, products)
  const problem = base ? { ...base, answer } : undefined
  const solved = order.status === 'solved'
  /** 答えはここでは入れず、Santazon の取り出し依頼ボタンで入れる */
  const request = !!given?.request

  const submit = (value: string) => {
    if (!problem || clearing.current) return
    if (value === problem.answer.trim()) {
      clearing.current = true
      setCorrect(true)
      setTimeout(onSolved, CORRECT_MS)
    } else setWrong((n) => n + 1)
  }

  return (
    <div className="sz-dialog-back sz-top">
      <div className="sz-dialog sz-problem">
        {!solved && !correct && (
          <button className="sz-close" onClick={onClose} aria-label="閉じる">✕</button>
        )}
        {debug && problem && <div className="debug-sockkey is-inline">答え {problem.answer}</div>}
        <div className={`problem-body${request ? ' is-request' : ''}`}>
          <ProblemVisual src={problem?.image} onZoom={() => setZoom(true)} />
          {request ? (
            <div className="problem-request">導いたソックスキーは【エルフに取り出し依頼】ボタンから伝えよう</div>
          ) : (
            <TenKey length={Math.max(1, problem?.answer.trim().length ?? 4)} onSubmit={submit} />
          )}
        </div>
      </div>
      {correct && (
        <div className="problem-correct" aria-live="polite">
          <span>正解！</span>
        </div>
      )}
      {wrong > 0 && !correct && (
        <div className="sz-elf-back" onClick={() => setWrong(0)}>
          <div className="sz-elf-line" key={wrong}>
            <img src={characterImage('Common', '真顔')} alt="" />
            <p>
              <span>エルフ</span>
              答えが違うみたい。もう一度考えてみよう。
            </p>
          </div>
        </div>
      )}
      {hintOpen && hint && !correct && (
        <div className="sz-dialog-back" onClick={() => setHintOpen(false)}>
          <div className="sz-dialog" onClick={(e) => e.stopPropagation()}>
            <p style={{ whiteSpace: 'pre-line' }}>{hint}</p>
            <button className="sz-btn sz-yellow" onClick={() => setHintOpen(false)}>閉じる</button>
          </div>
        </div>
      )}
      {zoom && (
        <div className="problem-zoom-back" onClick={() => setZoom(false)}>
          {problem?.image ? (
            <img className="problem-zoom-view" src={problem.image} alt="" />
          ) : (
            <div className="problem-zoom-view placeholder">問題画像</div>
          )}
        </div>
      )}
    </div>
  )
}

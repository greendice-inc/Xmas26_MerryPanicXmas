import { useRef, useState } from 'react'
import TenKey from './TenKey'
import { PROBLEMS } from '../santazon/products'
import { useProducts } from '../santazon/useProducts'
import { characterImage } from '../scenario'
import type { Order } from '../types'

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

/** 届いたときの演出：サンタがやって来て、吊るした靴下にプレゼントを入れる */
function DeliveryScene() {
  return (
    <svg className="arrive-scene" viewBox="0 0 800 560" aria-hidden>
      {/* プレゼント（靴下より先に描き、靴下の口に入ると隠れる） */}
      <g className="arrive-slide is-gift">
        <g className="arrive-gift">
          <rect x="455" y="105" width="70" height="58" rx="6" fill="#2a9d5c" stroke="#1d6e40" strokeWidth="4" />
          <rect x="484" y="105" width="12" height="58" fill="#ffd23f" />
          <rect x="455" y="128" width="70" height="12" fill="#ffd23f" />
          <path d="M490 105c-14-18-34-10-24 0zM490 105c14-18 34-10 24 0z" fill="#ffd23f" stroke="#e0a800" strokeWidth="3" />
        </g>
      </g>

      {/* 靴下 */}
      <g className="arrive-sock">
        <path d="M400 0V180" stroke="#c9b48a" strokeWidth="5" />
        <path d="M345 250H455V430Q455 500 385 500H285Q240 500 240 460Q240 422 285 420H345Z" fill="#d62839" stroke="#9d1830" strokeWidth="6" strokeLinejoin="round" />
        <path d="M455 452Q455 500 400 500" fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" opacity=".85" />
        <path d="M262 430Q240 440 246 470" fill="none" stroke="#fff" strokeWidth="12" strokeLinecap="round" opacity=".85" />
        <path d="M400 300l9 18 20 3-14 14 3 20-18-9-18 9 3-20-14-14 20-3z" fill="#fff" opacity=".9" />
        <rect x="328" y="196" width="144" height="58" rx="18" fill="#fff" stroke="#d8d8de" strokeWidth="5" />
      </g>

      {/* サンタ */}
      <g className="arrive-slide">
        <g className="arrive-santa">
          <path d="M565 195Q530 175 505 152" stroke="#d62839" strokeWidth="28" strokeLinecap="round" fill="none" />
          <circle cx="500" cy="150" r="15" fill="#fff" stroke="#d8d8de" strokeWidth="3" />
          <ellipse cx="612" cy="215" rx="72" ry="66" fill="#d62839" stroke="#9d1830" strokeWidth="5" />
          <path d="M612 150V280" stroke="#fff" strokeWidth="14" />
          <rect x="542" y="220" width="140" height="18" fill="#2b2b2e" />
          <rect x="599" y="216" width="26" height="26" rx="4" fill="none" stroke="#ffd23f" strokeWidth="5" />
          <circle cx="612" cy="120" r="42" fill="#f6c9a8" />
          <path d="M566 118Q558 190 612 196Q666 190 658 118Q644 152 612 152Q580 152 566 118Z" fill="#fff" stroke="#e2e2e6" strokeWidth="3" />
          <ellipse cx="598" cy="136" rx="15" ry="8" fill="#fff" stroke="#e2e2e6" strokeWidth="2" />
          <ellipse cx="626" cy="136" rx="15" ry="8" fill="#fff" stroke="#e2e2e6" strokeWidth="2" />
          <circle cx="612" cy="128" r="7" fill="#f08a7e" />
          <circle cx="597" cy="112" r="4.5" fill="#2b2b2e" />
          <circle cx="627" cy="112" r="4.5" fill="#2b2b2e" />
          <path d="M570 96Q596 28 672 48L706 92Q664 70 654 96Z" fill="#d62839" stroke="#9d1830" strokeWidth="4" strokeLinejoin="round" />
          <rect x="562" y="86" width="100" height="22" rx="11" fill="#fff" stroke="#e2e2e6" strokeWidth="3" />
          <circle cx="708" cy="94" r="13" fill="#fff" stroke="#e2e2e6" strokeWidth="3" />
        </g>
      </g>

      {/* キラキラ */}
      <g className="arrive-sparkles" fill="#ffe14d" stroke="#e6a800" strokeWidth="2">
        <path className="sp" d="M215 300q3-16 18-18q-15-3-18-18q-3 15-18 18q15 2 18 18z" />
        <path className="sp" d="M590 330q3-16 18-18q-15-3-18-18q-3 15-18 18q15 2 18 18z" />
        <path className="sp" d="M280 180q2-11 12-12q-10-2-12-12q-2 10-12 12q10 1 12 12z" />
        <path className="sp" d="M530 440q2-11 12-12q-10-2-12-12q-2 10-12 12q10 1 12 12z" />
      </g>
    </svg>
  )
}

/**
 * 注文した商品が届いたときの通知。タップで閉じる。
 * ナゾは、このあと「ソックスキーを導く」ボタンから開く
 */
export function ArrivalNotice({ onClose }: { onClose: () => void }) {
  return (
    <div className="sz-dialog-back sz-top">
      <button className="problem-arrive" onClick={onClose}>
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
  onSolved,
  onClose,
}: {
  order: Order
  /** 注文の中身ではなく、ステージで決まる問題（ステージ4のラウンドごと） */
  problem?: { image?: string; answer: string; request?: boolean }
  onSolved: () => void
  onClose: () => void
}) {
  const [wrong, setWrong] = useState(0)
  const [zoom, setZoom] = useState(false)
  const clearing = useRef(false)

  const { products } = useProducts()
  const first = products.find((p) => p.id === (order.items[0]?.id ?? ''))
  const problem = given ?? (first ? PROBLEMS[first.category] : undefined)
  const solved = order.status === 'solved'
  /** 答えはここでは入れず、Santazon の取り出し依頼ボタンで入れる */
  const request = !!given?.request

  const submit = (value: string) => {
    if (!problem || clearing.current) return
    if (value === problem.answer.trim()) {
      clearing.current = true
      onSolved()
    } else setWrong((n) => n + 1)
  }

  return (
    <div className="sz-dialog-back sz-top">
      <div className="sz-dialog sz-problem">
        {!solved && (
          <button className="sz-close" onClick={onClose} aria-label="閉じる">✕</button>
        )}
        <h2 className="problem-title">宅配ソックスを開けるためにナゾを解こう。</h2>
        <div className={`problem-body${request ? ' is-request' : ''}`}>
          <ProblemVisual src={problem?.image} onZoom={() => setZoom(true)} />
          {request ? (
            <div className="problem-request">取り出し依頼ボタンで解答しよう。</div>
          ) : (
            <TenKey length={Math.max(1, problem?.answer.trim().length ?? 4)} onSubmit={submit} />
          )}
        </div>
      </div>
      {wrong > 0 && (
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

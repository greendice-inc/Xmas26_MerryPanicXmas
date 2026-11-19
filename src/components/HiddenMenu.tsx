import { useEffect, useRef, useState } from 'react'
import { GAME_COUNT, SECRET_TAP_COUNT, SECRET_TAP_WINDOW_MS, STAGE_W } from '../config'
import type { JumpTarget } from '../types'

/** 隠しメニューの判定エリア（画面左上の一辺 px） */
const SECRET_ZONE = 220

/** ステージごとの名前と、ゲーム中の行き先（会話は全ステージの先頭に付く）。phase を書いたものは、ゲームではなくそのシーンへ */
type JumpBtn = { label: string; step?: JumpTarget['step']; phase?: 'clear' }
const JUMP_STAGES: Record<number, { name: string; buttons: JumpBtn[] }> = {
  1: {
    name: 'わなげ',
    buttons: [{ label: 'マーク', step: 'quiz' }, { label: '輪投げ', step: 'order' }, { label: 'END', phase: 'clear' }],
  },
  2: {
    name: 'かくれんぼ',
    buttons: [
      { label: '一人目', step: 'start' },
      { label: '二人目', step: 'amy' },
      { label: '三人目', step: 'jimmy' },
      { label: 'END', step: 'tommy' },
    ],
  },
  3: {
    name: 'ツイスター',
    buttons: [
      { label: 'T1', step: 'g1' },
      { label: 'T2', step: 'g2' },
      { label: 'T3', step: 'room' },
      { label: 'END', phase: 'clear' },
    ],
  },
  4: {
    name: 'ビンゴ',
    buttons: [{ label: 'B1', step: 'r1' }, { label: 'B2', step: 'r2' }, { label: 'END', phase: 'clear' }],
  },
  5: {
    name: 'エントツ',
    buttons: [
      { label: 'サッカー', step: 'basket' },
      { label: '取り出し', step: 'extract' },
      { label: '煙突', step: 'balls' },
      { label: '緊急', step: 'notice' },
      { label: 'ラスト', step: 'super' },
    ],
  },
}

interface Props {
  /** メニューの見出しに添える名前（例：チーム 3） */
  label?: string
  onReset: () => void
  onReconnect: () => void
  /** 指定時のみ「ロックを外す」ボタンを表示（プレイヤー用） */
  onUnlock?: () => void
  /** 指定時のみ「ゲームを強制クリア」ボタンを表示（ゲーム中のプレイヤー用） */
  onForceClear?: () => void
  /** 指定時のみ「シーンジャンプ」ボタンを表示（プレイヤー用） */
  onJump?: (target: JumpTarget) => void
  /** false のときは「ロックを外す」を出さない（ロックされていないとき） */
  locked?: boolean
  /** true のときフルスクリーン切り替えボタンを表示 */
  fullscreenToggle?: boolean
  /** 正解直後、スタッフの「次へ」を待っているときだけ。押すと、スタッフが押したのと同じに進む */
  onSkipWait?: () => void
}

/** 画面左上を連続タップするとメニューが出る（トップ画面以外で配置する） */
export default function HiddenMenu({ label, onReset, onReconnect, onUnlock, onJump, onForceClear, locked, fullscreenToggle, onSkipWait }: Props) {
  const taps = useRef<number[]>([])
  const [open, setOpen] = useState(false)
  const [jumping, setJumping] = useState(false)

  const [isFull, setIsFull] = useState(!!document.fullscreenElement)
  useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }

  const tap = () => {
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < SECRET_TAP_WINDOW_MS), now]
    if (taps.current.length >= SECRET_TAP_COUNT) {
      taps.current = []
      setOpen(true)
    }
  }

  // 左上の領域は透明な板で塞がず、画面全体のタップを監視して数える
  // （板があると、その下にあるボタン（Santazon の家マークなど）が押せなくなるため）
  const tapRef = useRef(tap)
  tapRef.current = tap
  useEffect(() => {
    const on = (e: PointerEvent) => {
      const stage = document.querySelector('.stage')
      if (!stage) return
      const r = stage.getBoundingClientRect()
      const scale = r.width / STAGE_W
      const x = (e.clientX - r.left) / scale
      const y = (e.clientY - r.top) / scale
      if (x >= 0 && y >= 0 && x < SECRET_ZONE && y < SECRET_ZONE) tapRef.current()
    }
    window.addEventListener('pointerdown', on, true)
    return () => window.removeEventListener('pointerdown', on, true)
  }, [])

  const jump = (target: JumpTarget) => {
    setOpen(false)
    setJumping(false)
    onJump?.(target)
  }

  return (
    <>
      {open && (
        <div className="modal-back">
          {jumping && onJump ? (
            <div className="modal jump-modal">
              <h2>シーンジャンプ</h2>
              <div className="jump-grid">
                {Array.from({ length: GAME_COUNT }, (_, i) => i + 1).map((stage) => (
                  <div className="jump-row" key={stage}>
                    <span>{JUMP_STAGES[stage]?.name}</span>
                    <button onClick={() => jump({ stage, phase: 'novel' })}>会話</button>
                    {(JUMP_STAGES[stage]?.buttons ?? [{ label: 'ゲーム' }]).map((g: JumpBtn) => (
                      <button key={g.label} onClick={() => jump({ stage, phase: g.phase ?? 'game', step: g.step })}>{g.label}</button>
                    ))}
                  </div>
                ))}
                <div className="jump-row">
                  <span>クリア後</span>
                  <button onClick={() => jump({ stage: GAME_COUNT, phase: 'end' })}>会話</button>
                </div>
              </div>
              <button onClick={() => setJumping(false)}>戻る</button>
            </div>
          ) : (
          <div className="modal">
            <h2>{label ? `メニュー（${label}）` : 'メニュー'}</h2>
            <button onClick={onReset}>トップへ戻る</button>
            {onUnlock && locked !== false && (
              <button
                onClick={() => {
                  setOpen(false)
                  onUnlock()
                }}
              >
                ロックを外す
              </button>
            )}
            {onJump && <button onClick={() => setJumping(true)}>シーンジャンプ</button>}
            {onForceClear && (
              <button
                onClick={() => {
                  setOpen(false)
                  onForceClear()
                }}
              >
                ゲームを強制クリア
              </button>
            )}
            {onSkipWait && (
              <button
                onClick={() => {
                  setOpen(false)
                  onSkipWait()
                }}
              >
                次へ進む（スタッフの「次へ」の代わり）
              </button>
            )}
            {fullscreenToggle && (
              <button onClick={toggleFullscreen}>{isFull ? 'フルスクリーン解除' : 'フルスクリーンにする'}</button>
            )}
            <button
              onClick={() => {
                setOpen(false)
                onReconnect()
              }}
            >
              再接続
            </button>
            <button onClick={() => setOpen(false)}>閉じる</button>
          </div>
          )}
        </div>
      )}
    </>
  )
}

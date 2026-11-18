/** ゲーム画面の下に並べる3つのボタン（全ステージ共通。画像は public/BG/Common/tab_*.webp） */
const ITEMS = ['注文', 'やるべきこと', '記録'] as const

const TAB_DIR = `${import.meta.env.BASE_URL}BG/Common/`
const TAB_IMAGE: Record<(typeof ITEMS)[number], string> = {
  注文: `${TAB_DIR}tab_san.webp`,
  やるべきこと: `${TAB_DIR}tab_yar.webp`,
  記録: `${TAB_DIR}tab_log.webp`,
}

export default function GameMenu({
  shopOpen,
  onOrder,
  onTask,
  onRecord,
  guide,
  guided,
  locked,
}: {
  shopOpen: boolean
  onOrder?: () => void
  onTask?: () => void
  onRecord?: () => void
  /** 案内で目立たせるボタン */
  guide?: (typeof ITEMS)[number] | null
  /** 説明中。目立たせたボタン以外は触れない */
  guided?: boolean
  /** 会話中はテキスト送り以外を受け付けない */
  locked?: boolean
}) {
  const action = (label: (typeof ITEMS)[number]) =>
    label === '注文' ? onOrder : label === 'やるべきこと' ? onTask : onRecord

  return (
    <nav className={`game-menu${locked ? ' is-locked' : ''}${guided ? ' is-guided' : ''}`}>
      {ITEMS.map((label) => {
        const onClick = action(label)
        return (
          <button
            key={label}
            data-menu={label}
            aria-label={label}
            className={`game-tab${label === '注文' && shopOpen ? ' on' : ''}${guide === label ? ' is-guide' : ''}`}
            disabled={!!locked || !onClick}
            onClick={onClick}
          >
            <img src={TAB_IMAGE[label]} alt="" draggable={false} />
          </button>
        )
      })}
    </nav>
  )
}

export const STAGE_W = 1920
export const STAGE_H = 1200

export const TEAM_COUNT = 12
export const KEYBOX_COUNT = 2
export const GAME_COUNT = 6

/** キーボックス番号 → 無線アドレス（ad）。本体のシールに書かれた値（2台目は仮） */
export const KEYBOX_ADDR: Record<number, number> = { 1: 0x06, 2: 0x07 }
/** キーボックスに入れると開く番号（ひとまず） */
export const KEYBOX_CODES = ['1111', '2222', '3333']
/** 解錠してから、自動でもう一度施錠するまでの時間（開けて閉める間。閉じたことを知らせる信号が分かるまでの代わり） */
export const KEYBOX_RELOCK_MS = 10000
/** 何秒ボタンが押されなければ、途中までの入力を消すか */
export const KEYBOX_INPUT_RESET_MS = 15000

/** ロック中に全面へかぶせるキービジュアル（public/kv.png） */
export const KV_IMAGE = `${import.meta.env.BASE_URL}kv.png`

/** チーム番号 → 部屋番号（仮。確定したら書き換える） */
export const ROOM_BY_TEAM: Record<number, number> = Object.fromEntries(
  Array.from({ length: TEAM_COUNT }, (_, i) => [i + 1, i + 1]),
)

/** 隠しメニュー：この回数タップで表示 */
export const SECRET_TAP_COUNT = 5
export const SECRET_TAP_WINDOW_MS = 3000

export const HEARTBEAT_MS = 5000
/** この時間 heartbeat が無ければ切断扱い */
export const PRESENCE_TIMEOUT_MS = 15000

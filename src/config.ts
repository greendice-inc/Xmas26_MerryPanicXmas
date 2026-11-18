export const STAGE_W = 1920
export const STAGE_H = 1200

export const TEAM_COUNT = 12
export const KEYBOX_COUNT = 4
/** ステージの数。最後（5）が LAST（ファイナルゲーム） */
export const GAME_COUNT = 5
export const LAST_STAGE = 5

/**
 * キーボックスの無線設定の初期値（本番で決まったら、キーボックステスト画面で変える）
 * id=無線グループ（16進8桁）/ ch=チャンネル / ad=アドレス（番号）。送る・受けるときに使うのは ad
 */
export const KEYBOX_DEFAULTS: Record<number, { id: string; ch: number; ad: number }> = {
  1: { id: '54554D03', ch: 20, ad: 0x06 },
  2: { id: '54554D03', ch: 20, ad: 0x07 },
  3: { id: '54554D03', ch: 20, ad: 0x08 },
  4: { id: '54554D03', ch: 20, ad: 0x09 },
}
/** キーボックスに入れると開く番号（ひとまず） */
export const KEYBOX_CODES = ['6476', '2222', '3333']
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

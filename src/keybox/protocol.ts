/**
 * 無線キーボックスのメッセージ（tsushinTest と同じ形）
 * ":" + アドレス + コマンド + データ + チェックサム + CRLF。16進は大文字
 */

export function toHex2(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, '0')
}

/** 全バイトを足して下2桁が 00 になる数（2の補数） */
export function checksum(hexBody: string): string {
  let sum = 0
  for (let i = 0; i < hexBody.length; i += 2) sum += parseInt(hexBody.slice(i, i + 2), 16)
  return toHex2((0x100 - (sum & 0xff)) & 0xff)
}

export function buildMessage(addr: number, cmdAndData: string): string {
  const body = (toHex2(addr) + cmdAndData).toUpperCase()
  return `:${body}${checksum(body)}\r\n`
}

export type Parsed =
  | { ok: true; addr: number; cmd: number; data: number[] }
  | { ok: false; reason: string }

/** 受信した1行を読む。チェックサムを含めた和が 00 なら正しく届いている */
export function parseLine(line: string): Parsed {
  if (!line.startsWith(':')) return { ok: false, reason: '先頭が : ではない' }
  const hex = line.slice(1)
  if (hex.length < 6 || hex.length % 2 !== 0 || !/^[0-9A-Fa-f]+$/.test(hex)) return { ok: false, reason: '形式が不正' }
  const bytes: number[] = []
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16))
  if ((bytes.reduce((a, b) => a + b, 0) & 0xff) !== 0) return { ok: false, reason: 'チェックサムNG' }
  return { ok: true, addr: bytes[0], cmd: bytes[1], data: bytes.slice(2, -1) }
}

/** キーボックス → PC：押されたボタン */
export const KEY_MAP: Record<number, string> = {
  0x31: '1', 0x32: '2', 0x33: '3', 0x34: '4', 0x35: '5',
  0x36: '6', 0x37: '7', 0x38: '8', 0x39: '9', 0x3b: '0',
  0x3a: 'CLEAR', 0x3c: 'ENTER',
}

/** PC → キーボックス：命令（コマンド＋データ） */
export const CMD = {
  unlock: '1042',
  lock: '124C',
  beep: '1641',
  /** ランプは光らず、音（ピッ）だけ */
  beepOnly: '1341',
  /** 音は鳴らさず、ランプだけ光る */
  lampOnly: '1441',
  correct: '1642',
  wrong: '1643',
  /** 不正解音だけ（ランプなし）。実機で確認済み */
  wrongOnly: '1343',
} as const

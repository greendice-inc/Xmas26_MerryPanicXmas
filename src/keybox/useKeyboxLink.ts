import { useCallback, useEffect, useRef, useState } from 'react'
import { KEYBOX_ADDR, KEYBOX_CODES, KEYBOX_INPUT_RESET_MS, KEYBOX_RELOCK_MS } from '../config'
import { setKeyboxLink, type KeyboxDoc } from '../net/keybox'
import { buildMessage, CMD, KEY_MAP, parseLine, toHex2 } from './protocol'

export interface LogLine {
  at: number
  text: string
  kind: 'tx' | 'rx' | 'ack' | 'err' | 'info'
}

/** 連続で送ると取りこぼすので、0.1秒ずつ間をあける */
const SEND_GAP_MS = 100
/** 鳴らし続けるときの「ピッ」の間隔と、1回ごとの休み */
const RING_KEY_GAP_MS = 350
const RING_REST_MS = 1800

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const idByAddr = (addr: number) => {
  const hit = Object.entries(KEYBOX_ADDR).find(([, a]) => a === addr)
  return hit ? Number(hit[0]) : null
}

/**
 * マスター PC の USB アンテナ（Web Serial）でキーボックスとやり取りする。
 * ボタンの報告を受けて番号を判定し、スタッフ・プレイヤーからの指令（keybox コレクション）を送る
 */
export function useKeyboxLink(docs: Record<string, KeyboxDoc>) {
  const [connected, setConnected] = useState(false)
  const [log, setLog] = useState<LogLine[]>([])
  const [inputs, setInputs] = useState<Record<number, string>>({})
  const portRef = useRef<SerialPort | null>(null)
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const queue = useRef<string[]>([])
  const sending = useRef(false)
  const input = useRef<Record<number, { text: string; at: number }>>({})
  const supported = typeof navigator !== 'undefined' && 'serial' in navigator

  const push = useCallback((text: string, kind: LogLine['kind'] = 'info') => {
    setLog((l) => [...l.slice(-199), { at: Date.now(), text, kind }])
  }, [])

  const flush = useCallback(async () => {
    if (sending.current) return
    sending.current = true
    while (queue.current.length) {
      const msg = queue.current.shift()!
      const w = writerRef.current
      if (!w) {
        push(`未接続のため送れません: ${msg.trim()}`, 'err')
      } else {
        try {
          await w.write(new TextEncoder().encode(msg))
          push(`送信 → ${msg.trim()}`, 'tx')
        } catch (e) {
          push(`送信エラー: ${(e as Error).message}`, 'err')
        }
      }
      await sleep(SEND_GAP_MS)
    }
    sending.current = false
  }, [push])

  const send = useCallback(
    (addr: number, cmd: string) => {
      queue.current.push(buildMessage(addr, cmd))
      void flush()
    },
    [flush],
  )

  // 解錠したら、開けて閉める時間のあとで、もう一度施錠する
  const relockTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const unlock = useCallback(
    (addr: number) => {
      send(addr, CMD.unlock)
      clearTimeout(relockTimers.current[addr])
      relockTimers.current[addr] = setTimeout(() => {
        push(`0x${toHex2(addr)}：もう一度施錠します`)
        send(addr, CMD.lock)
      }, KEYBOX_RELOCK_MS)
    },
    [push, send],
  )

  // ---------- 受信 ----------
  const onKey = useCallback(
    (addr: number, key: string) => {
      const now = Date.now()
      const cur = input.current[addr]
      let text = cur && now - cur.at <= KEYBOX_INPUT_RESET_MS ? cur.text : ''
      if (key === 'CLEAR') {
        text = ''
        send(addr, CMD.beep)
      } else if (key === 'ENTER') {
        if (KEYBOX_CODES.includes(text)) {
          push(`0x${toHex2(addr)}：「${text}」正解 → 解錠`, 'info')
          send(addr, CMD.correct)
          unlock(addr)
        } else {
          push(`0x${toHex2(addr)}：「${text}」不正解`, 'err')
          send(addr, CMD.wrong)
        }
        text = ''
      } else {
        text = (text + key).slice(-8)
        send(addr, CMD.beep)
      }
      input.current[addr] = { text, at: now }
      setInputs((m) => ({ ...m, [addr]: text }))
    },
    [push, send, unlock],
  )

  const onLine = useCallback(
    (line: string) => {
      // ":D..." はアンテナ自身の返事（アンテナまで届いた。キーボックスに届いたかは分からない）
      if (line[1] === 'D' || line[1] === 'd') {
        push(`アンテナ応答 ← ${line}`, 'ack')
        return
      }
      const p = parseLine(line)
      if (!p.ok) {
        push(`受信（${p.reason}） ← ${line}`, 'err')
        return
      }
      const key = KEY_MAP[p.cmd]
      const id = idByAddr(p.addr)
      push(
        `受信 ← ${line}  [${id ? `キーボックス${id}` : `0x${toHex2(p.addr)}`}${key ? ` / ボタン「${key}」` : ` / コマンド 0x${toHex2(p.cmd)}`}]`,
        'rx',
      )
      if (key) onKey(p.addr, key)
    },
    [onKey, push],
  )

  // ---------- 接続 ----------
  const open = useCallback(
    async (port: SerialPort) => {
      await port.open({ baudRate: 115200 })
      portRef.current = port
      const writer = port.writable!.getWriter()
      writerRef.current = writer
      setConnected(true)
      void setKeyboxLink(true)
      push('アンテナに接続しました（115200bps）')

      const decoder = new TextDecoder()
      let buf = ''
      try {
        while (portRef.current === port && port.readable) {
          const reader = port.readable.getReader()
          readerRef.current = reader
          try {
            for (;;) {
              const { value, done } = await reader.read()
              if (done) break
              buf += decoder.decode(value, { stream: true })
              let i
              while ((i = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, i).trim()
                buf = buf.slice(i + 1)
                if (line) onLine(line)
              }
            }
          } finally {
            reader.releaseLock()
            readerRef.current = null
          }
        }
      } catch (e) {
        if (portRef.current === port) push(`受信エラー: ${(e as Error).message}`, 'err')
      }
      // 読み終わったら閉じる。切断ボタンでなく抜かれたなどのときは、ここで切断扱いにする
      const lost = portRef.current === port
      if (writerRef.current === writer) writerRef.current = null
      try {
        writer.releaseLock()
      } catch {
        /* すでに外れている */
      }
      await port.close().catch(() => {})
      if (lost) {
        portRef.current = null
        setConnected(false)
        void setKeyboxLink(false)
        push('アンテナとの接続が切れました', 'err')
      }
    },
    [onLine, push],
  )

  const connect = useCallback(async () => {
    if (!supported) return
    try {
      const port = await navigator.serial.requestPort()
      await open(port)
    } catch (e) {
      push(`接続できません: ${(e as Error).message}`, 'err')
    }
  }, [open, push, supported])

  const disconnect = useCallback(async () => {
    // 読み取りを止めると、open() の後始末でポートが閉じる
    portRef.current = null
    writerRef.current = null
    try {
      await readerRef.current?.cancel()
    } catch (e) {
      push(`切断エラー: ${(e as Error).message}`, 'err')
    }
    setConnected(false)
    void setKeyboxLink(false)
    push('切断しました')
  }, [push])

  // 前に許可したアンテナがあれば、開いたときに自動でつなぐ
  useEffect(() => {
    if (!supported) return
    let alive = true
    navigator.serial
      .getPorts()
      .then((ports) => {
        if (alive && ports[0] && !portRef.current) return open(ports[0])
      })
      .catch((e) => push(`自動接続できません: ${(e as Error).message}`, 'err'))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 画面を閉じたら切断
  useEffect(
    () => () => {
      portRef.current = null
      writerRef.current = null
      readerRef.current?.cancel().catch(() => {})
      Object.values(relockTimers.current).forEach(clearTimeout)
      void setKeyboxLink(false)
    },
    [],
  )

  // ---------- スタッフ・プレイヤーからの指令 ----------
  // 解錠・施錠：時刻が変わったら1回だけ送る。マスターを開く前の古い指令（30秒より前）は送らない
  const mountedAt = useRef(Date.now())
  const handled = useRef<Record<string, { unlockAt?: number; lockAt?: number }>>({})
  useEffect(() => {
    const fresh = (t?: number) => !!t && t > mountedAt.current - 30000
    for (const [key, d] of Object.entries(docs)) {
      const id = Number(key)
      const addr = KEYBOX_ADDR[id]
      if (addr === undefined) continue
      const h = (handled.current[key] ??= {})
      if (d.unlockAt !== h.unlockAt && fresh(d.unlockAt)) {
        push(`キーボックス${id}：解錠の指令`)
        unlock(addr)
      }
      if (d.lockAt !== h.lockAt && fresh(d.lockAt)) {
        push(`キーボックス${id}：施錠の指令`)
        send(addr, CMD.lock)
      }
      h.unlockAt = d.unlockAt
      h.lockAt = d.lockAt
    }
  }, [docs, push, send, unlock])

  // 鳴らし続ける：0・0・0・0 の「ピッ」4回と、確定の不正解音をくり返す
  const ringing = useRef<Record<number, boolean>>({})
  const looping = useRef<Record<number, boolean>>({})
  useEffect(() => {
    for (const [key, addr] of Object.entries(KEYBOX_ADDR)) {
      const id = Number(key)
      const on = !!docs[key]?.ringing
      ringing.current[id] = on
      if (!on || looping.current[id]) continue
      looping.current[id] = true
      push(`キーボックス${id}：音を鳴らし続けます`)
      void (async () => {
        while (ringing.current[id]) {
          if (!writerRef.current) {
            await sleep(500)
            continue
          }
          for (let i = 0; i < 4 && ringing.current[id]; i++) {
            send(addr, CMD.beep)
            await sleep(RING_KEY_GAP_MS)
          }
          if (!ringing.current[id]) break
          send(addr, CMD.wrong)
          await sleep(RING_REST_MS)
        }
        looping.current[id] = false
        push(`キーボックス${id}：音を止めました`)
      })()
    }
  }, [docs, push, send])

  return { supported, connected, send, connect, disconnect, log, inputs, clearLog: () => setLog([]), simulate: onLine }
}

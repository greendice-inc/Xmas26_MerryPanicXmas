import { useState } from 'react'
import ConnDot from '../components/ConnDot'
import Header from '../components/Header'
import { KEYBOX_ADDR, KEYBOX_CODES } from '../config'
import { CMD, toHex2 } from '../keybox/protocol'
import { useKeyboxLink } from '../keybox/useKeyboxLink'
import type { KeyboxDoc } from '../net/keybox'

/**
 * キーボックスの通信テスト（?debug=true のトップから開く）。
 * この画面だけでアンテナにつなぎ、命令を送ったり、番号の判定を試したりできる。
 * アンテナは同時に1か所しか使えないので、マスター画面とは別の端末・タブで開くこと
 */
export default function KeyboxTestScreen({ onBack }: { onBack: () => void }) {
  // 鳴らし続ける指令は、この画面のなかだけで持つ（データベースには書かない）
  const [docs, setDocs] = useState<Record<string, KeyboxDoc>>({})
  const link = useKeyboxLink(docs)
  const [addrText, setAddrText] = useState(toHex2(KEYBOX_ADDR[1]))
  const [raw, setRaw] = useState('1641')
  const [sim, setSim] = useState(':0631C9')
  const addr = parseInt(addrText, 16)
  const addrOk = /^[0-9A-Fa-f]{1,2}$/.test(addrText.trim())
  const go = (cmd: string) => addrOk && link.send(addr, cmd)

  return (
    <div className="screen master">
      <Header title="キーボックステスト" left={<button className="sub" onClick={onBack}>戻る</button>} />
      <section className="card keybox-card">
        <div className="keybox-head">
          <span className="keybox-link">
            <ConnDot on={link.connected} />
            USBアンテナ {link.connected ? '接続中' : '未接続'}
          </span>
          {link.connected ? (
            <button className="sub" onClick={link.disconnect}>切断</button>
          ) : (
            <button disabled={!link.supported} onClick={link.connect}>アンテナに接続</button>
          )}
          {!link.supported && <span className="warn">このブラウザは Web Serial に未対応です（Chrome / Edge を使用）</span>}
        </div>

        <div className="keybox-tools">
          <span>アドレス(ad) 0x</span>
          <input value={addrText} maxLength={2} style={{ width: 90 }} onChange={(e) => setAddrText(e.target.value)} />
          <span>（01〜64、全台一斉は 78）</span>
          <span className="keybox-input">{(addrOk && link.inputs[addr]) || '－'}</span>
        </div>

        <div className="keybox-tools">
          <button disabled={!addrOk} onClick={() => go(CMD.unlock)}>解錠</button>
          <button disabled={!addrOk} onClick={() => go(CMD.lock)}>施錠</button>
          <button className="sub" disabled={!addrOk} onClick={() => go(CMD.beep)}>ピッ</button>
          <button className="sub" disabled={!addrOk} onClick={() => go(CMD.correct)}>正解音</button>
          <button className="sub" disabled={!addrOk} onClick={() => go(CMD.wrong)}>不正解音</button>
        </div>

        <div className="keybox-tools">
          <span>音を鳴らし続ける</span>
          {Object.keys(KEYBOX_ADDR).map((k) => {
            const on = !!docs[k]?.ringing
            return (
              <button
                key={k}
                className={`keybox-ring${on ? ' is-on' : ' sub'}`}
                onClick={() => setDocs((d) => ({ ...d, [k]: { ...d[k], ringing: !on } }))}
              >
                キーボックス {k}：{on ? '音を止める' : '音を鳴らす'}
              </button>
            )
          })}
        </div>

        <div className="keybox-tools">
          <span>自由送信（コマンド＋データ）</span>
          <input value={raw} onChange={(e) => setRaw(e.target.value)} />
          <button className="sub" disabled={!addrOk || !/^([0-9A-Fa-f]{2})+$/.test(raw.trim())} onClick={() => go(raw.trim().toUpperCase())}>
            送信
          </button>
        </div>

        <div className="keybox-tools">
          <span>開く番号: {KEYBOX_CODES.join(' / ')}</span>
        </div>

        <div className="keybox-tools">
          <span>受信テスト（実機なし）</span>
          <input value={sim} onChange={(e) => setSim(e.target.value)} />
          <button className="sub" onClick={() => link.simulate(sim.trim())}>受信したことにする</button>
          <button className="ghost" onClick={link.clearLog}>ログ消去</button>
        </div>

        <pre className="log keybox-log">
          {link.log.map((l, i) => (
            <div key={i} className={`log-${l.kind}`}>
              {new Date(l.at).toLocaleTimeString()}  {l.text}
            </div>
          ))}
        </pre>
      </section>
    </div>
  )
}

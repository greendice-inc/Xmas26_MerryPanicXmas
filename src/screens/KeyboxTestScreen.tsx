import { useEffect, useState } from 'react'
import ConnDot from '../components/ConnDot'
import Header from '../components/Header'
import { KEYBOX_CODES, KEYBOX_COUNT } from '../config'
import { CMD, toHex2 } from '../keybox/protocol'
import { addrsOf, useKeyboxSettings, validateSetting, type KeyboxSettings } from '../keybox/settings'
import { useKeyboxLink } from '../keybox/useKeyboxLink'
import type { KeyboxDoc } from '../net/keybox'

/** 命令の意味を実機で確かめるためのボタン（ピッだけ・ランプだけなど）を出すか。確認は済んだので隠している */
const SHOW_COMMAND_CHECKS = false

/** 入力中の1台ぶん（文字のまま持つ） */
interface Draft {
  id: string
  ch: string
  ad: string
}

const toDrafts = (s: KeyboxSettings): Record<number, Draft> =>
  Object.fromEntries(Object.entries(s).map(([n, v]) => [Number(n), { id: v.id, ch: String(v.ch), ad: toHex2(v.ad) }]))

/**
 * キーボックスの通信テスト（?debug=true のトップから開く）。
 * キーボックス1〜4の ID・ch・ad を決めて保存すると、マスター・スタッフ画面もその ad を使う。
 * アンテナは同時に1か所しか使えないので、マスター画面とは別の端末・タブで開くこと
 */
export default function KeyboxTestScreen({ onBack }: { onBack: () => void }) {
  const [saved, save] = useKeyboxSettings()
  const [drafts, setDrafts] = useState<Record<number, Draft>>(() => toDrafts(saved))
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  // 保存済みの設定が届いたら、まだ編集していなければ入力欄に反映する
  useEffect(() => {
    if (!dirty) setDrafts(toDrafts(saved))
  }, [saved, dirty])

  // 鳴らし続ける指令は、この画面のなかだけで持つ（データベースには書かない）
  const [docs, setDocs] = useState<Record<string, KeyboxDoc>>({})
  // テストでは、入力中の ad をそのまま使う（保存しなくても試せる）
  const draftAddrs: Record<number, number> = { ...addrsOf(saved) }
  for (const [n, d] of Object.entries(drafts)) if (/^[0-9A-Fa-f]{1,2}$/.test(d.ad.trim())) draftAddrs[Number(n)] = parseInt(d.ad, 16)
  const link = useKeyboxLink(docs, draftAddrs)

  const [sel, setSel] = useState(1)
  const [raw, setRaw] = useState('1641')
  const [sim, setSim] = useState(':0631C9')
  const addr = draftAddrs[sel]
  const go = (cmd: string) => link.send(addr, cmd)

  const nos = Array.from({ length: KEYBOX_COUNT }, (_, i) => i + 1)
  const edit = (n: number, patch: Partial<Draft>) => {
    setDirty(true)
    setMsg(null)
    setDrafts((d) => ({ ...d, [n]: { ...d[n], ...patch } }))
  }

  const errors = nos.map((n) => {
    const d = drafts[n]
    const e = d ? validateSetting(d.id, d.ch, d.ad) : null
    return e ? `キーボックス${n}：${e}` : null
  })
  const ads = nos.map((n) => (drafts[n] ? parseInt(drafts[n].ad, 16) : NaN))
  const dup = nos.find((n, i) => ads.indexOf(ads[i]) !== i && !Number.isNaN(ads[i]))
  const problem = errors.find(Boolean) ?? (dup ? `ad が重なっています（キーボックス${dup}）` : null)

  const doSave = async () => {
    if (problem) {
      setMsg({ text: problem, ok: false })
      return
    }
    const next: KeyboxSettings = {}
    for (const n of nos) next[n] = { id: drafts[n].id.trim().toUpperCase(), ch: Number(drafts[n].ch), ad: parseInt(drafts[n].ad, 16) }
    const ok = await save(next)
    setMsg(ok ? { text: '保存しました。マスター・スタッフ画面にも反映されます', ok: true } : { text: '保存できませんでした（通信を確認）', ok: false })
    if (ok) setDirty(false)
  }

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

        <table className="kb-settings">
          <thead>
            <tr>
              <th>テストする</th>
              <th>キーボックス</th>
              <th>ID（16進8桁）</th>
              <th>ch</th>
              <th>ad（16進2桁）</th>
              <th>入力中の番号</th>
            </tr>
          </thead>
          <tbody>
            {nos.map((n) => {
              const d = drafts[n] ?? { id: '', ch: '', ad: '' }
              return (
                <tr key={n} className={sel === n ? 'is-sel' : ''}>
                  <td><input type="radio" name="kb-sel" checked={sel === n} onChange={() => setSel(n)} /></td>
                  <td>キーボックス {n}</td>
                  <td><input value={d.id} maxLength={8} className="kb-id" onChange={(e) => edit(n, { id: e.target.value })} /></td>
                  <td><input value={d.ch} maxLength={2} className="kb-ch" onChange={(e) => edit(n, { ch: e.target.value })} /></td>
                  <td>0x<input value={d.ad} maxLength={2} className="kb-ad" onChange={(e) => edit(n, { ad: e.target.value })} /></td>
                  <td className="kb-in">{(draftAddrs[n] !== undefined && link.inputs[draftAddrs[n]]) || '－'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="keybox-tools">
          <button disabled={!dirty} onClick={doSave}>設定を保存</button>
          {dirty && <button className="ghost" onClick={() => { setDrafts(toDrafts(saved)); setDirty(false); setMsg(null) }}>元に戻す</button>}
          {msg && <span className={msg.ok ? 'kb-ok' : 'warn'}>{msg.text}</span>}
        </div>
        <div className="keybox-tools">
          <small>
            送る・受けるときに使うのは ad です。ID・ch はキーボックスとアンテナで合わせる値の控えで、ここからは変えられません。
          </small>
        </div>

        <div className="keybox-tools">
          <span>キーボックス {sel}（ad 0x{addr !== undefined ? toHex2(addr) : '--'}）へ</span>
          <button disabled={addr === undefined} onClick={() => go(CMD.unlock)}>解錠</button>
          <button disabled={addr === undefined} onClick={() => go(CMD.lock)}>施錠</button>
          <button className="sub" disabled={addr === undefined} onClick={() => go(CMD.beep)}>ピッ</button>
          <button className="sub" disabled={addr === undefined} onClick={() => go(CMD.correct)}>正解音</button>
          <button className="sub" disabled={addr === undefined} onClick={() => go(CMD.wrong)}>不正解音</button>
          {SHOW_COMMAND_CHECKS && (
            <>
              <button className="sub" disabled={addr === undefined} onClick={() => go(CMD.beepOnly)}>ピッだけ（ランプなし）</button>
              <button className="sub" disabled={addr === undefined} onClick={() => go(CMD.lampOnly)}>ランプだけ</button>
              <button className="sub" disabled={addr === undefined} onClick={() => go('1342')}>13 42（未確認）</button>
              <button className="sub" disabled={addr === undefined} onClick={() => go(CMD.wrongOnly)}>不正解音だけ（ランプなし）</button>
            </>
          )}
          {(() => {
            const on = !!docs[String(sel)]?.ringing
            return (
              <button
                className={`keybox-ring${on ? ' is-on' : ' sub'}`}
                onClick={() => setDocs((x) => ({ ...x, [String(sel)]: { ...x[String(sel)], ringing: !on } }))}
              >
                {on ? '音を止める' : '音を鳴らす'}
              </button>
            )
          })()}
        </div>

        <div className="keybox-tools">
          <span>自由送信（コマンド＋データ）</span>
          <input value={raw} onChange={(e) => setRaw(e.target.value)} />
          <button className="sub" disabled={addr === undefined || !/^([0-9A-Fa-f]{2})+$/.test(raw.trim())} onClick={() => go(raw.trim().toUpperCase())}>
            送信
          </button>
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

import ConnDot from '../components/ConnDot'
import Header from '../components/Header'
import HoldButton from '../components/HoldButton'
import { KEYBOX_COUNT, ROOM_BY_TEAM, TEAM_COUNT } from '../config'
import { toHex2 } from '../keybox/protocol'
import { addrsOf, useKeyboxSettings } from '../keybox/settings'
import { useKeyboxLink } from '../keybox/useKeyboxLink'
import { getBackend } from '../net'
import { requestKeyboxLock, requestKeyboxUnlock, setKeyboxRinging, useKeyboxAll, useKeyboxSendFailed } from '../net/keybox'
import { DEFAULT_TEAM, progressLabel } from '../types'
import { isOnline, useNow, usePresenceAll, useTeamsAll } from '../net/hooks'

export default function MasterScreen() {
  const all = usePresenceAll()
  const teams = useTeamsAll()
  const now = useNow()
  const keyboxes = useKeyboxAll()
  const [kbSettings] = useKeyboxSettings()
  const link = useKeyboxLink(keyboxes, addrsOf(kbSettings))
  const sendFailed = useKeyboxSendFailed()
  const row = (key: string, label: string, extra?: React.ReactNode) => (
    <div className="conn-item" key={key}>
      <ConnDot on={isOnline(all[key], now)} />
      {label}
      {extra}
    </div>
  )
  const teamRow = (n: number) => {
    const t = { ...DEFAULT_TEAM, ...(teams[String(n)] ?? {}) }
    return row(
      `player-${n}`,
      `チーム ${n}`,
      <span className="conn-progress">
        {progressLabel(t)}
        {t.started && <span className={t.locked ? 'locked' : 'open'}>{t.locked ? '🔒' : ''}</span>}
      </span>,
    )
  }
  /** 全チームを「はじめから」を押した直後の状態に戻す（ステージ0・フタあり） */
  const resetAll = () => {
    const now = Date.now()
    Promise.all(
      Array.from({ length: TEAM_COUNT }, (_, i) =>
        getBackend().set('teams', String(i + 1), {
          ...DEFAULT_TEAM,
          // 「はじめから」を押した直後の状態（フタがかかって待機）
          started: true,
          room: ROOM_BY_TEAM[i + 1] ?? i + 1,
          resetAt: now,
          updatedAt: now,
        }),
      ),
    ).catch(() => {})
  }

  return (
    <div className="screen master">
      <Header
        title="マスター"
        right={<HoldButton onComplete={resetAll} doneLabel="リセットが完了しました">すべての端末をリセット（長押し）</HoldButton>}
      />
      <div className="master-cols">
      <div className="master-left">
      <section className="card">
        <h2 className="section-title">スタッフ</h2>
        <div className="conn-grid">{row('staff', 'スタッフ')}</div>
      </section>
      <section className="card">
        <h2 className="section-title">プレイヤー</h2>
        <div className="conn-grid">
          {Array.from({ length: TEAM_COUNT }, (_, i) => teamRow(i + 1))}
        </div>
      </section>
      </div>
      <section className="card keybox-card">
        <div className="keybox-head">
          <h2 className="section-title">キーボックス</h2>
          <span className="keybox-link">
            <ConnDot on={link.connected} />
            USBアンテナ {link.connected ? '接続中' : '未接続'}
          </span>
          {link.connected ? (
            <button className="sub" onClick={link.disconnect}>切断</button>
          ) : (
            <button disabled={!link.supported} onClick={link.connect}>アンテナに接続</button>
          )}
          {sendFailed && <span className="warn">指令を書き込めません（Firestoreのルールを確認）</span>}
          {!link.supported && <span className="warn">このブラウザは Web Serial に未対応です（Chrome / Edge を使用）</span>}
        </div>
        <div className="conn-grid">
          {Array.from({ length: KEYBOX_COUNT }, (_, i) => {
            const id = i + 1
            const addr = kbSettings[id]?.ad
            const ringing = !!keyboxes[String(id)]?.ringing
            return (
              <div className="conn-item keybox-item" key={id}>
                <span className="keybox-name">キーボックス {id}</span>
                <small>ad 0x{addr !== undefined ? toHex2(addr) : '--'}</small>
                <span className="keybox-input">{(addr !== undefined && link.inputs[addr]) || '－'}</span>
                <button
                  className={`keybox-ring${ringing ? ' is-on' : ' sub'}`}
                  onClick={() => setKeyboxRinging(id, !ringing)}
                >
                  {ringing ? '音を止める' : '音を鳴らす'}
                </button>
                <button className="keybox-ring" onClick={() => requestKeyboxUnlock(id)}>開ける</button>
                <button className="keybox-ring sub" onClick={() => requestKeyboxLock(id)}>施錠する</button>
              </div>
            )
          })}
        </div>
      </section>
      </div>
    </div>
  )
}

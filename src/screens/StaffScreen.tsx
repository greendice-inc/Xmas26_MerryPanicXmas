import { useEffect, useState } from 'react'
import ConnDot from '../components/ConnDot'
import Header from '../components/Header'
import TwoTapButton from '../components/TwoTapButton'
import { KEYBOX_COUNT, TEAM_COUNT } from '../config'
import { getBackend } from '../net'
import { isOnline, useNow, usePresenceAll, useTeamsAll } from '../net/hooks'
import { toHex2 } from '../keybox/protocol'
import { useKeyboxSettings } from '../keybox/settings'
import { LINK_ID, requestKeyboxLock, requestKeyboxUnlock, setKeyboxRinging, useKeyboxAll, useKeyboxSendFailed } from '../net/keybox'
import { ORDER_STAGES } from '../santazon/products'
import { useProducts } from '../santazon/useProducts'
import { SCENE_NODES, sceneIndex } from '../sceneProgress'
import { DEFAULT_TEAM, type TeamDoc } from '../types'

/** 進捗バー：ステージごとに丸をひとつ（1〜5・END）。いまのステージまでを塗り、いまのシーン名を右に出す */
/** いまのシーン名（例：わなげ 会話）。未開始は「未開始」 */
function sceneName(t: TeamDoc): string {
  const i = sceneIndex(t)
  return i >= 0 ? SCENE_NODES[i].label : '未開始'
}
const STAGE_DOTS = ['1', '2', '3', '4', '5', 'END']
function ProgressOrnament({ team }: { team: TeamDoc }) {
  const now = !team.started ? -1 : team.phase === 'end' ? 5 : Math.min(Math.max(team.stage - 1, 0), 4)
  return (
    <div className="progress-track">
      <span className="progress-dots" aria-hidden>
        {STAGE_DOTS.map((d, i) => (
          <span key={d} className="progress-step">
            {i > 0 && <i className={`progress-bar${i <= now ? ' is-done' : ''}`} />}
            <i className={`progress-node is-lg${i < now ? ' is-done' : ''}${i === now ? ' is-now' : ''}`} title={d} />
          </span>
        ))}
      </span>
    </div>
  )
}

export default function StaffScreen() {
  const { products } = useProducts()
  const teams = useTeamsAll()
  const presence = usePresenceAll()
  const keyboxes = useKeyboxAll()
  // 下のバーで操作するキーボックス（1か2を切り替える）
  const [boxId, setBoxId] = useState(1)
  const sendFailed = useKeyboxSendFailed()
  const [kbSettings] = useKeyboxSettings()
  const boxRinging = !!keyboxes[String(boxId)]?.ringing
  const now = useNow()
  // マスターが生きていて、そのUSBアンテナがつながっているときだけ、キーボックスに指令が届く
  const masterOn = isOnline(presence['master'], now)
  const antennaOn = masterOn && !!keyboxes[LINK_ID]?.connected
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const teamDoc = (n: number) => ({ ...DEFAULT_TEAM, ...(teams[String(n)] ?? {}) })
  const teamNos = Array.from({ length: TEAM_COUNT }, (_, i) => i + 1)
  const allLocked = teamNos.every((n) => teamDoc(n).locked)
  const allOpen = teamNos.every((n) => !teamDoc(n).locked)

  /** 全チームのフタを一括で切り替える */
  const setAllLocked = (locked: boolean) =>
    Promise.all(
      teamNos.map((n) => getBackend().set('teams', String(n), { locked, updatedAt: Date.now() })),
    ).catch(() => {})

  return (
    <div className="screen staff">
      <Header
        title="スタッフ"
        right={
          <div className="bulk-bar">
            <TwoTapButton disabled={allLocked} armedLabel="もう一度押すとロック" onConfirm={() => setAllLocked(true)}>
              一括ロック
            </TwoTapButton>
            <TwoTapButton
              className="dark"
              disabled={allOpen}
              armedLabel="もう一度押すと解除"
              onConfirm={() => setAllLocked(false)}
            >
              一括ロック解除
            </TwoTapButton>
          </div>
        }
      />
      <div className="staff-list">
        {teamNos.map((n) => {
          const t = teamDoc(n)
          const order = t.order
          // 正解のあと、プレイヤーが待っている間だけ「次へ」を押せる（押すと、プレイヤーに「タップで次のステージに進む」が出る）
          const canNext =
            t.phase === 'game' &&
            ORDER_STAGES.includes(t.stage) &&
            !!order &&
            order.status === 'solved' &&
            order.proceedAt == null
          return (
            <div className={`staff-row ${t.locked ? 'is-locked' : 'is-open'}`} key={n}>
              <div className="staff-row-body">
                <div className="staff-row-main">
                  <ConnDot on={isOnline(presence[`player-${n}`], now)} />
                  <div className="team-no">チーム {n}</div>
                  <div className="progress">{sceneName(t)}</div>
                  {t.order ? (
                    <>
                      <span className={`order-status ${t.order.status}`}>
                        {t.order.status === 'delivered' ? '解答中' : t.order.status === 'solved' ? '正解！' : '注文あり'}
                      </span>
                      <span className="order-items">
                        {t.order.items.map((i) => `${products.find((p) => p.id === i.id)?.name ?? i.id}×${i.qty}`).join('、')}
                      </span>
                    </>
                  ) : (
                    <span className="order-none">注文なし</span>
                  )}
                </div>
                <ProgressOrnament team={t} />
              </div>
              <div className="staff-row-side">
                <div className={`lock-state ${t.locked ? 'locked' : 'open'}`}>{t.locked ? 'ロック中' : '解除中'}</div>
                <div className="stay-row">
                  <button
                    className="order-ready"
                    disabled={!canNext}
                    onClick={() => {
                      if (!order) return
                      getBackend()
                        .set('teams', String(n), {
                          order: { ...order, proceedAt: Date.now(), stayed: false },
                          updatedAt: Date.now(),
                        })
                        .catch(() => {})
                    }}
                  >
                    次へ
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="keybox-bar">
        <span className="keybox-bar-title">キーボックス</span>
        <div className="keybox-pick">
          {Array.from({ length: KEYBOX_COUNT }, (_, i) => {
            const id = i + 1
            return (
              <button key={id} className={`keybox-tab${id === boxId ? ' is-on' : ''}`} onClick={() => setBoxId(id)}>
                {id}{keyboxes[String(id)]?.ringing ? ' ♪' : ''}
              </button>
            )
          })}
        </div>
        <span className="keybox-ad">ad 0x{toHex2(kbSettings[boxId]?.ad ?? 0)}</span>
        <button className={`keybox-ring${boxRinging ? ' is-on' : ' sub'}`} onClick={() => setKeyboxRinging(boxId, !boxRinging)}>
          {boxRinging ? '音を止める' : '音を鳴らす'}
        </button>
        <button className="keybox-act" onClick={() => requestKeyboxUnlock(boxId)}>開ける</button>
        <button className="keybox-act sub" onClick={() => requestKeyboxLock(boxId)}>施錠する</button>
        {sendFailed && <span className="warn">指令を送れませんでした</span>}
      </div>
      <div className="status-bar">
        <span><ConnDot on={online} /> ネットワーク: {online ? 'オンライン' : 'オフライン'}</span>
        <span>データ通信: {getBackend().kind === 'firestore' ? 'Firestore' : 'ローカル（テスト）'}</span>
        <span>スタッフ接続: <ConnDot on={isOnline(presence['staff'], now)} /></span>
        <span>マスター接続: <ConnDot on={masterOn} /></span>
        <span>USBアンテナ: <ConnDot on={antennaOn} /></span>
      </div>
    </div>
  )
}

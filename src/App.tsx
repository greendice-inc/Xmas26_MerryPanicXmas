import { useEffect, useState } from 'react'
import HiddenMenu from './components/HiddenMenu'
import Stage from './components/Stage'
import { ROOM_BY_TEAM } from './config'
import { game1OrderedQty, stage3OrderedQty } from './santazon/products'
import { useTeam, usePresence } from './net/hooks'
import { getBackend } from './net/index'
import { ProductsProvider, useProducts } from './santazon/useProducts'
import CatalogScreen from './screens/CatalogScreen'
import ScriptScreen from './screens/ScriptScreen'
import KeyboxScreen from './screens/KeyboxScreen'
import KeyboxTestScreen from './screens/KeyboxTestScreen'
import MasterScreen from './screens/MasterScreen'
import PlayerScreen from './screens/PlayerScreen'
import StaffScreen from './screens/StaffScreen'
import TopScreen from './screens/TopScreen'
import { useAdultSkip } from './adultWait'
import { DEFAULT_BINGO, type BingoStep, type Identity, type LastStep } from './types'
import { LAST_STEPS } from './games/lastData'

/** 開発用のアイテム登録は ?debug=true のときだけ開く */
function isDebug(): boolean {
  return new URLSearchParams(location.search).get('debug') === 'true'
}

type Page = 'catalog' | 'script' | 'keybox'

/** ?debug=true のときだけ開く画面（アイテム登録・セリフ編集・キーボックスのテスト） */
function debugPage(): Page | null {
  if (!isDebug()) return null
  const path = location.pathname.replace(/\/+$/, '')
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '')
  for (const p of ['catalog', 'script', 'keybox'] as const) if (path === `${base}/${p}` || location.hash === `#${p}`) return p
  return null
}

function Session({ identity }: { identity: Identity }) {
  usePresence(identity)
  switch (identity.role) {
    case 'master':
      return <MasterScreen />
    case 'staff':
      return <StaffScreen />
    case 'player':
      return <PlayerScreen team={identity.id} />
    case 'keybox':
      return <KeyboxScreen id={identity.id} />
  }
}

/** プレイヤー端末の隠しメニュー。チームの状態を見て、ロック解除の表示を決める */
function PlayerHiddenMenu({ team, onReset, onReconnect }: { team: number; onReset: () => void; onReconnect: () => void }) {
  const [doc] = useTeam(team)
  const { products } = useProducts()
  const skipWait = useAdultSkip()
  return (
    <HiddenMenu
      onReset={onReset}
      onReconnect={onReconnect}
      onSkipWait={skipWait ?? undefined}
      fullscreenToggle
      locked={doc.locked}
      onJump={({ stage, phase, step }) => {
        // ステージ1の注文は子供部屋で行う。それより後のシーンでは、正しい3点がすでに消費されている
        const pastStage1 = phase === 'end' || stage > 1
        // ステージ2：見つけた人数に合わせて、案内の済み具合・記録・検索済みリストを揃える
        const found = step === 'amy' ? 1 : step === 'jimmy' ? 2 : step === 'tommy' ? 3 : 0
        const names = ['マネキン', 'セーター', 'オーバーオール']
        const idOf = (name: string) => products.find((p) => p.name === name)?.id
        const searched =
          stage === 2 && phase === 'game'
            ? names.slice(0, found).flatMap((n) => idOf(n) ?? [])
            : stage > 2 || phase === 'end'
              ? names.flatMap((n) => idOf(n) ?? [])
              : []
        const stage2Played = found > 0
        // ステージ3：押さえてワードの位置。それより後は、注文まで済んでいる
        const wordSteps = ['rule', 'g1', 'g2', 'room'] as const
        const wordStep =
          stage === 3 && phase === 'game' ? (wordSteps.find((w) => w === step) ?? 'rule') : stage > 3 || phase === 'end' ? 'room' : 'rule'
        const pastStage3 = stage > 3 || phase === 'end'
        // ステージ4：ビンゴの位置。説明が済んでいれば、キモチとジャック機能が使える
        const bingoSteps: BingoStep[] = ['rule', 'r1', 'r2']
        const bingoStep: BingoStep =
          stage === 4 && phase === 'game' ? (bingoSteps.find((b) => b === step) ?? 'rule') : stage > 4 || phase === 'end' ? 'done' : 'rule'
        getBackend()
          .set('teams', String(team), {
            started: true,
            room: ROOM_BY_TEAM[team] ?? team,
            stage,
            phase,
            locked: false,
            order: null,
            orderedQty: [...(pastStage1 ? game1OrderedQty() : []), ...(pastStage3 ? stage3OrderedQty() : [])],
            searched,
            // ステージ1のゲーム2（正しい注文）は、特定が終わったあとの子供部屋
            markCleared: stage === 1 && step === 'order',
            // ステージ1の説明：マーク当ての途中から入るときだけ、まだ解けていない
            markSolved: !(stage === 1 && phase !== 'game') && !(stage === 1 && step === 'quiz'),
            sockTold: stage > 1 || phase === 'end',
            // ステージ2の案内でリスト追加検索と商品カードが解放される。それより後はすでに解放済み
            searchUnlocked: stage > 2 || phase === 'end' || stage2Played,
            records: stage > 2 || phase === 'end' || stage2Played ? ['st2-card'] : [],
            hide: { tutorialDone: stage2Played, found },
            word: { step: wordStep, chairTold: pastStage3 },
            bingo: { ...DEFAULT_BINGO, step: bingoStep, jack: bingoStep !== 'rule' },
            // LAST：注文の位置。エンディングは、マスターエルフの話まで済んでいる
            last: {
              step:
                stage === 5 && phase === 'game'
                  ? (LAST_STEPS.find((s) => s === step) ?? 'basket')
                  : phase === 'end' || (stage === 5 && phase === 'clear')
                    ? ('super' as LastStep)
                    : 'basket',
            },
            enterAt: Date.now(),
            updatedAt: Date.now(),
          })
          .catch(() => {})
      }}
      onUnlock={() => getBackend().set('teams', String(team), { locked: false, updatedAt: Date.now() }).catch(() => {})}
    />
  )
}

export default function App() {
  const [page, setPage] = useState<Page | null>(debugPage)
  const [identity, setIdentity] = useState<Identity | null>(null)
  // 再接続：Session を作り直して購読・heartbeat を張り直す
  const [connKey, setConnKey] = useState(0)

  // フルスクリーンはユーザー操作（ボタン押下）の直後でないと開始できないため、選択時に要求する
  const select = (i: Identity) => {
    if (i.role !== 'master' && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {})
    }
    setIdentity(i)
  }

  // トップ画面（未選択）に戻ったらフルスクリーンを解除する
  useEffect(() => {
    if (!identity && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
  }, [identity])

  useEffect(() => {
    const onPop = () => setPage(debugPage())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const withDebug = (path: string) => {
    const url = new URL(path, location.origin)
    url.searchParams.set('debug', 'true')
    return url.pathname + url.search
  }
  const openPage = (p: Page) => {
    const base = import.meta.env.BASE_URL
    const prefix = base.endsWith('/') ? base : `${base}/`
    history.pushState({}, '', withDebug(`${prefix}${p}`))
    setPage(p)
  }
  const closePage = () => {
    history.pushState({}, '', withDebug(import.meta.env.BASE_URL))
    setPage(null)
  }

  return (
    <ProductsProvider>
    {page === 'catalog' ? <CatalogScreen onBack={closePage} /> : page === 'script' ? <ScriptScreen onBack={closePage} /> : page === 'keybox' ? <Stage><KeyboxTestScreen onBack={closePage} /></Stage> : (
    <Stage>
      {identity ? (
        <>
          <Session key={connKey} identity={identity} />
          {identity.role === 'player' ? (
            <PlayerHiddenMenu team={identity.id} onReset={() => setIdentity(null)} onReconnect={() => setConnKey((k) => k + 1)} />
          ) : (
            <HiddenMenu
              onReset={() => setIdentity(null)}
              onReconnect={() => setConnKey((k) => k + 1)}
              fullscreenToggle={identity.role === 'staff'}
            />
          )}
        </>
      ) : (
        <TopScreen
          onSelect={select}
          onOpenCatalog={isDebug() ? () => openPage('catalog') : undefined}
          onOpenScript={isDebug() ? () => openPage('script') : undefined}
          onOpenKeybox={isDebug() ? () => openPage('keybox') : undefined}
        />
      )}
    </Stage>
    )}
    </ProductsProvider>
  )
}

import { useEffect, useRef, useState } from 'react'
import { PREVIEW, previewTarget } from './preview'
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
import { DEFAULT_BINGO, DEFAULT_LAST, DEFAULT_WORD, type BingoStep, type Identity, type JumpTarget, type LastStep } from './types'
import { LAST_STEPS } from './games/lastData'
import { ALL_MARK_SCORES } from './games/MarkGame'

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

function Session({ identity, onKicked }: { identity: Identity; onKicked: () => void }) {
  usePresence(identity, onKicked)
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
  // プレビュー：商品を読み終えたら、URL の場面へ飛ぶ（1回だけ）
  const previewed = useRef(false)
  useEffect(() => {
    if (!PREVIEW || previewed.current) return
    const go = () => {
      if (previewed.current) return
      previewed.current = true
      jump(previewTarget())
    }
    // 商品が読めないときも、少し待ったら飛ぶ
    if (products.length > 0) go()
    else {
      const t = setTimeout(go, 3000)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length])

  const save = (patch: Record<string, unknown>) =>
    getBackend()
      .set('teams', String(team), { ...patch, enterAt: Date.now(), updatedAt: Date.now() })
      .catch(() => {})
  /**
   * いまのゲームを、正しく解いた直後の状態へ進める（解いたあとの会話・暗転は飛ばす）。
   * ステージ1のマーク → 各マークに正解を自動で入力する / ステージ2 → 3人とも見つけた（クリア後）
   * ステージ3 → 次のゲーム（T1→T2→T3→クリア後）/ ステージ4 → 次のラウンド（B1→B2→次のステージ）
   * ステージ5 → 次の段階（取り出し→煙突→緊急→クリア後）
   * 強制クリアできないところ（会話の最中、ステージ1のマークのあと）では、ボタンを出さない
   */
  const forceClear = (() => {
    if (doc.phase !== 'game') return undefined
    switch (doc.stage) {
      case 1:
        // マークの画面に「全部のマークに正解を入力する」ことを頼む（そのあとは、ふつうに解いたときと同じ流れ）
        return doc.markSolved ? undefined : () => window.dispatchEvent(new Event('mpx:force-clear'))
      case 2:
        return () => jump({ stage: 2, phase: 'clear' })
      case 3: {
        const w = doc.word?.step ?? 'rule'
        if (w === 'room') return () => jump({ stage: 3, phase: 'clear' })
        return () => save({ word: { ...DEFAULT_WORD, ...doc.word, step: w === 'g2' ? 'room' : 'g2' } })
      }
      case 4: {
        const b = doc.bingo?.step ?? 'rule'
        if (b === 'r2' || b === 'done') return () => jump({ stage: 5, phase: 'novel' })
        return () =>
          save({ bingo: { ...DEFAULT_BINGO, step: 'r2', jack: true }, order: null, records: [...new Set([...(doc.records ?? []), 'st4-r1'])] })
      }
      case 5: {
        const l = doc.last?.step ?? 'basket'
        if (l === 'notice' || l === 'super') return () => jump({ stage: 5, phase: 'clear' })
        const next: LastStep = l === 'basket' ? 'extract' : l === 'extract' ? 'balls' : 'notice'
        return () => save({ last: { ...DEFAULT_LAST, ...doc.last, step: next }, order: null })
      }
    }
    return undefined
  })()

  const jump = ({ stage, phase, step }: JumpTarget) => {
        // ステージ1の注文は子供部屋で行う。それより後のシーンでは、正しい2点がすでに消費されている
        const pastStage1 = phase === 'end' || stage > 1
        // ステージ2：見つけた人数に合わせて、案内の済み具合・記録・検索済みリストを揃える
        const found = step === 'amy' ? 1 : step === 'jimmy' ? 2 : step === 'tommy' || (stage === 2 && phase === 'clear') ? 3 : 0
        const names = ['マネキン', 'セーター', 'オーバーオール']
        const idOf = (name: string) => products.find((p) => p.name === name)?.id
        const searched =
          stage === 2 && (phase === 'game' || phase === 'clear')
            ? names.slice(0, found).flatMap((n) => idOf(n) ?? [])
            : stage > 2 || phase === 'end'
              ? names.flatMap((n) => idOf(n) ?? [])
              : []
        // ステージ4のROUND2でサッカーボール7個を1つ発送していて、リストにも載っている（LAST の最初は在庫 4/5）
        const pastStage4 = stage >= 5 || phase === 'end' || (stage === 4 && phase === 'clear')
        const ballId = products.find((p) => p.name.replace(/\s/g, '').startsWith('サッカーボール'))?.id
        const stage2Played = found > 0
        // ステージ3：押さえてワードの位置。それより後は、注文まで済んでいる
        const wordSteps = ['rule', 'g1', 'g2', 'room'] as const
        const wordStep =
          stage === 3 && phase === 'game'
            ? (wordSteps.find((w) => w === step) ?? 'rule')
            : stage > 3 || phase === 'end' || (stage === 3 && phase === 'clear')
              ? 'room'
              : 'rule'
        const pastStage3 = stage > 3 || phase === 'end' || (stage === 3 && phase === 'clear')
        // 金庫は第3ゲームで検索する想定。お題（部屋）が出たあとのシーンは、金庫がリストに加わった状態で始める
        const safeId = idOf('金庫')
        const safeIn = stage > 3 || phase === 'end' || (stage === 3 && (phase === 'clear' || (phase === 'game' && wordStep === 'room')))
        // ステージ4：ビンゴの位置。説明が済んでいれば、キモチとジャック機能が使える
        const bingoSteps: BingoStep[] = ['rule', 'r1', 'r2']
        const bingoStep: BingoStep =
          stage === 4 && phase === 'game' ? (bingoSteps.find((b) => b === step) ?? 'rule') : stage > 4 || phase === 'end' || (stage === 4 && phase === 'clear') ? 'done' : 'rule'
        getBackend()
          .set('teams', String(team), {
            started: true,
            room: ROOM_BY_TEAM[team] ?? team,
            stage,
            phase,
            locked: false,
            order: null,
            orderedQty: [
              ...(pastStage1 ? game1OrderedQty() : []),
              ...(pastStage3 ? stage3OrderedQty() : []),
              ...(pastStage4 && ballId ? [{ id: ballId, qty: 1 }] : []),
            ],
            searched: [...searched, ...(safeIn && safeId ? [safeId] : []), ...(pastStage4 && ballId ? [ballId] : [])],
            // ステージ1のゲーム2（正しい注文）は、特定が終わったあとの子供部屋
            markCleared: stage === 1 && (step === 'order' || phase === 'clear'),
            // ステージ1の説明：マーク当ての途中から入るときだけ、まだ解けていない
            markSolved: !(stage === 1 && phase === 'novel') && !(stage === 1 && phase === 'game' && step === 'quiz'),
            // 記録の「マークのルール」：答えが合ったマーク（マークが済んだあとなら全部、まだなら空）
            markScores: !(stage === 1 && phase === 'novel') && !(stage === 1 && phase === 'game' && step === 'quiz') ? ALL_MARK_SCORES : {},
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
  }
  return (
    <HiddenMenu
      label={`チーム ${team}`}
      onReset={onReset}
      onReconnect={onReconnect}
      onSkipWait={skipWait ?? undefined}
      fullscreenToggle
      locked={doc.locked}
      onJump={jump}
      // 隠しメニューの「ゲームを強制クリア」：いまのゲームを、正しく解いた直後の状態へ進める
      onForceClear={forceClear}
      onUnlock={() => getBackend().set('teams', String(team), { locked: false, updatedAt: Date.now() }).catch(() => {})}
    />
  )
}

export default function App() {
  const [page, setPage] = useState<Page | null>(debugPage)
  // プレビュー（?preview）は、チーム1として入る
  const [identity, setIdentity] = useState<Identity | null>(PREVIEW ? { role: 'player', id: 1 } : null)
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
          <Session key={connKey} identity={identity} onKicked={() => setIdentity(null)} />
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

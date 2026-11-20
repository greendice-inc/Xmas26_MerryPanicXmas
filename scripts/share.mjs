// 手元の開発サーバーを、ほかの人も URL で見られるようにする（npm run share）
// 1. 開発サーバー（vite、5173番）が動いていなければ起動する
// 2. トンネルを起動して、外から見られる URL を出す
//    - Dev Tunnels（devtunnel）に名前付きトンネル（既定は merrypanic、環境変数 SHARE_DEVTUNNEL で変更）があれば、
//      それを使う。URL は毎回同じ（https://<名前>-5173.<地域>.devtunnels.ms）
//    - なければ Cloudflare の一時トンネル。URL は起動のたびに変わる（https://〜.trycloudflare.com）
// Ctrl+C で、このスクリプトが起動したものをまとめて止める
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { connect } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PORT = 5173
const TUNNEL = process.env.SHARE_DEVTUNNEL || 'merrypanic'
const bin = (name) => (existsSync(join(homedir(), '.local/bin', name)) ? join(homedir(), '.local/bin', name) : name)
const children = []

const portOpen = () =>
  new Promise((ok) => {
    const s = connect(PORT, '127.0.0.1')
    s.once('connect', () => (s.destroy(), ok(true)))
    s.once('error', () => ok(false))
  })

function stopAll() {
  for (const c of children) if (c.exitCode === null) c.kill('SIGINT')
}
process.on('SIGINT', () => (stopAll(), process.exit(0)))
process.on('SIGTERM', () => (stopAll(), process.exit(0)))

function run(cmd, args, onLine) {
  const c = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(c)
  const read = (buf) => {
    for (const line of buf.toString().split('\n')) if (line.trim()) onLine(line)
  }
  c.stdout.on('data', read)
  c.stderr.on('data', read)
  c.on('error', (e) => console.log(`[share] ${cmd} を起動できませんでした（${e.message}）`))
  c.on('exit', (code) => {
    console.log(`[${cmd.split('/').pop()}] 止まりました（${code}）`)
    stopAll()
    process.exit(code ?? 1)
  })
  return c
}

const showUrl = (url, note) => console.log(`\n  ほかの人に渡す URL:  ${url}\n  ${note}（止めるときは Ctrl+C）\n`)

if (await portOpen()) {
  console.log(`[share] 開発サーバーはもう ${PORT} 番で動いているので、それを使います`)
} else {
  console.log('[share] 開発サーバーを起動します')
  run('npx', ['vite', '--host', '--port', String(PORT), '--strictPort'], (l) => console.log(`[vite] ${l}`))
  while (!(await portOpen())) await new Promise((r) => setTimeout(r, 300))
}

const devtunnel = bin('devtunnel')
const hasDevTunnel = spawnSync(devtunnel, ['show', TUNNEL], { stdio: 'ignore' }).status === 0
let shown = false

if (hasDevTunnel) {
  console.log(`[share] Dev Tunnels のトンネル「${TUNNEL}」を使います（URL は毎回同じ）`)
  run(devtunnel, ['host', TUNNEL], (l) => {
    // 「Connect via browser: https://xxx.devtunnels.ms, https://xxx-5173.asse.devtunnels.ms」から、ポート付きのものを取る
    const url = l.match(new RegExp(`https://[a-z0-9-]+-${PORT}\\.[a-z0-9.-]*devtunnels\\.ms`))?.[0]
    if (url && !shown) {
      shown = true
      showUrl(url, 'この URL はずっと同じです。')
    } else if (/error|fail/i.test(l)) console.log(`[devtunnel] ${l}`)
  })
} else {
  console.log(`[share] Dev Tunnels のトンネル「${TUNNEL}」が無いので、Cloudflare の一時トンネルを使います（URL は毎回変わる）`)
  run(bin('cloudflared'), ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], (l) => {
    const url = l.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0]
    if (url && !shown) {
      shown = true
      showUrl(url, '起動のたびに URL が変わります。')
    } else if (/ ERR /.test(l)) {
      // 警告（WRN：ping の権限・UDP バッファなど）は動作に関係ないので出さない
      console.log(`[cloudflared] ${l}`)
    }
  })
}

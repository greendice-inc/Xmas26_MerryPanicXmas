/** この端末の目印。接続状況（presence）に一緒に書いて、「同じ端末なら、起動中でも入り直せる」ようにする */
let cached: string | null = null

export function deviceId(): string {
  if (cached) return cached
  const make = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  try {
    cached = localStorage.getItem('mpx-device') || make()
    localStorage.setItem('mpx-device', cached)
  } catch {
    // 保存できない端末（プライベートブラウズなど）は、このページを開いている間だけの目印
    cached = make()
  }
  return cached
}

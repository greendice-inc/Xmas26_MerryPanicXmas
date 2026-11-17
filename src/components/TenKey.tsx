import { useState } from 'react'

/**
 * 数字を入れるテンキー（Nintendo Switch 2 の数字入力を参考にした並び）。
 * 1〜9 を3列、0 は下の真ん中。右の列に ⌫ と OK
 */
export default function TenKey({
  length,
  onSubmit,
  okLabel = 'OK',
}: {
  /** 入れる桁数（この数の枠を出し、埋まったら OK を押せる） */
  length: number
  /** OK を押したとき。入力は消える */
  onSubmit: (value: string) => void
  okLabel?: string
}) {
  const [value, setValue] = useState('')
  const put = (d: string) => setValue((v) => (v.length >= length ? v : v + d))
  const submit = () => {
    if (value.length !== length) return
    onSubmit(value)
    setValue('')
  }
  return (
    <div className="tenkey">
      <div className="tenkey-slots">
        {Array.from({ length }, (_, i) => (
          <span key={i} className={i === value.length ? 'is-cur' : ''}>
            {value[i] ?? ''}
          </span>
        ))}
      </div>
      <div className="tenkey-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d, i) => (
          <button key={d} className="tenkey-key" style={{ gridRow: Math.floor(i / 3) + 1, gridColumn: (i % 3) + 1 }} onClick={() => put(d)}>
            {d}
          </button>
        ))}
        <button className="tenkey-key" style={{ gridRow: 4, gridColumn: 2 }} onClick={() => put('0')}>
          0
        </button>
        <button className="tenkey-key is-side" style={{ gridRow: 1, gridColumn: 4 }} onClick={() => setValue((v) => v.slice(0, -1))} aria-label="1文字消す">
          ⌫
        </button>
        <button className="tenkey-key is-ok" style={{ gridRow: '2 / span 3', gridColumn: 4 }} disabled={value.length !== length} onClick={submit}>
          {okLabel}
        </button>
      </div>
    </div>
  )
}

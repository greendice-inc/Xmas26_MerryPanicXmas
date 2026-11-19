import { useState } from 'react'

/**
 * 数字を入れるテンキー（Nintendo Switch 2 の数字入力を参考にした並び）。
 * 電話と同じ3列の並び：1〜9、下の段が ⌫・0・OK。全体が左右対称で、2・5・8・0 の列が真ん中に来る
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
      <TenKeyPad
        onKey={put}
        onDelete={() => setValue((v) => v.slice(0, -1))}
        onOk={submit}
        okDisabled={value.length !== length}
        okLabel={okLabel}
      />
    </div>
  )
}

/**
 * テンキーのボタン部分だけ（電話と同じ3列：1〜9、下の段が ⌫・0・OK）。
 * ソックスキーのナゾも、マークも、この部品を使うので、大きさと見た目は同じになる
 */
export function TenKeyPad({
  onKey,
  onDelete,
  onOk,
  okDisabled,
  okLabel = 'OK',
  disabled,
  deleteProps,
  className = '',
}: {
  onKey: (d: string) => void
  onDelete: () => void
  onOk: () => void
  okDisabled?: boolean
  okLabel?: string
  /** true のとき、数字・⌫・OK のすべてを押せなくする */
  disabled?: boolean
  /** ⌫ に足す指定（長押しなど） */
  deleteProps?: React.ButtonHTMLAttributes<HTMLButtonElement>
  className?: string
}) {
  return (
    <div className={`tenkey tenkey-solo ${className}`}>
      <div className="tenkey-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d, i) => (
          <button key={d} className="tenkey-key" style={{ gridRow: Math.floor(i / 3) + 1, gridColumn: (i % 3) + 1 }} disabled={disabled} onClick={() => onKey(d)}>
            {d}
          </button>
        ))}
        <button className="tenkey-key" style={{ gridRow: 4, gridColumn: 2 }} disabled={disabled} onClick={() => onKey('0')}>
          0
        </button>
        <button
          className="tenkey-key is-side"
          style={{ gridRow: 4, gridColumn: 1 }}
          disabled={disabled}
          onClick={onDelete}
          aria-label="1文字消す"
          {...deleteProps}
        >
          ⌫
        </button>
        <button className="tenkey-key is-ok" style={{ gridRow: 4, gridColumn: 3 }} disabled={disabled || okDisabled} onClick={onOk}>
          {okLabel}
        </button>
      </div>
    </div>
  )
}

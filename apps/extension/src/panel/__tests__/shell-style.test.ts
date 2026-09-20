import { describe, expect, it } from 'vitest'
import overlayCss from '../overlay.css?raw'
import panelCss from '../panel.css?raw'
import sharedCss from '../shell-style.css?raw'
import { mountOverlay, OVERLAY_HOST_ID } from '../overlay'

/**
 * 两套外壳共用同一份样式来源（#18、ADR-0005）。
 *
 * 断言的是外部行为：共享来源里每个 token 只有一个定义、取值就是换色前的那些；两壳都不许
 * 再手写配色、字号与间距，只许引用 token；浮层注入 shadow DOM 的样式来自同一份来源。
 * 不比对样式文本长相，也不比对 HTML 结构。
 */

/**
 * 取值是独立的事实来源：共享来源一旦换色，这里的字面量必须跟着改，说明它确实被引用了。
 * token 与字面量一一对应，任何取值都藏不进共享文件里游而不被钉住。
 */
const values = {
  '--ca-bg': '#0b1015',
  '--ca-surface': '#111920',
  '--ca-surface-raised': '#131c23',
  '--ca-line': '#29343d',
  '--ca-line-strong': '#35414a',
  '--ca-line-control': '#44515a',
  '--ca-line-soft': '#202b33',
  '--ca-ink': '#f2f5f3',
  '--ca-ink-body': '#cdd5d4',
  '--ca-ink-muted': '#8b9794',
  '--ca-accent': '#6ea8a0',
  '--ca-danger': '#c99b8d',
  '--ca-identity-surface': '#2b2116',
  '--ca-identity-line': '#695235',
  '--ca-identity-ink': '#ddbf94',
  '--ca-shadow': '0 6px 20px rgba(0, 0, 0, .45)',
  '--ca-font-family': 'system-ui, sans-serif',
  '--ca-leading-body': '1.55',
  '--ca-leading-compact': '1.5',
  '--ca-font-micro': '9px',
  '--ca-font-xs': '10px',
  '--ca-font-sm': '11px',
  '--ca-font-md': '12px',
  '--ca-font-lg': '13px',
  '--ca-font-title': '14px',
  '--ca-font-metric': '17px',
  '--ca-space-2': '2px',
  '--ca-space-3': '3px',
  '--ca-space-4': '4px',
  '--ca-space-5': '5px',
  '--ca-space-6': '6px',
  '--ca-space-7': '7px',
  '--ca-space-8': '8px',
  '--ca-space-9': '9px',
  '--ca-space-10': '10px',
  '--ca-space-12': '12px',
  '--ca-space-14': '14px',
  '--ca-space-18': '18px',
  '--ca-space-26': '26px',
} as const

/** 两壳渲染时都走到的关键 token：两侧都必须引用它们，否则又分叉了。 */
const keyTokens = [
  '--ca-bg',
  '--ca-ink',
  '--ca-ink-body',
  '--ca-ink-muted',
  '--ca-accent',
  '--ca-font-md',
  '--ca-font-sm',
  '--ca-font-xs',
  '--ca-space-6',
  '--ca-space-8',
  '--ca-space-10',
]

/**
 * 一份来源要同时落到侧边栏文档与浮层 shadow 宿主上，靠的是这两个选择器。
 * 谁改了它们，token 就会在一侧失效——而这种失效不会让任何测试变红，只会让浮层掉色。
 */
const HOSTS = [':root', ':host']

/** 结构用的发丝线：描边宽度与焦点环偏移，不是配色也不是间距刻度。 */
const HAIRLINE = new Set(['1px', '2px', '-2px'])

/** 按属性家族检查手写取值：配色、字号、间距三类是 AC 说的「只有一份定义」。 */
const families: Array<[RegExp, RegExp]> = [
  [/^(color|background|background-color|border|border-(top|right|bottom|left|color|width|style)|fill|stroke|box-shadow|outline)$/, /#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/],
  [/^(font-size|font)$/, /[\d.]+(?:px|rem|em|pt|%)/],
  [/^(padding|margin|gap|row-gap|column-gap|outline-offset)(?:-\w+)?$/, /(?<![\w.-])[\d.]+(?:px|rem|em|%)/],
]

const declared = (css: string, token: string): string[] =>
  [...css.matchAll(new RegExp(token + '\\s*:\\s*([^;]+);', 'g'))].map((match) => match[1]!.trim())

/** 共享来源里所有自定义属性：用来反向确认没有藏起来的取值。 */
const declaredTokens = (css: string): string[] =>
  [...css.matchAll(/(--ca-[\w-]+)\s*:/g)].map((match) => match[1]!)

/** 单个文件里手写的配色、字号与间距。 */
const literalValues = (css: string): string[] =>
  [...css.matchAll(/^[^\S\n]*([a-z-]+)\s*:\s*([^;]+);/gm)].flatMap((match) => {
    const property = match[1]!
    const value = match[2]!
    const family = families.find(([names]) => names.test(property))
    if (family === undefined) return []
    return (value.match(family[1]) ?? []).filter((literal) => !HAIRLINE.has(literal))
  })

const mountedStyle = (): string => {
  const handle = mountOverlay(document, { onPin: async () => true, onToggleCollapsed: () => {}, onMove: () => {} }, { x: 0, y: 0 })
  expect(handle).not.toBeNull()
  const host = document.getElementById(OVERLAY_HOST_ID)
  return host!.shadowRoot!.querySelector('style')!.textContent!
}

describe('共享样式来源', () => {
  it('每个 token 只有一份定义，取值就是换色前的那些', () => {
    for (const [token, value] of Object.entries(values)) expect(declared(sharedCss, token)).toEqual([value])
    // 反向也要成立：共享文件里不许有集合之外、因此没被钉住的取值。
    expect(declaredTokens(sharedCss).sort()).toEqual(Object.keys(values).sort())
    // 一份来源同时服务文档与 shadow 宿主：两个选择器写在同一个规则块里。
    expect(sharedCss).toMatch(/:root\s*,\s*:host\s*\{/)
    expect(literalValues(sharedCss).filter((literal) => !literal.startsWith('0 '))).toEqual([])
  })

  it('侧边栏从共享来源引入，配色、字号与间距不再手写', () => {
    expect(panelCss).toContain('shell-style.css')
    for (const token of keyTokens) expect(panelCss).toContain('var(' + token + ')')
    expect(literalValues(panelCss)).toEqual([])
  })

  it('浮层在 shadow DOM 里拿到的是同一份来源生成的样式', () => {
    const style = mountedStyle()
    expect(style).toContain(sharedCss)
    for (const token of keyTokens) expect(style).toContain('var(' + token + ')')
    // 去掉共享来源本身，剩下的浮层布局也不许再手写一份取值。
    expect(literalValues(style.replace(sharedCss, ''))).toEqual([])
  })

  it('浮层自己的布局文件同样只引用 token', () => {
    expect(literalValues(overlayCss)).toEqual([])
  })
})

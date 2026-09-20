import { describe, expect, it } from 'vitest'
import overlayCss from '../overlay.css?raw'
import panelCss from '../panel.css?raw'
import sharedCss from '../shell-style.css?raw'
import { mountOverlay, OVERLAY_HOST_ID } from '../overlay'

/**
 * 两套外壳共用同一份样式来源（#18、#23、ADR-0005）。
 *
 * 断言的是外部行为：共享来源里每个 token 只有一个定义、取值就是暖白外壳的那些；两壳都不许
 * 再手写配色、字号与间距，只许引用 token；浮层注入 shadow DOM 的样式来自同一份来源。
 * 不比对样式文本长相，也不比对 HTML 结构。
 */

/**
 * 取值是独立的事实来源：共享来源一旦换色，这里的字面量必须跟着改，说明它确实被引用了。
 * token 与字面量一一对应，任何取值都藏不进共享文件里游而不被钉住。
 *
 * 这些是 ADR-0005〈视觉方向〉定的暖白外壳取值，与浮层、侧边栏同时生效：
 * 底 #fbf8f3、纸面 #fff、气泡 #f2ece3、分隔线 #e7ded1、正文 #2b2622。
 */
const values = {
  '--ca-bg': '#fbf8f3',
  '--ca-surface': '#fff',
  '--ca-surface-raised': '#f2ece3',
  '--ca-line': '#e7ded1',
  '--ca-line-strong': '#8f7f66',
  '--ca-line-control': '#7f6d55',
  '--ca-line-soft': '#ede4d7',
  '--ca-ink': '#2b2622',
  '--ca-ink-body': '#4a423a',
  '--ca-ink-muted': '#6b6156',
  '--ca-accent': '#b0632c',
  '--ca-accent-ink': '#8f4a1e',
  '--ca-danger': '#a03a24',
  '--ca-identity-surface': '#f3e2d0',
  '--ca-identity-line': '#ab9058',
  '--ca-identity-ink': '#7b4320',
  '--ca-shadow': '0 8px 22px rgba(80, 60, 40, .16)',
  '--ca-font-family': 'system-ui, sans-serif',
  '--ca-font-heading': 'Georgia, "Songti SC", serif',
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
  const handle = mountOverlay(document, {
    onPin: async () => true, onToggleCollapsed: () => {}, onMove: () => {}, readConversation: () => null,
  }, { x: 0, y: 0 })
  expect(handle).not.toBeNull()
  const host = document.getElementById(OVERLAY_HOST_ID)
  return host!.shadowRoot!.querySelector('style')!.textContent!
}

/**
 * 取出某个选择器命中的全部规则内容，用来检查「这类元素拿到了哪一类取值」。
 *
 * 按选择器整条匹配（逗号分隔后逐个比对），不是子串包含；同一个选择器可能分在几条规则里
 * （标题的字体与颜色就是两条），所以合并全部命中，而不是只看先出现的那一条。
 */
const ruleBody = (css: string, selector: string): string => {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => match[1]!.split(',').map((part) => part.trim()).includes(selector))
    .map((match) => match[2]!)
    .join('\n')
}

describe('共享样式来源', () => {
  it('每个 token 只有一份定义，取值就是暖白外壳的那些', () => {
    for (const [token, value] of Object.entries(values)) expect(declared(sharedCss, token)).toEqual([value])
    // 反向也要成立：共享文件里不许有集合之外、因此没被钉住的取值。
    expect(declaredTokens(sharedCss).sort()).toEqual(Object.keys(values).sort())
    // 一份来源同时服务文档与 shadow 宿主：两个选择器写在同一个规则块里。
    expect(sharedCss).toMatch(/:root\s*,\s*:host\s*\{/)
    expect(literalValues(sharedCss).filter((literal) => !literal.startsWith('0 '))).toEqual([])
  })

  /**
   * 强调色分两个（ADR-0005）：#b0632c 压在暖白底上只有 4.25:1，只够做色块、圆点与描边；
   * 小字要更深的 #8f4a1e。这一条抓的正是「小字误用了浅的那个」——那种错不会让别的测试变红。
   */
  it('小字用深的那个强调色，浅的只做色块与描边', () => {
    for (const selector of ['.panel-bubble-section h3', '.panel-analysis-view h3', '.panel-source-types h4']) {
      expect(ruleBody(sharedCss, selector)).toContain('var(--ca-accent-ink)')
    }
    // 引用标号与来源清单序号是同一组数字，用同一个颜色。
    for (const selector of ['.panel-source-list b', '.panel-citation-marker']) {
      expect(ruleBody(sharedCss, selector)).toContain('var(--ca-accent-ink)')
    }
    // 任何落成文字颜色的 --ca-accent 都会把小字压到标准以下：文字一律走 accent-ink。
    expect([...sharedCss.matchAll(/(?<![\w-])color\s*:\s*var\(--ca-accent\)/g)]).toEqual([])
    // 浅的那个仍要留在图形上：趋势线的描边与圆点（色块、圆点那一类用法）。
    expect(ruleBody(sharedCss, '.keyword-trend polyline')).toContain('var(--ca-accent)')
    expect(ruleBody(sharedCss, '.keyword-trend circle')).toContain('var(--ca-accent)')
  })

  /** 标题衬线、正文无衬线（ADR-0005）。标题字体只此一处，两壳的标题都落回它。 */
  it('标题走衬线体，正文保持无衬线', () => {
    const titled = [
      '.panel-head h1', '.panel-analysis-head h2', '.panel-drawer-partition h2',
      '.panel-record-head h2', '.panel-bubble-section h3', '.panel-analysis-view h3',
      '.panel-source-types h4', '.ca-asin',
    ]
    for (const selector of titled) {
      expect(ruleBody(sharedCss, selector)).toContain('font-family: var(--ca-font-heading)')
    }
    expect(values['--ca-font-heading']).toMatch(/serif/)
    // 正文与数字仍是那套无衬线字体，浮层与侧边栏各自在根上设一次。
    expect(values['--ca-font-family']).toMatch(/sans-serif/)
    expect(panelCss).toContain('var(--ca-font-family)')
    expect(overlayCss).toContain('var(--ca-font-family)')
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

  /**
   * 抽屉默认收起、回答区默认空着，靠的都是 hidden 属性。两壳的布局都声明了
   * display: flex/grid，作者样式里的 display 会盖掉浏览器给 [hidden] 的默认
   * display: none——少这条兜底，抽屉就会「收不起来」，内容一直占着第一屏。
   */
  it('两壳都把 hidden 属性还原成真的不显示', () => {
    const neutralizesHidden = (css: string): boolean => {
      const rule = /\[hidden\]\s*\{[^}]*\}/.exec(css)?.[0] ?? ''
      return /display\s*:\s*none\s*!important/.test(rule)
    }
    expect(neutralizesHidden(sharedCss)).toBe(true)
    // 侧边栏从共享来源引入，浮层把同一份文本内联进 shadow DOM，两处都拿到这条规则。
    expect(neutralizesHidden(mountedStyle())).toBe(true)
    expect(panelCss).toContain('shell-style.css')
  })
})

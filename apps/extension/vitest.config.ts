import { defineConfig } from 'vitest/config'

/**
 * 搜索结果卡片的解析用 DOMParser 读取真实嵌套结构（HTML 的正则切片会在第一个
 * 嵌套结束标签处截断），因此测试需要一个 DOM 环境。
 * 其余模块仍然只依赖标准 Web API，在 happy-dom 下同样能跑。
 */
export default defineConfig({
  test: {
    environment: 'happy-dom',
    // 样式共享层要求测试能读到 CSS 文本本身（浮层把同一份文本内联进 shadow DOM），
    // 默认的 css: false 会把 CSS 导入替换成空串，读不到内容。
    css: true,
    include: ['src/**/*.test.ts', 'entrypoints/**/*.test.ts'],
  },
})

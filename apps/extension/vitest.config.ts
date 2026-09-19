import { defineConfig } from 'vitest/config'

/**
 * 搜索结果卡片的解析用 DOMParser 读取真实嵌套结构（HTML 的正则切片会在第一个
 * 嵌套结束标签处截断），因此测试需要一个 DOM 环境。
 * 其余模块仍然只依赖标准 Web API，在 happy-dom 下同样能跑。
 */
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'entrypoints/**/*.test.ts'],
  },
})

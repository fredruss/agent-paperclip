import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['app/**', 'node_modules/**'],
    environment: 'node'
  }
})

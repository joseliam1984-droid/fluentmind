import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// Los servicios imprimen trazas con console.log; se silencian en los tests.
vi.spyOn(console, 'log').mockImplementation(() => {})

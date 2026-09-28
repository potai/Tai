import { describe, expect, it } from 'vitest'
import { formatSpeed, SPEED_MAX, SPEED_MIN, stepSpeed } from './settings'

describe('stepSpeed', () => {
  it('changes by about 10% so low speeds can be fine-tuned', () => {
    expect(stepSpeed(1, 1)).toBe(1.1)
    expect(stepSpeed(2, -1)).toBe(1.8)
    expect(stepSpeed(10, 1)).toBe(11)
  })

  it('always moves at least one tenth', () => {
    expect(stepSpeed(0.5, 1)).toBe(0.6)
    expect(stepSpeed(0.6, -1)).toBe(0.5)
  })

  it('stays within range and round-trips reasonably', () => {
    expect(stepSpeed(SPEED_MIN, -1)).toBe(SPEED_MIN)
    expect(stepSpeed(SPEED_MAX, 1)).toBe(SPEED_MAX)
    let s = 6
    for (let i = 0; i < 5; i++) s = stepSpeed(s, 1)
    for (let i = 0; i < 5; i++) s = stepSpeed(s, -1)
    expect(Math.abs(s - 6)).toBeLessThanOrEqual(0.2)
  })
})

describe('formatSpeed', () => {
  it('hides the decimal for whole numbers', () => {
    expect(formatSpeed(6)).toBe('6')
    expect(formatSpeed(6.6)).toBe('6.6')
  })
})

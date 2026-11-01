import { describe, expect, it } from 'vitest'
import { MAX_NAME_LENGTH, nameProblem } from '../src/lib/profile'

describe('names', () => {
  it('accepts a normal name, with or without stray spaces', () => {
    expect(nameProblem('Sam')).toBeNull()
    expect(nameProblem('  Sam  ')).toBeNull()
  })

  it('requires a name', () => {
    expect(nameProblem('')).toMatch(/Add your name/)
    expect(nameProblem('   ')).toMatch(/Add your name/)
  })

  it('limits the length', () => {
    expect(nameProblem('a'.repeat(MAX_NAME_LENGTH))).toBeNull()
    expect(nameProblem('a'.repeat(MAX_NAME_LENGTH + 1))).toMatch(/40 characters/)
  })
})

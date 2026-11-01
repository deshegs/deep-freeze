import { describe, expect, it } from 'vitest'
import { cleanCode, cleanEmail, friendlyAuthError, isValidCode, isValidEmail } from '../src/lib/auth'
import { findConfigProblem } from '../src/lib/supabase'

describe('sign-in input', () => {
  it('tidies emails before sending them', () => {
    expect(cleanEmail('  Sam@Example.COM ')).toBe('sam@example.com')
  })

  it('accepts real addresses and rejects incomplete ones', () => {
    expect(isValidEmail('sam@example.com')).toBe(true)
    expect(isValidEmail('sam@example')).toBe(false)
    expect(isValidEmail('sam')).toBe(false)
  })

  it('keeps only digits from a pasted code', () => {
    expect(cleanCode(' 123 456 ')).toBe('123456')
  })

  it('checks code length', () => {
    expect(isValidCode('12345')).toBe(false)
    expect(isValidCode('123456')).toBe(true)
  })

  it('explains rate limits in plain language', () => {
    expect(friendlyAuthError('email rate limit exceeded')).toMatch(/Wait a minute/)
  })
})

describe('config check', () => {
  it('reports missing settings', () => {
    expect(findConfigProblem(undefined, undefined)).toMatch(/not connected/)
  })

  it('refuses a secret key', () => {
    expect(findConfigProblem('https://x.supabase.co', 'sb_secret_abc')).toMatch(/secret key/)
  })

  it('accepts a publishable key', () => {
    expect(findConfigProblem('https://x.supabase.co', 'sb_publishable_abc')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import {
  inviteLink,
  isInviteUsable,
  parseInviteCode,
  pickActiveHousehold,
  type Household,
  type Invite,
} from '../src/lib/households'

const now = new Date('2026-06-01T12:00:00Z')

const invite: Invite = {
  id: '1',
  code: 'abc',
  expires_at: '2026-06-02T12:00:00Z',
  max_uses: 5,
  use_count: 1,
  revoked_at: null,
}

const home: Household = { id: 'home', name: 'Home', role: 'owner' }
const cottage: Household = { id: 'cottage', name: 'Cottage', role: 'member' }

describe('invite codes', () => {
  it('accepts a bare code', () => {
    expect(parseInviteCode('  ABC123 ')).toBe('abc123')
  })

  it('accepts a whole link', () => {
    expect(parseInviteCode('https://example.com/join/abc123?x=1')).toBe('abc123')
  })

  it('builds a link from the current address', () => {
    const link = inviteLink('abc123', 'https://example.com')
    expect(link).toBe('https://example.com/join/abc123')
    expect(parseInviteCode(link)).toBe('abc123')
  })
})

describe('invite status', () => {
  it('accepts a live invite', () => {
    expect(isInviteUsable(invite, now)).toBe(true)
  })

  it('rejects revoked, expired and used-up invites', () => {
    expect(isInviteUsable({ ...invite, revoked_at: '2026-06-01T00:00:00Z' }, now)).toBe(false)
    expect(isInviteUsable({ ...invite, expires_at: '2026-06-01T11:00:00Z' }, now)).toBe(false)
    expect(isInviteUsable({ ...invite, use_count: 5 }, now)).toBe(false)
  })
})

describe('active household', () => {
  it('remembers the last-used household', () => {
    expect(pickActiveHousehold([home, cottage], 'cottage')).toBe('cottage')
  })

  it('falls back to the first when the last-used one is gone', () => {
    expect(pickActiveHousehold([home, cottage], 'old')).toBe('home')
    expect(pickActiveHousehold([home, cottage], null)).toBe('home')
  })

  it('finds nothing when there are no households', () => {
    expect(pickActiveHousehold([], 'old')).toBeNull()
  })
})

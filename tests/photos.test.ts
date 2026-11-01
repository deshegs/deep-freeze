import { describe, expect, it } from 'vitest'
import { fitWidth, newId, photoPath } from '../src/lib/photos'

describe('photo size', () => {
  it('shrinks wide photos and keeps their shape', () => {
    expect(fitWidth(4000, 3000, 1000)).toEqual({ width: 1000, height: 750 })
    expect(fitWidth(3000, 4000, 1000)).toEqual({ width: 1000, height: 1333 })
  })

  it('never enlarges a small photo', () => {
    expect(fitWidth(800, 600, 1000)).toEqual({ width: 800, height: 600 })
  })
})

describe('photo paths', () => {
  it('start with the household, which the storage rules depend on', () => {
    expect(photoPath('home', 'peas')).toBe('home/peas.jpg')
  })
})

describe('item ids', () => {
  it('look like the ids the database expects', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

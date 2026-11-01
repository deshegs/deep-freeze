// Things you might want to change. Server-enforced limits live in the
// app_limits table instead (see the README).

export const USE_SOON_DAYS = 90
export const OUT_UNDO_MS = 4000
export const PHOTO_WIDTH = 1000
export const PHOTO_QUALITY = 0.75

export const CATEGORIES = [
  { name: 'Meat', emoji: '🥩', color: '#EBCBC2' },
  { name: 'Fish', emoji: '🐟', color: '#C8DFEA' },
  { name: 'Veg & fruit', emoji: '🥦', color: '#D0E5C6' },
  { name: 'Meals', emoji: '🍲', color: '#EDDBBA' },
  { name: 'Bakery', emoji: '🍞', color: '#F0E2C8' },
  { name: 'Other', emoji: '🧊', color: '#DAE0E5' },
]

export const LOCATIONS = ['Top basket', 'Left side', 'Right side', 'Bottom', 'Back corner']

// Items keep working if a category is later renamed or removed from the list.
export function categoryOf(name: string | null) {
  return CATEGORIES.find((category) => category.name === name) ?? CATEGORIES[CATEGORIES.length - 1]
}

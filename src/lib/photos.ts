import { useEffect, useState } from 'react'
import { PHOTO_QUALITY, PHOTO_WIDTH } from '../config'
import { failure } from './households'
import { supabase } from './supabase'

const BUCKET = 'item-photos'
const LINK_SECONDS = 60 * 60
const REFRESH_MARGIN_MS = 5 * 60 * 1000

// A new photo for an item, an instruction to remove the current one, or no change.
export type PhotoChange = Blob | 'remove' | null

type CachedLink = { url: string; expires: number }
const links = new Map<string, CachedLink>()

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  // randomUUID only exists on https and localhost, not a phone testing over Wi-Fi.
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (digit) =>
    (Number(digit) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(digit) / 4)))).toString(16),
  )
}

export function photoPath(householdId: string, itemId: string) {
  return `${householdId}/${itemId}.jpg`
}

// Shrinks to fit, and never enlarges a small photo.
export function fitWidth(width: number, height: number, maxWidth: number) {
  if (width <= maxWidth) return { width, height }
  return { width: maxWidth, height: Math.round((height * maxWidth) / width) }
}

function loadImage(file: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("That photo couldn't be opened. Try a different one."))
    }
    image.src = url
  })
}

export async function resizePhoto(file: Blob) {
  const image = await loadImage(file)
  const size = fitWidth(image.naturalWidth, image.naturalHeight, PHOTO_WIDTH)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  canvas.getContext('2d')?.drawImage(image, 0, 0, size.width, size.height)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("That photo couldn't be prepared. Try a different one."))),
      'image/jpeg',
      PHOTO_QUALITY,
    )
  })
}

function remember(path: string, url: string, lifetimeMs: number) {
  links.set(path, { url, expires: Date.now() + lifetimeMs })
}

export async function uploadPhoto(path: string, photo: Blob) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, photo, { upsert: true, contentType: 'image/jpeg' })
  if (error) throw failure(error)
  // Shows the new photo straight away, even when it replaces one at the same path.
  remember(path, URL.createObjectURL(photo), LINK_SECONDS * 1000)
}

export async function removePhoto(path: string) {
  links.delete(path)
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw failure(error)
}

function cachedLink(path: string) {
  const link = links.get(path)
  return link && link.expires - REFRESH_MARGIN_MS > Date.now() ? link.url : null
}

// Fetches many links in one request, so a full freezer doesn't make one per tile.
export async function preloadPhotos(paths: string[]) {
  const missing = paths.filter((path) => !cachedLink(path))
  if (!missing.length) return
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(missing, LINK_SECONDS)
  data?.forEach((link) => {
    if (link.path && link.signedUrl) remember(link.path, link.signedUrl, LINK_SECONDS * 1000)
  })
}

export function usePhotoUrl(path: string | null) {
  const [, setLoaded] = useState(0)

  useEffect(() => {
    if (!path || cachedLink(path)) return
    let current = true
    preloadPhotos([path]).then(() => {
      if (current) setLoaded((count) => count + 1)
    })
    return () => {
      current = false
    }
  }, [path])

  return path ? cachedLink(path) : null
}

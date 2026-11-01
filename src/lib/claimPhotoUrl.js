import { supabase } from './supabase'

// Thumbnail-sized render for claim cards in the approval queues. Falls back
// to the full image automatically via the caller's onError handler if image
// transforms aren't available on this Supabase project's plan.
export function claimPhotoThumbUrl(path) {
  if (!path) return null
  return supabase.storage.from('claim-photos').getPublicUrl(path, {
    transform: { width: 160, height: 160, resize: 'cover', quality: 65 }
  }).data.publicUrl
}

export function claimPhotoFullUrl(path) {
  if (!path) return null
  return supabase.storage.from('claim-photos').getPublicUrl(path).data.publicUrl
}

import { supabase } from './supabase'

// Thumbnail-sized render for small avatar-style displays. Falls back to the
// full image automatically via the caller's onError handler if image
// transforms aren't available on this Supabase project's plan.
export function selfieThumbUrl(path) {
  if (!path) return null
  return supabase.storage.from('selfies').getPublicUrl(path, {
    transform: { width: 64, height: 64, resize: 'cover', quality: 60 }
  }).data.publicUrl
}

export function selfieFullUrl(path) {
  if (!path) return null
  return supabase.storage.from('selfies').getPublicUrl(path).data.publicUrl
}

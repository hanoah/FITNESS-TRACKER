import { ref, onMounted } from 'vue'
import { db } from '../lib/db'
import type { UserProfile } from '../lib/db'

export function useUserProfile() {
  const profile = ref<UserProfile | null>(null)

  onMounted(async () => {
    const p = await db.userProfile.get('current')
    profile.value = p ?? null
  })

  return { profile }
}

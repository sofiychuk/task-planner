import { onBeforeUnmount } from 'vue'

/** Async operations may finish, but an obsolete view must not react to them. */
export function useActiveView() {
  let active = true
  onBeforeUnmount(() => { active = false })
  return () => active
}

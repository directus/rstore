export function useCache() {
  const store = useStore()
  return computed(() => store.$cache.getState())
}

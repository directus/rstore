export function useCache() {
  const store = useStore()
  // @ts-expect-error private fields
  return computed(() => store.$cache._private.state.value)
}

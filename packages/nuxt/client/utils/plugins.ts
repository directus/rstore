export const useStorePlugins = createSharedComposable(() => {
  const store = useNonNullRstore()

  function getPlugins() {
    return store.value.$plugins
  }

  const plugins = shallowRef(getPlugins())

  // @TODO handle adding plugins afterwards

  return plugins
})

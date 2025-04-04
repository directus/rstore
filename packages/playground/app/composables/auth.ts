export const useAuth = defineRstoreModule(() => {
  const store = useStore()

  const { state, resolve, onResolve, defineMutation } = createRstoreModule(store, {
    name: 'auth',
    state: {
      currentUserKey: null as string | null,
    },
  })

  const currentUser = store.User.queryFirst(() => state.currentUserKey
    ? {
        key: state.currentUserKey,
      }
    : {
        enabled: false,
      })

  const requestFetch = useRequestFetch()

  async function initCurrentUser() {
    try {
      const user = await requestFetch('/api/auth/me')
      if (user) {
        state.currentUserKey = user.id
        store.User.writeItem({
          ...user,
          createdAt: new Date(user.createdAt),
        })
      }
      else {
        state.currentUserKey = null
      }
    }
    catch (e) {
      console.error('Failed to init current user', e)
    }
  }

  const login = defineMutation(async (email: string, password: string) => {
    const result = await $fetch('/api/auth/login', {
      method: 'POST',
      body: {
        email,
        password,
      },
    })
    state.currentUserKey = result.userId
  })

  const logout = defineMutation(async () => {
    await $fetch('/api/auth/logout', {
      method: 'POST',
    })
    state.currentUserKey = null
  })

  onResolve(async () => {
    await initCurrentUser()
  })

  return resolve({
    currentUser,
    login,
    logout,
    loggedIn: computed(() => !!state.currentUserKey),
  })
})

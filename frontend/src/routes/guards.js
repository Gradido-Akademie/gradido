import { activeModules, verifyLogin } from '../graphql/queries'

// Asks the server which modules this instance offers and remembers the answer.
// Kept in the store so the menu can read it synchronously, but always refreshed here
// rather than trusted: the store is persisted to localStorage, so its copy survives a
// browser restart and would otherwise still claim a module exists long after an admin
// switched it off.
// Returns what the server said rather than only writing it to the store, so a caller
// decides on the answer it just received. Reading the store back instead would decide on
// whatever happened to be stored - a different value whenever the commit has not landed
// yet, which is precisely the case this guard exists for.
const refreshActiveModules = async (store, apollo) => {
  try {
    const result = await apollo.query({ query: activeModules, fetchPolicy: 'network-only' })
    const matchingActive = Boolean(result.data?.activeModules?.matchingActive)
    store.commit('matchingActive', matchingActive)
    return matchingActive
  } catch {
    // No answer is not an answer: keep the last known state rather than inventing one, so
    // a working session survives a blip. Nothing is unlocked by being wrong here - the
    // backend withdraws the module's rights either way, and this is only the menu and
    // the address bar.
    return Boolean(store.state.matchingActive)
  }
}

const addNavigationGuards = (router, store, apollo) => {
  // handle publisherId
  router.beforeEach((to, from, next) => {
    const publisherId = to.query.pid
    if (publisherId) {
      store.commit('publisherId', publisherId)
      delete to.query.pid
    }
    next()
  })

  // store token on authenticate
  router.beforeEach(async (to, from, next) => {
    if (to.path === '/authenticate' && to.query.token) {
      store.commit('token', to.query.token)
      await apollo
        .query({
          query: verifyLogin,
          fetchPolicy: 'network-only',
        })
        .then(async (result) => {
          store.dispatch('login', result.data.verifyLogin)
          await refreshActiveModules(store, apollo)
          next({ path: '/overview' })
        })
        .catch(() => {
          store.dispatch('logout')
          next()
        })
    } else {
      next()
    }
  })

  // handle authentication
  router.beforeEach((to, from, next) => {
    if (to.meta.requiresAuth && !store.state.token) {
      // store redirect path
      store.commit('redirectPath', to.path)
      next({ path: '/login' })
    } else {
      next()
    }
  })

  // A page that belongs to an optional module is only opened while that module is on.
  // Asked freshly on every such navigation rather than read from the store, so an
  // address typed into the bar cannot outrun a switch that was flipped meanwhile.
  // This is a convenience, not the boundary: the backend withdraws the module's rights,
  // so the page would have nothing to show even if someone got past here.
  router.beforeEach(async (to, from, next) => {
    if (to.meta.requiresModule !== 'matching' || !store.state.token) {
      next()
      return
    }
    const matchingActive = await refreshActiveModules(store, apollo)
    next(matchingActive ? undefined : { path: '/overview' })
  })
}

export default addNavigationGuards

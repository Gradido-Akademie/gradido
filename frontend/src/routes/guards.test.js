import { describe, it, expect, beforeEach, vi } from 'vitest'
import addNavigationGuards from './guards'
import { createRouter, createWebHistory } from 'vue-router'
import { activeModules, verifyLogin } from '../graphql/queries'

vi.mock('../graphql/queries', () => ({
  verifyLogin: 'mocked-verify-login-query',
  activeModules: 'mocked-active-modules-query',
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/authenticate', name: 'Authenticate' },
    { path: '/overview', name: 'Overview' },
    { path: '/login', name: 'Login' },
    { path: '/register', name: 'Register' },
    { path: '/forgot-password', name: 'ForgotPassword' },
    { path: '/protected', name: 'Protected', meta: { requiresAuth: true } },
    {
      path: '/matching',
      name: 'Matching',
      meta: { requiresAuth: true, requiresModule: 'matching' },
    },
  ],
})

const storeCommitMock = vi.fn()
const storeDispatchMock = vi.fn()
let matchingIsActive = true

const apolloQueryMock = vi.fn().mockImplementation(({ query }) => {
  if (query === activeModules) {
    return Promise.resolve({ data: { activeModules: { matchingActive: matchingIsActive } } })
  }
  return Promise.resolve({ data: { verifyLogin: { firstName: 'Peter' } } })
})

const store = {
  commit: storeCommitMock,
  state: {
    token: null,
    matchingActive: false,
  },
  dispatch: storeDispatchMock,
}

const apollo = {
  query: apolloQueryMock,
}

const addedGuards = []
const originalBeforeEach = router.beforeEach.bind(router)
router.beforeEach = (guard) => {
  addedGuards.push(guard)
  return originalBeforeEach(guard)
}

addNavigationGuards(router, store, apollo)

describe('navigation guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.state.token = null
    store.state.matchingActive = false
    matchingIsActive = true
  })

  describe('publisher ID', () => {
    it('commits the pid to the store when present', async () => {
      await router.push({ path: '/register', query: { pid: '42' } })
      expect(storeCommitMock).toHaveBeenCalledWith('publisherId', '42')
    })

    it('does not commit the pid when not present', async () => {
      await router.push({ path: '/forgot-password' })
      expect(storeCommitMock).not.toHaveBeenCalledWith('publisherId', expect.anything())
    })
  })

  describe('authenticate', () => {
    it('handles valid token correctly', async () => {
      await router.push({ path: '/authenticate', query: { token: 'valid-token' } })

      expect(storeCommitMock).toHaveBeenCalledWith('token', 'valid-token')
      expect(apolloQueryMock).toHaveBeenCalledWith({
        query: verifyLogin,
        fetchPolicy: 'network-only',
      })
      expect(storeDispatchMock).toHaveBeenCalledWith('login', { firstName: 'Peter' })
      expect(router.currentRoute.value.path).toBe('/overview')
    })

    it('handles server error correctly', async () => {
      apolloQueryMock.mockRejectedValueOnce(new Error('Server error'))

      await router.push({ path: '/authenticate', query: { token: 'invalid-token' } })

      expect(storeCommitMock).toHaveBeenCalledWith('token', 'invalid-token')
      expect(apolloQueryMock).toHaveBeenCalled()
      expect(storeDispatchMock).toHaveBeenCalledWith('logout')
      expect(router.currentRoute.value.path).toBe('/authenticate')
    })
  })

  describe('authorization', () => {
    it('redirects to login when not authorized', async () => {
      const to = { path: '/protected', meta: { requiresAuth: true } }
      const from = {}
      let nextCalled = false
      let nextArg = null

      const next = (arg) => {
        nextCalled = true
        nextArg = arg
      }

      const authGuard = addedGuards.find(
        (guard) =>
          guard.toString().includes('requiresAuth') && guard.toString().includes('redirectPath'),
      )

      await authGuard(to, from, next)

      expect(nextCalled).toBe(true)
      expect(nextArg).toEqual({ path: '/login' })
      expect(storeCommitMock).toHaveBeenCalledWith('redirectPath', '/protected')
    })

    it('does not redirect to login when authorized', async () => {
      store.state.token = 'valid-token'

      const to = { path: '/protected', meta: { requiresAuth: true } }
      const from = {}
      let nextCalled = false
      let nextArg = null

      const next = (arg) => {
        nextCalled = true
        nextArg = arg
      }

      const authGuard = addedGuards.find(
        (guard) =>
          guard.toString().includes('requiresAuth') && guard.toString().includes('redirectPath'),
      )

      await authGuard(to, from, next)

      expect(nextCalled).toBe(true)
      expect(nextArg).toBeUndefined()
    })
  })

  describe('a page that belongs to an optional module', () => {
    beforeEach(async () => {
      // Park on a page that belongs to no module. Pushing to the route a test is about
      // while already standing on it is a no-op, and no guard would run at all.
      await router.push({ path: '/register' })
      vi.clearAllMocks()
      store.state.token = 'a-token'
    })

    it('opens it while the module is on, and remembers the answer', async () => {
      matchingIsActive = true

      await router.push({ path: '/matching' })

      expect(apolloQueryMock).toHaveBeenCalledWith({
        query: activeModules,
        fetchPolicy: 'network-only',
      })
      expect(storeCommitMock).toHaveBeenCalledWith('matchingActive', true)
      expect(router.currentRoute.value.path).toBe('/matching')
    })

    it('sends it away while the module is off', async () => {
      matchingIsActive = false
      store.state.matchingActive = false

      await router.push({ path: '/matching' })

      expect(storeCommitMock).toHaveBeenCalledWith('matchingActive', false)
      expect(router.currentRoute.value.path).toBe('/overview')
    })

    // Asked every time rather than read from the store: the store is persisted to
    // localStorage, so its copy outlives the browser and a switch flipped meanwhile
    // would otherwise go unnoticed until the next login.
    it('asks the server again even when the store already says yes', async () => {
      matchingIsActive = false
      store.state.matchingActive = true

      await router.push({ path: '/matching' })

      expect(apolloQueryMock).toHaveBeenCalledWith({
        query: activeModules,
        fetchPolicy: 'network-only',
      })
      expect(router.currentRoute.value.path).toBe('/overview')
    })

    it('leaves pages that belong to no module alone', async () => {
      await router.push({ path: '/protected' })

      expect(apolloQueryMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ query: activeModules }),
      )
    })
  })
})

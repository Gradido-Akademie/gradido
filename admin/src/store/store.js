import { createStore } from 'vuex'
import createPersistedState from 'vuex-persistedstate'
import CONFIG from '../config'

export const mutations = {
  openCreationsPlus: (state, i) => {
    state.openCreations += i
  },
  openCreationsMinus: (state, i) => {
    state.openCreations -= i
  },
  resetOpenCreations: (state) => {
    state.openCreations = 0
  },
  token: (state, token) => {
    state.token = token
  },
  setOpenCreations: (state, openCreations) => {
    state.openCreations = openCreations
  },
  moderator: (state, moderator) => {
    state.moderator = moderator
  },
}

export const actions = {
  logout: ({ commit, state }) => {
    commit('token', null)
    commit('moderator', null)
    // Preserve the moderator's Crea signature across logout (E-014: browser-only,
    // no DB field) — a full clear() would otherwise wipe it on every logout.
    const creaSignature = window.localStorage.getItem('crea.moderatorSignature')
    window.localStorage.clear()
    if (creaSignature !== null) {
      window.localStorage.setItem('crea.moderatorSignature', creaSignature)
    }
  },
}

const store = createStore({
  plugins: [
    createPersistedState({
      key: 'gradido-admin',
      storage: window.localStorage,
    }),
  ],
  state: {
    token: CONFIG.DEBUG_DISABLE_AUTH ? 'validToken' : null,
    moderator: null,
    openCreations: 0,
    userSelectedInMassCreation: [],
  },
  // Syncronous mutation of the state
  mutations,
  actions,
})

export default store

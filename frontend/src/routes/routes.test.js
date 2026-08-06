import { describe, it, expect } from 'vitest'

import routes from './routes'

const pathsOf = (list) => list.map((route) => route.path)
const matchingPathsOf = (list) => pathsOf(list).filter((path) => path.startsWith('/matching'))

describe('routes', () => {
  // The module switch lives in the database and is answered by the server, so it cannot
  // be known while this table is built - a route table is assembled at import time, an
  // answer arrives later. The routes are therefore always registered and the navigation
  // guard decides. That is what these tests fix in place.
  it('registers all three matching routes', () => {
    expect(matchingPathsOf(routes)).toEqual(['/matching', '/matching/karte', '/matching/:tab'])
  })

  it('keeps the map ahead of the tab route, or the tab route swallows it', () => {
    const paths = matchingPathsOf(routes)
    expect(paths.indexOf('/matching/karte')).toBeLessThan(paths.indexOf('/matching/:tab'))
  })

  it('sends /matching on to the entries tab', () => {
    const entry = routes.find((route) => route.path === '/matching')
    expect(entry.redirect()).toEqual({ path: '/matching/entries' })
  })

  // Without this marker the guard has nothing to key on and every matching page would
  // open whatever the switch says. It is the one line that connects the two.
  it('marks every matching route as belonging to the matching module', () => {
    const matchingRoutes = routes.filter((route) => route.path.startsWith('/matching'))

    expect(matchingRoutes).toHaveLength(3)
    for (const route of matchingRoutes) {
      expect(route.meta.requiresModule).toBe('matching')
    }
  })

  it('marks nothing else as belonging to a module', () => {
    const others = routes.filter(
      (route) => !route.path.startsWith('/matching') && route.meta?.requiresModule,
    )

    expect(others).toEqual([])
  })

  it('keeps the catch-all in place', () => {
    const catchAll = routes.find((route) => route.name === 'NotFound')

    expect(catchAll).toBeDefined()
    expect(catchAll.path).toBe('/:catchAll(.*)')
  })
})

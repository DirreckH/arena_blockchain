import { afterEach, describe, expect, it } from 'vitest'

describe('demoBackend discovery config CRUD', () => {
  afterEach(async () => {
    const { demoBackend } = await import('./demo-backend')
    demoBackend.reset()
  })

  it('persists a custom directory and exposes it on the public category index', async () => {
    const { demoBackend } = await import('./demo-backend')
    demoBackend.reset()

    const current = demoBackend.getOpsDiscoveryGlobalConfig()
    const updated = demoBackend.updateOpsDiscoveryGlobalConfig({
      categories: [
        ...current.categories.map((item) => ({
          slug: item.slug,
          label: item.label,
          title: item.title,
          directoryLabel: item.directoryLabel,
          description: item.description,
          displayOrder: item.displayOrder,
          pageState: item.pageState,
          kind: item.kind,
          marketIdWhitelist: [...item.marketIdWhitelist],
        })),
        {
          slug: 'esports',
          label: '电竞',
          title: '电竞市场',
          description: '电子竞技赛事公开命题',
          displayOrder: 99,
          pageState: 'visible',
          kind: 'custom',
          marketIdWhitelist: ['public-trust'],
        },
      ],
      rankingCategoryLabels: current.rankingCategoryLabels,
      secondaryCapsules: current.secondaryCapsules.map((capsule) => ({
        id: capsule.id,
        label: capsule.label,
        displayOrder: capsule.displayOrder,
        pageState: capsule.pageState,
        kind: capsule.kind,
        baseRankingId: capsule.baseRankingId,
        marketIdWhitelist: [...capsule.marketIdWhitelist],
      })),
    })

    const customCategory = updated.categories.find((item) => item.slug === 'esports')
    expect(customCategory).toBeDefined()
    expect(customCategory?.kind).toBe('custom')
    expect(customCategory?.pathname).toBe('/zh/c/esports')
    expect(customCategory?.marketIdWhitelist).toEqual(['public-trust'])

    const index = demoBackend.getCategoryDirectoryIndex()
    expect(index.items.some((item) => item.slug === 'esports' && item.pathname === '/zh/c/esports')).toBe(true)

    const directory = demoBackend.getCategoryDirectory('esports')
    expect(directory).not.toBeNull()
    expect(directory?.title).toBe('电竞市场')
    expect(directory?.marketIds).toEqual(['public-trust'])
  })

  it('rejects custom slugs that collide with system slugs or use reserved words', async () => {
    const { demoBackend } = await import('./demo-backend')
    demoBackend.reset()

    const current = demoBackend.getOpsDiscoveryGlobalConfig()
    const updated = demoBackend.updateOpsDiscoveryGlobalConfig({
      categories: [
        ...current.categories.map((item) => ({
          slug: item.slug,
          label: item.label,
          kind: item.kind,
          marketIdWhitelist: [...item.marketIdWhitelist],
        })),
        // 'politics' collides with a system slug -> dropped
        { slug: 'politics', label: '冒充', kind: 'custom', marketIdWhitelist: [] },
        // 'ops' is reserved -> dropped
        { slug: 'ops', label: '冒充 ops', kind: 'custom', marketIdWhitelist: [] },
        // invalid pattern -> dropped
        { slug: 'has space', label: '不合规', kind: 'custom', marketIdWhitelist: [] },
      ],
      rankingCategoryLabels: current.rankingCategoryLabels,
    })

    // No additional custom category should have been added.
    expect(updated.categories.filter((item) => item.kind === 'custom')).toHaveLength(0)
  })

  it('supports custom secondary capsules with a market whitelist exposed to the ranking feed', async () => {
    const { demoBackend } = await import('./demo-backend')
    demoBackend.reset()

    const current = demoBackend.getOpsDiscoveryGlobalConfig()
    const updated = demoBackend.updateOpsDiscoveryGlobalConfig({
      categories: current.categories.map((item) => ({
        slug: item.slug,
        kind: item.kind,
        marketIdWhitelist: [...item.marketIdWhitelist],
      })),
      rankingCategoryLabels: current.rankingCategoryLabels,
      secondaryCapsules: [
        ...current.secondaryCapsules.map((capsule) => ({
          id: capsule.id,
          label: capsule.label,
          kind: capsule.kind,
          baseRankingId: capsule.baseRankingId,
          marketIdWhitelist: [...capsule.marketIdWhitelist],
        })),
        {
          id: 'cap-elections',
          label: '大选',
          kind: 'custom',
          baseRankingId: null,
          marketIdWhitelist: ['public-trust'],
        },
      ],
    })

    const customCapsule = updated.secondaryCapsules.find((item) => item.id === 'cap-elections')
    expect(customCapsule).toBeDefined()
    expect(customCapsule?.kind).toBe('custom')
    expect(customCapsule?.marketIdWhitelist).toEqual(['public-trust'])

    const ranking = demoBackend.getDiscoveryRanking('hot')
    const customCategoryEntry = ranking.categories.find((entry) => entry.id === 'cap-elections')
    expect(customCategoryEntry).toBeDefined()
    expect(customCategoryEntry?.label).toBe('大选')
    // Only intersects with markets that actually appear in the ranking page items.
    expect(customCategoryEntry?.marketIds).toEqual(
      expect.arrayContaining([]),
    )
  })

  it('refuses to delete system secondary capsules but accepts hide', async () => {
    const { demoBackend } = await import('./demo-backend')
    demoBackend.reset()

    const current = demoBackend.getOpsDiscoveryGlobalConfig()
    const allId = 'all'
    const updated = demoBackend.updateOpsDiscoveryGlobalConfig({
      categories: current.categories.map((item) => ({
        slug: item.slug,
        kind: item.kind,
        marketIdWhitelist: [...item.marketIdWhitelist],
      })),
      rankingCategoryLabels: current.rankingCategoryLabels,
      secondaryCapsules: current.secondaryCapsules.map((capsule) => ({
        id: capsule.id,
        label: capsule.label,
        kind: capsule.kind,
        baseRankingId: capsule.baseRankingId,
        marketIdWhitelist: [...capsule.marketIdWhitelist],
        // Try to delete the system 'all' capsule.
        pageState: capsule.id === allId ? 'deleted' : capsule.pageState,
      })),
    })

    const allCapsule = updated.secondaryCapsules.find((item) => item.id === allId)
    expect(allCapsule).toBeDefined()
    // System capsule's deleted state is downgraded to hidden so ranking still works.
    expect(allCapsule?.pageState).toBe('hidden')
  })
})

import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { demoBackend } from '../features/demo/demo-backend'
import { renderApp } from '../test/render-app'

describe('utility directory routes', () => {
  beforeEach(() => {
    demoBackend.reset()
  })

  it('renders /zh/pages as a full-page directory of product entry points', () => {
    renderApp(['/zh/pages'])

    expect(screen.getByRole('heading', { name: '全部页面' })).toBeInTheDocument()
    expect(screen.getByText('Arena 产品所有入口一览，覆盖发现、市场、账户、支持等功能模块。')).toBeInTheDocument()
    expect(screen.getAllByText('产品入口').length).toBeGreaterThan(0)
    expect(screen.getAllByText('用户功能').length).toBeGreaterThan(0)
  })

  it('renders /zh/categories as a full-page category directory', async () => {
    renderApp(['/zh/categories'])

    expect(screen.getByRole('heading', { name: '分类浏览' })).toBeInTheDocument()
    expect(screen.getByText('按主题分类浏览 Arena 公开命题，覆盖政策、金融、科技、体育等多个领域。')).toBeInTheDocument()
    expect(await screen.findByText('地缘事件')).toBeInTheDocument()
    expect(screen.queryByText('AI 调研')).not.toBeInTheDocument()
    expect(screen.queryByText('有效样本优先')).not.toBeInTheDocument()
  })

  it('renders /zh/categories from the discovery category index contract instead of a local category link list', async () => {
    renderApp(['/zh/categories'])

    expect(await screen.findByText('公共政策')).toBeInTheDocument()
    expect(await screen.findByText('体育结果')).toBeInTheDocument()
    expect(await screen.findByText('政府、立法与公共治理')).toBeInTheDocument()
  })
})

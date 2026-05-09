import { Activity, Home, Menu, Search } from 'lucide-react'
import { NavLink } from 'react-router-dom'

export function MobileTabBar() {
  return (
    <nav className="mobile-tabbar" aria-label="移动导航">
      <NavLink to="/zh" end>
        <Home size={20} />
        <span>首页</span>
      </NavLink>
      <NavLink to="/zh/search">
        <Search size={20} />
        <span>搜索</span>
      </NavLink>
      <NavLink to="/zh/breaking">
        <Activity size={20} />
        <span>突发</span>
      </NavLink>
      <NavLink to="/zh/menu">
        <Menu size={20} />
        <span>菜单</span>
      </NavLink>
    </nav>
  )
}

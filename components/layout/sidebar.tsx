'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ModuleKey } from '@/lib/types/database'

const NAV_ITEMS: { key: ModuleKey; label: string; href: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: '📊' },
  { key: 'cargas', label: 'Cargas', href: '/cargas', icon: '📦' },
  { key: 'clientes', label: 'Clientes', href: '/clientes', icon: '👤' },
  { key: 'produtos', label: 'Produtos', href: '/produtos', icon: '🏷️' },
  { key: 'usuarios', label: 'Usuários / Config', href: '/usuarios', icon: '⚙️' },
]

export function Sidebar({ permissions }: { permissions: ModuleKey[] }) {
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((item) => permissions.includes(item.key))

  return (
    <aside className="w-64 shrink-0 bg-gradient-to-b from-slate-900 to-[#1e3a5f] text-slate-300 flex flex-col p-4 gap-1">
      <div className="text-white font-bold text-lg mb-6">🚚 Distribuidora</div>
      {items.map((item) => {
        const active = pathname.startsWith(item.href)
        return (
          <Link
            key={item.key}
            href={item.href}
            className={
              active
                ? 'bg-sky-400/15 text-sky-400 font-semibold rounded-md px-3 py-2'
                : 'px-3 py-2 rounded-md hover:bg-white/5'
            }
          >
            {item.icon} {item.label}
          </Link>
        )
      })}
    </aside>
  )
}

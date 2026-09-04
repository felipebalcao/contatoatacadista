'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  LayoutDashboard,
  Package,
  Settings,
  Tag,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { ModuleKey } from '@/lib/types/database'

const NAV_ITEMS: { key: ModuleKey; label: string; href: string; icon: LucideIcon }[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'cargas', label: 'Cargas', href: '/cargas', icon: Package },
  { key: 'clientes', label: 'Clientes', href: '/clientes', icon: Users },
  { key: 'produtos', label: 'Produtos', href: '/produtos', icon: Tag },
  { key: 'fornecedores', label: 'Fornecedores', href: '/fornecedores', icon: Building2 },
  { key: 'usuarios', label: 'Usuários / Config', href: '/usuarios', icon: Settings },
]

export function Sidebar({ permissions }: { permissions: ModuleKey[] }) {
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((item) => permissions.includes(item.key))

  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col bg-gradient-to-b from-slate-900 to-[#1e3a5f] text-slate-300 md:w-64">
      <div className="flex items-center justify-center gap-3 px-3 py-5 md:justify-start md:px-5 md:py-6">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 shadow-lg shadow-sky-950/40">
          <Truck className="size-5 text-white" strokeWidth={2.25} />
        </span>
        <span className="hidden text-base font-semibold tracking-tight text-white md:inline">
          Distribuidora
        </span>
      </div>

      <div className="mx-3 h-px bg-white/10 md:mx-5" />

      <nav className="flex flex-1 flex-col gap-1 px-3 py-5">
        <p className="hidden px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 md:block">
          Navegação
        </p>
        {items.map((item) => {
          const active = pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
                active
                  ? 'bg-sky-400/15 font-semibold text-sky-400'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {active && (
                <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sky-400" />
              )}
              <Icon
                className={`size-4 shrink-0 transition-colors duration-150 ${
                  active ? 'text-sky-400' : 'text-slate-500 group-hover:text-slate-300'
                }`}
              />
              <span className="sr-only md:not-sr-only">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <p className="hidden px-5 pb-5 text-[11px] text-slate-400 md:block">
        Gestão de cargas e distribuição
      </p>
    </aside>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  Tag,
  Truck,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { signOut } from '@/actions/auth-actions'
import type { ModuleKey } from '@/lib/types/database'

type NavItem = { key: ModuleKey; label: string; href: string; icon: LucideIcon }

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Visão geral',
    items: [{ key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Operação',
    items: [{ key: 'cargas', label: 'Cargas', href: '/cargas', icon: Package }],
  },
  {
    label: 'Cadastros',
    items: [
      { key: 'fornecedores', label: 'Fornecedores', href: '/fornecedores', icon: Building2 },
      { key: 'produtos', label: 'Produtos', href: '/produtos', icon: Tag },
      { key: 'clientes', label: 'Clientes', href: '/clientes', icon: Users },
    ],
  },
  {
    label: 'Sistema',
    items: [{ key: 'usuarios', label: 'Usuários / Config', href: '/usuarios', icon: Settings }],
  },
]

export function Sidebar({
  permissions,
  usuario,
}: {
  permissions: ModuleKey[]
  usuario: { nome: string; email: string; papel: string }
}) {
  const pathname = usePathname()
  const [fechados, setFechados] = useState<string[]>([])

  const grupos = NAV_GROUPS.map((grupo) => ({
    ...grupo,
    items: grupo.items.filter((item) => permissions.includes(item.key)),
  })).filter((grupo) => grupo.items.length > 0)

  function alternarGrupo(label: string) {
    setFechados((atual) =>
      atual.includes(label) ? atual.filter((l) => l !== label) : [...atual, label]
    )
  }

  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col text-slate-600 md:w-64">
      <div className="flex items-center justify-center gap-3 px-3 py-6 md:justify-start md:px-6">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 shadow-sm">
          <Truck className="size-5 text-white" strokeWidth={2.25} />
        </span>
        <span className="hidden text-base font-semibold tracking-tight text-slate-900 md:inline">
          Distribuidora
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 pb-4 md:px-4">
        {grupos.map((grupo) => {
          const fechado = fechados.includes(grupo.label)
          return (
            <div key={grupo.label} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => alternarGrupo(grupo.label)}
                aria-expanded={!fechado}
                className="hidden items-center justify-between rounded-lg px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase outline-none transition-colors hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-sky-400 md:flex"
              >
                {grupo.label}
                <ChevronDown
                  className={`size-3.5 transition-transform duration-150 ${fechado ? '-rotate-90' : ''}`}
                />
              </button>

              <div className={`flex flex-col gap-1 ${fechado ? 'md:hidden' : ''}`}>
                {grupo.items.map((item) => {
                  const ativo = pathname.startsWith(item.href)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      aria-current={ativo ? 'page' : undefined}
                      className={`flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sky-400 md:justify-start ${
                        ativo
                          ? 'bg-slate-900 font-medium text-white shadow-sm'
                          : 'hover:bg-white/70 hover:text-slate-900'
                      }`}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="sr-only md:not-sr-only">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="flex flex-col gap-2 p-2 md:p-4">
        <div className="flex items-center justify-center gap-3 rounded-2xl bg-white/80 p-2 shadow-sm md:justify-start md:p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <User className="size-4" />
          </span>
          <div className="hidden min-w-0 flex-col leading-tight md:flex">
            <span className="truncate text-sm font-semibold text-slate-900">{usuario.nome}</span>
            <span className="truncate text-xs text-slate-500">{usuario.email}</span>
            <span className="truncate text-xs text-slate-400">{usuario.papel}</span>
          </div>
        </div>

        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/80 px-3 py-2.5 text-sm text-slate-600 shadow-sm outline-none transition-colors hover:bg-white hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-sky-400 md:justify-start"
          >
            <LogOut className="size-4 shrink-0" />
            <span className="sr-only md:not-sr-only">Sair</span>
          </button>
        </form>
      </div>
    </aside>
  )
}

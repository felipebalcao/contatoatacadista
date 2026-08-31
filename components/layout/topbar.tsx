import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signOut } from '@/actions/auth-actions'

export function Topbar({ nome }: { nome: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-end gap-4 border-b border-slate-200 bg-white/80 px-6 backdrop-blur-sm">
      <div className="flex flex-col items-end leading-tight">
        <span className="text-sm font-medium text-slate-700">{nome}</span>
        <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Sessão ativa</span>
      </div>
      <div className="h-6 w-px bg-slate-200" />
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900">
          <LogOut className="size-3.5" />
          Sair
        </Button>
      </form>
    </header>
  )
}

import { Button } from '@/components/ui/button'
import { signOut } from '@/actions/auth-actions'

export function Topbar({ nome }: { nome: string }) {
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <span className="text-sm text-slate-500">Bem-vindo, {nome}</span>
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="sm">Sair</Button>
      </form>
    </header>
  )
}

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function AcessoNegadoPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">Acesso negado</h1>
      <p className="text-slate-500">Você não tem permissão para acessar essa área.</p>
      <Button asChild>
        <Link href="/dashboard">Voltar ao Dashboard</Link>
      </Button>
    </main>
  )
}

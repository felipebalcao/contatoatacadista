import Link from 'next/link'

export default function AcessoNegadoPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">Acesso negado</h1>
      <p className="text-slate-500">Você não tem permissão para acessar essa área.</p>
      <Link
        href="/dashboard"
        className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-medium h-8 px-2.5 hover:bg-primary/80 transition-all outline-none"
      >
        Voltar ao Dashboard
      </Link>
    </main>
  )
}

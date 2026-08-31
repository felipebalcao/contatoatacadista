import { Truck } from 'lucide-react'
import { LoginForm } from '@/components/auth/login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>
}) {
  const params = await searchParams

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 to-[#1e3a5f] px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-sky-500/10 blur-3xl"
      />

      <div className="relative w-full max-w-sm">
        <div className="overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-950/40">
          <div className="h-1 bg-gradient-to-r from-sky-500 to-sky-600" />
          <div className="flex flex-col gap-6 p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 shadow-lg shadow-sky-500/25">
                <Truck className="size-6 text-white" strokeWidth={2.25} />
              </span>
              <div className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                  Distribuidora
                </h1>
                <p className="text-sm text-slate-500">Entre para acessar o sistema.</p>
              </div>
            </div>

            <LoginForm
              redirectTo={params.redirectTo ?? '/dashboard'}
              hasError={params.error === '1'}
            />
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] uppercase tracking-[0.14em] text-slate-400">
          Acesso restrito à equipe interna
        </p>
      </div>
    </main>
  )
}

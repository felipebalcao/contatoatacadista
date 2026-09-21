import { Truck } from 'lucide-react'
import { LoginForm } from '@/components/auth/login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>
}) {
  const params = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-zinc-100 to-zinc-200 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl border border-white bg-white p-8 shadow-xl shadow-slate-900/5">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex size-11 items-center justify-center rounded-xl bg-slate-900 shadow-sm">
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

        <p className="mt-6 text-center text-xs text-slate-400">Acesso restrito à equipe interna</p>
      </div>
    </main>
  )
}

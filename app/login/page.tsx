import { LoginForm } from '@/components/auth/login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>
}) {
  const params = await searchParams

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-[#1e3a5f]">
      <div className="bg-white rounded-lg shadow-2xl p-8 flex flex-col items-center gap-6">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-sky-600" />
        <LoginForm redirectTo={params.redirectTo ?? '/dashboard'} hasError={params.error === '1'} />
      </div>
    </main>
  )
}

import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'
import { Sidebar } from '@/components/layout/sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const result = await getCurrentProfile()

  if (!result) {
    redirect('/login')
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-100 via-zinc-100 to-zinc-200">
      <Sidebar
        permissions={result.permissions}
        usuario={{
          nome: result.profile.nome,
          email: result.profile.email,
          papel: result.role.nome,
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col pt-3">
        <main className="flex-1 rounded-tl-3xl bg-white p-6 shadow-sm md:p-8">{children}</main>
      </div>
    </div>
  )
}

import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-current-profile'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const result = await getCurrentProfile()

  if (!result) {
    redirect('/login')
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar permissions={result.permissions} />
      <div className="flex-1 flex flex-col">
        <Topbar nome={result.profile.nome} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}

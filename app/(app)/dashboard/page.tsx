import { requireModuleAccess } from '@/lib/auth/require-module-access'

export default async function DashboardPage() {
  await requireModuleAccess('dashboard')

  return (
    <div className="border border-dashed rounded-lg p-12 text-center text-slate-400">
      Dashboard — em construção
    </div>
  )
}

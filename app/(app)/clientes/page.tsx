import { requireModuleAccess } from '@/lib/auth/require-module-access'

export default async function ClientesPage() {
  await requireModuleAccess('clientes')

  return (
    <div className="border border-dashed rounded-lg p-12 text-center text-slate-400">
      Clientes — em construção
    </div>
  )
}

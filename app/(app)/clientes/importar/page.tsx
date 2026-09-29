import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { ImportarClientesPageClient } from '@/components/clientes/importar-clientes-page-client'

export default async function ImportarClientesPage() {
  await requireModuleAccess('clientes')

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Importar clientes</h1>
      <ImportarClientesPageClient />
    </div>
  )
}

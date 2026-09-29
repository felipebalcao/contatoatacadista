import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { ImportarFornecedoresPageClient } from '@/components/fornecedores/importar-fornecedores-page-client'

export default async function ImportarFornecedoresPage() {
  await requireModuleAccess('fornecedores')

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Importar fornecedores</h1>
      <ImportarFornecedoresPageClient />
    </div>
  )
}

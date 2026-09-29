import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { ImportarProdutosPageClient } from '@/components/produtos/importar-produtos-page-client'

export default async function ImportarProdutosPage() {
  await requireModuleAccess('produtos')

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Importar produtos</h1>
      <ImportarProdutosPageClient />
    </div>
  )
}

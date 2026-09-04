import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { ProdutoForm } from '@/components/produtos/produto-form'

export default async function NovoProdutoPage() {
  await requireModuleAccess('produtos')

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Novo produto</h1>
      <ProdutoForm />
    </div>
  )
}

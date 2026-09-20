import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { getProximoCodigoProduto } from '@/actions/produto-actions'
import { ProdutoForm } from '@/components/produtos/produto-form'

export default async function NovoProdutoPage() {
  await requireModuleAccess('produtos')
  const codigoSugerido = await getProximoCodigoProduto()

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Novo produto</h1>
      <ProdutoForm codigoSugerido={codigoSugerido} />
    </div>
  )
}

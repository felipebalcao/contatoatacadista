import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { listProdutos } from '@/actions/produto-actions'
import { ProdutosPageClient } from '@/components/produtos/produtos-page-client'

export default async function ProdutosPage() {
  await requireModuleAccess('produtos')
  const produtos = await listProdutos()

  return <ProdutosPageClient produtosIniciais={produtos} />
}

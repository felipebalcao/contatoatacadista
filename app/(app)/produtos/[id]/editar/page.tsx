import { notFound } from 'next/navigation'
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { getProduto } from '@/actions/produto-actions'
import { ProdutoForm } from '@/components/produtos/produto-form'

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireModuleAccess('produtos')
  const { id } = await params
  const produto = await getProduto(id)

  if (!produto) {
    notFound()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Editar produto</h1>
      <ProdutoForm produto={produto} />
    </div>
  )
}

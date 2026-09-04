import { notFound } from 'next/navigation'
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { getFornecedor } from '@/actions/fornecedor-actions'
import { FornecedorForm } from '@/components/fornecedores/fornecedor-form'

export default async function EditarFornecedorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireModuleAccess('fornecedores')
  const { id } = await params
  const fornecedor = await getFornecedor(id)

  if (!fornecedor) {
    notFound()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Editar fornecedor</h1>
      <FornecedorForm fornecedor={fornecedor} />
    </div>
  )
}

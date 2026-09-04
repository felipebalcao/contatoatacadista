import { notFound } from 'next/navigation'
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { getCarga, listFornecedoresAtivos, listProdutosAtivos } from '@/actions/carga-actions'
import { CargaForm } from '@/components/cargas/carga-form'

export default async function EditarCargaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireModuleAccess('cargas')
  const { id } = await params
  const [carga, fornecedores, produtos] = await Promise.all([
    getCarga(id),
    listFornecedoresAtivos(),
    listProdutosAtivos(),
  ])

  if (!carga) {
    notFound()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Editar carga</h1>
      <CargaForm carga={carga} fornecedores={fornecedores} produtosDisponiveis={produtos} />
    </div>
  )
}

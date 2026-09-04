import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { listFornecedoresAtivos, listProdutosAtivos } from '@/actions/carga-actions'
import { CargaForm } from '@/components/cargas/carga-form'

export default async function NovaCargaPage() {
  await requireModuleAccess('cargas')
  const [fornecedores, produtos] = await Promise.all([listFornecedoresAtivos(), listProdutosAtivos()])

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Nova carga</h1>
      <CargaForm fornecedores={fornecedores} produtosDisponiveis={produtos} />
    </div>
  )
}

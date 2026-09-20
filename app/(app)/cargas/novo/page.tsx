import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { listFornecedoresAtivos, listProdutosAtivos } from '@/actions/carga-actions'
import { CargaForm } from '@/components/cargas/carga-form'
import { dataHojeSaoPaulo } from '@/lib/cargas/data-hoje'

export default async function NovaCargaPage() {
  await requireModuleAccess('cargas')
  const [fornecedores, produtos] = await Promise.all([listFornecedoresAtivos(), listProdutosAtivos()])

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Nova carga</h1>
      <CargaForm
        fornecedores={fornecedores}
        produtosDisponiveis={produtos}
        dataSugerida={dataHojeSaoPaulo()}
      />
    </div>
  )
}

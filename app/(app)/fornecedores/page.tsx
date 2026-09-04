import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { listFornecedores } from '@/actions/fornecedor-actions'
import { FornecedoresPageClient } from '@/components/fornecedores/fornecedores-page-client'

export default async function FornecedoresPage() {
  await requireModuleAccess('fornecedores')
  const fornecedores = await listFornecedores()

  return <FornecedoresPageClient fornecedoresIniciais={fornecedores} />
}

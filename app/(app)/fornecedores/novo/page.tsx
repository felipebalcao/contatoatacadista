import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { FornecedorForm } from '@/components/fornecedores/fornecedor-form'

export default async function NovoFornecedorPage() {
  await requireModuleAccess('fornecedores')

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Novo fornecedor</h1>
      <FornecedorForm />
    </div>
  )
}

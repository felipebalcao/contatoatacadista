import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { ClienteForm } from '@/components/clientes/cliente-form'

export default async function NovoClientePage() {
  await requireModuleAccess('clientes')

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Novo cliente</h1>
      <ClienteForm />
    </div>
  )
}

import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { listClientes } from '@/actions/cliente-actions'
import { ClientesPageClient } from '@/components/clientes/clientes-page-client'

export default async function ClientesPage() {
  await requireModuleAccess('clientes')
  const clientes = await listClientes()

  return <ClientesPageClient clientesIniciais={clientes} />
}

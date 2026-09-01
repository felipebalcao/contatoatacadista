import { notFound } from 'next/navigation'
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { getCliente } from '@/actions/cliente-actions'
import { ClienteForm } from '@/components/clientes/cliente-form'

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireModuleAccess('clientes')
  const { id } = await params
  const cliente = await getCliente(id)

  if (!cliente) {
    notFound()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Editar cliente</h1>
      <ClienteForm cliente={cliente} />
    </div>
  )
}

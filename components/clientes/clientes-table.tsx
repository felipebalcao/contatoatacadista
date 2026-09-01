import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import type { Cliente, TipoCliente } from '@/lib/types/database'

const TIPO_LABELS: Record<TipoCliente, string> = { pf: 'CPF', pj: 'CNPJ' }

function formatarDocumento(tipo: TipoCliente, documento: string): string {
  if (tipo === 'pf') {
    return documento.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  return documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

export function ClientesTable({
  clientes,
  onToggleAtivo,
}: {
  clientes: Cliente[]
  onToggleAtivo: (id: string, ativo: boolean) => void
}) {
  if (clientes.length === 0) {
    return (
      <p className="text-sm text-slate-500 border border-dashed rounded-lg p-8 text-center">
        Nenhum cliente cadastrado ainda.
      </p>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b">
          <th className="py-2">Nome</th>
          <th className="py-2">Documento</th>
          <th className="py-2">Status</th>
          <th className="py-2"></th>
        </tr>
      </thead>
      <tbody>
        {clientes.map((cliente) => (
          <tr key={cliente.id} className="border-b">
            <td className="py-2">{cliente.nome}</td>
            <td className="py-2">
              {TIPO_LABELS[cliente.tipo]}: {formatarDocumento(cliente.tipo, cliente.documento)}
            </td>
            <td className="py-2">
              <span
                className={
                  cliente.ativo
                    ? 'text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 text-xs'
                    : 'text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 text-xs'
                }
              >
                {cliente.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </td>
            <td className="py-2 text-right space-x-2">
              <Link href={`/clientes/${cliente.id}/editar`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Editar
              </Link>
              <Button variant="ghost" size="sm" onClick={() => onToggleAtivo(cliente.id, !cliente.ativo)}>
                {cliente.ativo ? 'Inativar' : 'Reativar'}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

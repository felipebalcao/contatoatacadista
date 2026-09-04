import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import type { Fornecedor, TipoCliente } from '@/lib/types/database'

const TIPO_LABELS: Record<TipoCliente, string> = { pf: 'CPF', pj: 'CNPJ' }

function formatarDocumento(tipo: TipoCliente, documento: string): string {
  if (tipo === 'pf') {
    return documento.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  return documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

export function FornecedoresTable({
  fornecedores,
  onToggleAtivo,
}: {
  fornecedores: Fornecedor[]
  onToggleAtivo: (id: string, ativo: boolean) => void
}) {
  if (fornecedores.length === 0) {
    return (
      <p className="text-sm text-slate-500 border border-dashed rounded-lg p-8 text-center">
        Nenhum fornecedor cadastrado ainda.
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
        {fornecedores.map((fornecedor) => (
          <tr key={fornecedor.id} className="border-b">
            <td className="py-2">{fornecedor.nome}</td>
            <td className="py-2">
              {TIPO_LABELS[fornecedor.tipo]}: {formatarDocumento(fornecedor.tipo, fornecedor.documento)}
            </td>
            <td className="py-2">
              <span
                className={
                  fornecedor.ativo
                    ? 'text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 text-xs'
                    : 'text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 text-xs'
                }
              >
                {fornecedor.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </td>
            <td className="py-2 text-right space-x-2">
              <Link href={`/fornecedores/${fornecedor.id}/editar`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Editar
              </Link>
              <Button variant="ghost" size="sm" onClick={() => onToggleAtivo(fornecedor.id, !fornecedor.ativo)}>
                {fornecedor.ativo ? 'Inativar' : 'Reativar'}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

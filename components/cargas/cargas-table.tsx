import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import type { CargaResumo } from '@/lib/types/database'

function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(data: string): string {
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

export function CargasTable({
  cargas,
  onToggleAtivo,
}: {
  cargas: CargaResumo[]
  onToggleAtivo: (id: string, ativo: boolean) => void
}) {
  if (cargas.length === 0) {
    return (
      <p className="text-sm text-slate-500 border border-dashed rounded-lg p-8 text-center">
        Nenhuma carga cadastrada ainda.
      </p>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b">
          <th className="py-2">Nome</th>
          <th className="py-2">Fornecedor</th>
          <th className="py-2">Data</th>
          <th className="py-2">Total</th>
          <th className="py-2">Status</th>
          <th className="py-2"></th>
        </tr>
      </thead>
      <tbody>
        {cargas.map((carga) => (
          <tr key={carga.id} className="border-b">
            <td className="py-2">{carga.nome}</td>
            <td className="py-2">{carga.fornecedor_nome}</td>
            <td className="py-2">{formatarData(carga.data)}</td>
            <td className="py-2">{formatarMoeda(carga.total)}</td>
            <td className="py-2">
              <span
                className={
                  carga.ativo
                    ? 'text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 text-xs'
                    : 'text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 text-xs'
                }
              >
                {carga.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </td>
            <td className="py-2 text-right space-x-2">
              <Link href={`/cargas/${carga.id}/editar`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Editar
              </Link>
              <Button variant="ghost" size="sm" onClick={() => onToggleAtivo(carga.id, !carga.ativo)}>
                {carga.ativo ? 'Inativar' : 'Reativar'}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

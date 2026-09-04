import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import type { Produto } from '@/lib/types/database'

export function ProdutosTable({
  produtos,
  onToggleAtivo,
}: {
  produtos: Produto[]
  onToggleAtivo: (id: string, ativo: boolean) => void
}) {
  if (produtos.length === 0) {
    return (
      <p className="text-sm text-slate-500 border border-dashed rounded-lg p-8 text-center">
        Nenhum produto cadastrado ainda.
      </p>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b">
          <th className="py-2">Código</th>
          <th className="py-2">Nome</th>
          <th className="py-2">Unidade</th>
          <th className="py-2">Categoria</th>
          <th className="py-2">Status</th>
          <th className="py-2"></th>
        </tr>
      </thead>
      <tbody>
        {produtos.map((produto) => (
          <tr key={produto.id} className="border-b">
            <td className="py-2">{produto.codigo}</td>
            <td className="py-2">{produto.nome}</td>
            <td className="py-2">{produto.unidade}</td>
            <td className="py-2">{produto.categoria ?? '—'}</td>
            <td className="py-2">
              <span
                className={
                  produto.ativo
                    ? 'text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 text-xs'
                    : 'text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 text-xs'
                }
              >
                {produto.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </td>
            <td className="py-2 text-right space-x-2">
              <Link href={`/produtos/${produto.id}/editar`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Editar
              </Link>
              <Button variant="ghost" size="sm" onClick={() => onToggleAtivo(produto.id, !produto.ativo)}>
                {produto.ativo ? 'Inativar' : 'Reativar'}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

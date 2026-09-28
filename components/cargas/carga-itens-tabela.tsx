import { formatarMoeda } from '@/lib/formatacao'
import type { ItemCarga } from '@/lib/types/database'

export function CargaItensTabela({ itens }: { itens: ItemCarga[] }) {
  if (itens.length === 0) {
    return (
      <p className="text-sm text-slate-500 border border-dashed rounded-lg p-8 text-center">
        Esta carga não tem itens.
      </p>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b">
          <th className="py-2">Produto</th>
          <th className="py-2">Quantidade</th>
          <th className="py-2">Valor unitário</th>
          <th className="py-2">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {itens.map((item) => (
          <tr key={item.id} className="border-b">
            <td className="py-2">
              {item.produto_codigo} — {item.produto_nome}
            </td>
            <td className="py-2">
              {item.quantidade} {item.produto_unidade}
            </td>
            <td className="py-2">{formatarMoeda(item.valor_unitario)}</td>
            <td className="py-2">{formatarMoeda(item.quantidade * item.valor_unitario)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

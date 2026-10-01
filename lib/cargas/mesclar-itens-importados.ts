import type { ItemCargaLocal } from '@/components/cargas/adicionar-produto-modal'

export function mesclarItensImportados(
  itensAtuais: ItemCargaLocal[],
  itensImportados: ItemCargaLocal[]
): ItemCargaLocal[] {
  const resultado = itensAtuais.map((item) => ({ ...item }))

  for (const itemImportado of itensImportados) {
    const indiceExistente = resultado.findIndex((item) => item.produto_id === itemImportado.produto_id)
    if (indiceExistente >= 0) {
      resultado[indiceExistente] = {
        ...resultado[indiceExistente],
        quantidade: resultado[indiceExistente].quantidade + itemImportado.quantidade,
        valor_unitario: itemImportado.valor_unitario,
      }
    } else {
      resultado.push({ ...itemImportado })
    }
  }

  return resultado
}

'use client'

import { ImportadorCsv } from '@/components/importacao/importador-csv'
import { configImportacaoProdutos } from './importar-produtos-config'

export function ImportarProdutosPageClient() {
  return <ImportadorCsv config={configImportacaoProdutos} />
}

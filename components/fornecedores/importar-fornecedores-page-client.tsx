'use client'

import { ImportadorCsv } from '@/components/importacao/importador-csv'
import { configImportacaoFornecedores } from './importar-fornecedores-config'

export function ImportarFornecedoresPageClient() {
  return <ImportadorCsv config={configImportacaoFornecedores} />
}

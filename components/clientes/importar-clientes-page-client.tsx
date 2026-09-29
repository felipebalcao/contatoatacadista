'use client'

import { ImportadorCsv } from '@/components/importacao/importador-csv'
import { configImportacaoClientes } from './importar-clientes-config'

export function ImportarClientesPageClient() {
  return <ImportadorCsv config={configImportacaoClientes} />
}

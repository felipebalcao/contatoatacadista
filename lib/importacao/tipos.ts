export interface CampoImportacao {
  chave: string
  rotulo: string
  obrigatorio: boolean
  apelidos?: string[]
}

export interface LinhaImportacao<T> {
  numero: number
  bruta: Record<string, string>
  valores: T | null
  status: 'ok' | 'erro' | 'duplicada'
  mensagens: string[]
  incluir: boolean
  /** Só preenchido quando status === 'duplicada': onde a chave já apareceu. */
  duplicadaEm?: 'banco' | 'arquivo'
}

export interface LinhaParaImportar<T> {
  numero: number
  valores: T
}

export interface ResultadoImportacao {
  criados: number
  pulados: { linha: number; motivo: string }[]
}

export interface ConfiguracaoImportacao<T> {
  tituloModulo: string
  campos: CampoImportacao[]
  validarLinha: (bruta: Record<string, string>) => { valores: T | null; mensagens: string[] }
  /** Retorna null quando esta linha ainda não tem uma chave de duplicidade definida (ex: código a ser gerado automaticamente). */
  chaveUnica: (valores: T) => string | null
  listarChavesExistentes: () => Promise<string[]>
  importar: (linhas: LinhaParaImportar<T>[]) => Promise<ResultadoImportacao>
  linkListagem: string
}

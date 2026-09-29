'use client'

import { useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import Papa from 'papaparse'
import { Button, buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { sugerirMapeamento } from '@/lib/importacao/sugerir-mapeamento'
import { detectarDuplicadas } from '@/lib/importacao/detectar-duplicadas'
import type {
  ConfiguracaoImportacao,
  LinhaImportacao,
  LinhaParaImportar,
  ResultadoImportacao,
} from '@/lib/importacao/tipos'

type Etapa = 'upload' | 'mapear' | 'revisar' | 'resultado'

const TAMANHO_LOTE_IMPORTACAO = 150

async function lerArquivoComoTexto(arquivo: File): Promise<string> {
  const buffer = await arquivo.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    // Exportações de CSV de planilhas em locais Windows-português costumam gravar
    // em Windows-1252 (cp1252), não UTF-8. Sem esse fallback, caracteres acentuados
    // corrompem silenciosamente (ex.: "José" -> "Jos�") sem nenhum erro do papaparse.
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

export function ImportadorCsv<T>({ config }: { config: ConfiguracaoImportacao<T> }) {
  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)
  const [colunasCsv, setColunasCsv] = useState<string[]>([])
  const [linhasBrutas, setLinhasBrutas] = useState<Record<string, string>[]>([])
  const [mapeamento, setMapeamento] = useState<Record<string, string>>({})
  const [erroMapeamento, setErroMapeamento] = useState<string | null>(null)
  const [carregandoRevisao, setCarregandoRevisao] = useState(false)
  const [linhas, setLinhas] = useState<LinhaImportacao<T>[]>([])
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState<{ processadas: number; total: number } | null>(null)
  const [erroImportacao, setErroImportacao] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)

  async function handleArquivo(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0]
    event.target.value = ''
    if (!arquivo) return

    setErroArquivo(null)

    let texto: string
    try {
      texto = await lerArquivoComoTexto(arquivo)
    } catch {
      setErroArquivo('Não foi possível ler o arquivo. Confirme que é um CSV válido.')
      return
    }

    Papa.parse<Record<string, string>>(texto, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (res) => {
        if (res.errors.length > 0) {
          setErroArquivo('Não foi possível ler o arquivo. Confirme que é um CSV válido.')
          return
        }
        const colunas = res.meta.fields ?? []
        if (colunas.length === 0 || res.data.length === 0) {
          setErroArquivo('O arquivo está vazio ou não tem cabeçalho.')
          return
        }
        setColunasCsv(colunas)
        setLinhasBrutas(res.data)
        setMapeamento(sugerirMapeamento(colunas, config.campos))
        setEtapa('mapear')
      },
      error: () => {
        setErroArquivo('Não foi possível ler o arquivo. Confirme que é um CSV válido.')
      },
    })
  }

  function handleMapeamentoConfirmado() {
    const faltando = config.campos.filter((campo) => campo.obrigatorio && !mapeamento[campo.chave])
    if (faltando.length > 0) {
      setErroMapeamento(`Mapeie os campos obrigatórios: ${faltando.map((c) => c.rotulo).join(', ')}.`)
      return
    }

    setErroMapeamento(null)
    setCarregandoRevisao(true)

    config
      .listarChavesExistentes()
      .then((chavesExistentes) => {
        const brutasELinhas = linhasBrutas.map((linhaBruta) => {
          const bruta: Record<string, string> = {}
          for (const campo of config.campos) {
            const coluna = mapeamento[campo.chave]
            bruta[campo.chave] = coluna ? (linhaBruta[coluna] ?? '').trim() : ''
          }
          return { bruta, ...config.validarLinha(bruta) }
        })

        const chaves = brutasELinhas.map((l) => (l.valores ? config.chaveUnica(l.valores) : null))
        const duplicadas = detectarDuplicadas(chaves, chavesExistentes)

        const linhasProcessadas: LinhaImportacao<T>[] = brutasELinhas.map((l, indice) => {
          const numero = indice + 1
          if (!l.valores) {
            return { numero, bruta: l.bruta, valores: null, status: 'erro', mensagens: l.mensagens, incluir: false }
          }
          const origemDuplicada = duplicadas[indice]
          if (origemDuplicada) {
            return {
              numero,
              bruta: l.bruta,
              valores: l.valores,
              status: 'duplicada',
              mensagens: [
                origemDuplicada === 'banco'
                  ? 'Já cadastrado no sistema.'
                  : 'Repetido neste arquivo.',
              ],
              incluir: false,
              duplicadaEm: origemDuplicada,
            }
          }
          return { numero, bruta: l.bruta, valores: l.valores, status: 'ok', mensagens: [], incluir: true }
        })

        setLinhas(linhasProcessadas)
        setEtapa('revisar')
      })
      .catch((err) => {
        setErroMapeamento(err instanceof Error ? err.message : 'Erro ao revisar o arquivo.')
      })
      .finally(() => setCarregandoRevisao(false))
  }

  function alternarLinha(numero: number) {
    setLinhas((atual) =>
      atual.map((linha) => (linha.numero === numero ? { ...linha, incluir: !linha.incluir } : linha))
    )
  }

  async function handleConfirmarImportacao() {
    const paraImportar = linhas.filter((l) => l.incluir && l.status === 'ok' && l.valores !== null)
    if (paraImportar.length === 0) return

    const lotes: LinhaParaImportar<T>[][] = []
    for (let i = 0; i < paraImportar.length; i += TAMANHO_LOTE_IMPORTACAO) {
      lotes.push(
        paraImportar
          .slice(i, i + TAMANHO_LOTE_IMPORTACAO)
          .map((l) => ({ numero: l.numero, valores: l.valores as T }))
      )
    }

    setErroImportacao(null)
    setImportando(true)
    setProgresso({ processadas: 0, total: paraImportar.length })

    const resultadoAcumulado: ResultadoImportacao = { criados: 0, pulados: [] }

    try {
      // Envia em lotes, um por vez (nunca em paralelo, para não multiplicar a carga
      // simultânea no banco): cada linha do lote re-executa assertModuleAccess no
      // servidor, e o corpo de uma Server Action tem limite padrão de 1MB, então
      // milhares de linhas numa única chamada podem falhar por tamanho ou demorar
      // minutos sem nenhum feedback.
      for (const lote of lotes) {
        const res = await config.importar(lote)
        resultadoAcumulado.criados += res.criados
        resultadoAcumulado.pulados.push(...res.pulados)
        setProgresso((atual) => ({
          processadas: (atual?.processadas ?? 0) + lote.length,
          total: paraImportar.length,
        }))
      }
      setResultado(resultadoAcumulado)
      setEtapa('resultado')
    } catch (err) {
      setErroImportacao(err instanceof Error ? err.message : 'Erro ao importar.')
    } finally {
      setImportando(false)
      setProgresso(null)
    }
  }

  const contagem = {
    ok: linhas.filter((l) => l.status === 'ok').length,
    duplicadaBanco: linhas.filter((l) => l.status === 'duplicada' && l.duplicadaEm === 'banco').length,
    duplicadaArquivo: linhas.filter((l) => l.status === 'duplicada' && l.duplicadaEm === 'arquivo').length,
    erro: linhas.filter((l) => l.status === 'erro').length,
  }
  const totalSelecionadas = linhas.filter((l) => l.incluir).length

  function handleImportarOutroArquivo() {
    setErroArquivo(null)
    setColunasCsv([])
    setLinhasBrutas([])
    setMapeamento({})
    setErroMapeamento(null)
    setCarregandoRevisao(false)
    setLinhas([])
    setImportando(false)
    setProgresso(null)
    setErroImportacao(null)
    setResultado(null)
    setEtapa('upload')
  }

  return (
    <div className="max-w-4xl space-y-6">
      {etapa === 'upload' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Selecione um arquivo .csv com os {config.tituloModulo} para importar. A primeira linha deve ser
            o cabeçalho com o nome das colunas.
          </p>
          {erroArquivo && <p className="text-sm text-red-600">{erroArquivo}</p>}
          <input
            type="file"
            accept=".csv"
            onChange={handleArquivo}
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          />
        </div>
      )}

      {etapa === 'mapear' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Confira o mapeamento das colunas do arquivo para os campos do cadastro. Campos com * são
            obrigatórios.
          </p>
          {erroMapeamento && <p className="text-sm text-red-600">{erroMapeamento}</p>}
          <div className="space-y-3">
            {config.campos.map((campo) => {
              const idCampo = `importar-mapeamento-${campo.chave}`
              return (
                <div key={campo.chave} className="grid grid-cols-2 items-center gap-4">
                  <Label htmlFor={idCampo}>
                    {campo.rotulo}
                    {campo.obrigatorio ? ' *' : ''}
                  </Label>
                  <select
                    id={idCampo}
                    value={mapeamento[campo.chave] ?? ''}
                    onChange={(e) => setMapeamento((atual) => ({ ...atual, [campo.chave]: e.target.value }))}
                    className="h-9 rounded-md border border-slate-200 px-3 text-sm"
                  >
                    <option value="">Não importar</option>
                    {colunasCsv.map((coluna) => (
                      <option key={coluna} value={coluna}>
                        {coluna}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={handleMapeamentoConfirmado} disabled={carregandoRevisao}>
              {carregandoRevisao ? 'Verificando...' : 'Continuar'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEtapa('upload')}>
              Voltar
            </Button>
          </div>
        </div>
      )}

      {etapa === 'revisar' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {contagem.ok} pronta(s) para importar, {contagem.duplicadaBanco} já cadastrada(s),{' '}
            {contagem.duplicadaArquivo} repetida(s) neste arquivo, {contagem.erro} com erro.
          </p>
          {erroImportacao && <p className="text-sm text-red-600">{erroImportacao}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2"></th>
                  <th className="py-2">Linha</th>
                  {config.campos.map((campo) => (
                    <th key={campo.chave} className="px-2 py-2 whitespace-nowrap">
                      {campo.rotulo}
                    </th>
                  ))}
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha) => (
                  <tr key={linha.numero} className="border-b">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={linha.incluir}
                        disabled={linha.status !== 'ok'}
                        onChange={() => alternarLinha(linha.numero)}
                      />
                    </td>
                    <td className="py-2">{linha.numero}</td>
                    {config.campos.map((campo) => (
                      <td key={campo.chave} className="px-2 py-2 whitespace-nowrap text-slate-600">
                        {linha.bruta[campo.chave]}
                      </td>
                    ))}
                    <td className="px-2 py-2">
                      <span
                        className={
                          linha.status === 'ok'
                            ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700'
                            : linha.status === 'duplicada'
                              ? 'rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700'
                              : 'rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700'
                        }
                      >
                        {linha.status === 'ok'
                          ? 'Ok'
                          : linha.status === 'duplicada'
                            ? linha.duplicadaEm === 'banco'
                              ? 'Já cadastrado'
                              : 'Repetido no arquivo'
                            : 'Erro'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-slate-500">{linha.mensagens.join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {importando && progresso && progresso.total > TAMANHO_LOTE_IMPORTACAO && (
            <p className="text-sm text-slate-500">
              Importando {progresso.processadas} de {progresso.total} linhas...
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleConfirmarImportacao}
              disabled={importando || totalSelecionadas === 0}
            >
              {importando ? 'Importando...' : `Importar ${totalSelecionadas} linha(s)`}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEtapa('mapear')} disabled={importando}>
              Voltar
            </Button>
          </div>
        </div>
      )}

      {etapa === 'resultado' && resultado && (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            {resultado.criados} {config.tituloModulo} importado(s) com sucesso.
          </p>
          {resultado.pulados.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">{resultado.pulados.length} linha(s) pulada(s):</p>
              <ul className="list-disc pl-5 text-sm text-slate-500">
                {resultado.pulados.map((p) => (
                  <li key={p.linha}>
                    Linha {p.linha}: {p.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            <Link href={config.linkListagem} className={buttonVariants({ variant: 'default' })}>
              Voltar para a listagem
            </Link>
            <Button type="button" variant="ghost" onClick={handleImportarOutroArquivo}>
              Importar outro arquivo
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

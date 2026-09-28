import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { getCarga } from '@/actions/carga-actions'
import { listCustos, listPagamentos } from '@/actions/carga-lancamentos-actions'
import { calcularResumoCarga } from '@/lib/cargas/resumo'
import { formatarData } from '@/lib/formatacao'
import { buttonVariants } from '@/components/ui/button'
import { CargaResumoCards } from '@/components/cargas/carga-resumo-cards'
import { CargaAbas, ABAS_CARGA, type AbaCarga } from '@/components/cargas/carga-abas'
import { CargaItensTabela } from '@/components/cargas/carga-itens-tabela'
import { dataHojeSaoPaulo } from '@/lib/cargas/data-hoje'
import { CustosSecao } from '@/components/cargas/custos-secao'

export default async function CargaDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ aba?: string }>
}) {
  await requireModuleAccess('cargas')
  const { id } = await params
  const { aba } = await searchParams
  const abaAtiva: AbaCarga = ABAS_CARGA.some((a) => a.chave === aba) ? (aba as AbaCarga) : 'itens'

  const carga = await getCarga(id)
  if (!carga) {
    notFound()
  }

  const [custos, pagamentos] = await Promise.all([listCustos(id), listPagamentos(id)])
  const resumo = calcularResumoCarga(carga.itens, custos, pagamentos)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{carga.nome}</h1>
            {!carga.ativo && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inativa</span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {carga.fornecedor_nome} · {formatarData(carga.data)}
          </p>
        </div>
        <Link href={`/cargas/${carga.id}/editar`} className={buttonVariants({ variant: 'outline' })}>
          Editar carga
        </Link>
      </div>

      <CargaResumoCards resumo={resumo} />

      <div className="space-y-4">
        <CargaAbas cargaId={carga.id} ativa={abaAtiva} />
        {abaAtiva === 'itens' && <CargaItensTabela itens={carga.itens} />}
        {abaAtiva === 'custos' && (
          <CustosSecao cargaId={carga.id} custos={custos} dataPadrao={dataHojeSaoPaulo()} />
        )}
      </div>
    </div>
  )
}

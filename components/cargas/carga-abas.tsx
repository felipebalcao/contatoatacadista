import Link from 'next/link'

export type AbaCarga = 'itens' | 'custos' | 'pagamentos'

export const ABAS_CARGA: { chave: AbaCarga; rotulo: string }[] = [
  { chave: 'itens', rotulo: 'Itens' },
  { chave: 'custos', rotulo: 'Custos' },
  { chave: 'pagamentos', rotulo: 'Pagamentos' },
]

export function CargaAbas({ cargaId, ativa }: { cargaId: string; ativa: AbaCarga }) {
  return (
    <nav aria-label="Seções da carga" className="flex gap-1 border-b border-slate-200">
      {ABAS_CARGA.map((aba) => (
        <Link
          key={aba.chave}
          href={`/cargas/${cargaId}?aba=${aba.chave}`}
          aria-current={ativa === aba.chave ? 'page' : undefined}
          className={`-mb-px border-b-2 px-4 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 ${
            ativa === aba.chave
              ? 'border-slate-900 font-medium text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          {aba.rotulo}
        </Link>
      ))}
    </nav>
  )
}

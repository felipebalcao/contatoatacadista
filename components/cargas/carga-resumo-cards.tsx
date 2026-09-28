import { formatarMoeda } from '@/lib/formatacao'
import type { ResumoCarga } from '@/lib/cargas/resumo'

export function CargaResumoCards({ resumo }: { resumo: ResumoCarga }) {
  const pagoAMais = resumo.falta < 0

  const cartoes = [
    { rotulo: 'Custo total', valor: formatarMoeda(resumo.custoTotal), alerta: false },
    { rotulo: 'Custos extras', valor: formatarMoeda(resumo.custosExtras), alerta: false },
    { rotulo: 'Pago', valor: formatarMoeda(resumo.pago), alerta: false },
    {
      rotulo: pagoAMais ? 'Pago a mais' : 'Falta pagar',
      valor: formatarMoeda(Math.abs(resumo.falta)),
      alerta: pagoAMais,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cartoes.map((cartao) => (
        <div
          key={cartao.rotulo}
          className={`rounded-2xl border p-4 ${
            cartao.alerta ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
          }`}
        >
          <p className={`text-xs ${cartao.alerta ? 'text-amber-700' : 'text-slate-500'}`}>{cartao.rotulo}</p>
          <p className={`mt-1 text-lg font-semibold ${cartao.alerta ? 'text-amber-900' : 'text-slate-900'}`}>
            {cartao.valor}
          </p>
        </div>
      ))}
    </div>
  )
}

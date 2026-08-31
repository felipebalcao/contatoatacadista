import { requireModuleAccess } from '@/lib/auth/require-module-access'

export default async function ProdutosPage() {
  await requireModuleAccess('produtos')

  return (
    <div className="border border-dashed rounded-lg p-12 text-center text-slate-400">
      Produtos — em construção
    </div>
  )
}

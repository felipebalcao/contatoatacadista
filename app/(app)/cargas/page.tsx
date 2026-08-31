import { requireModuleAccess } from '@/lib/auth/require-module-access'

export default async function CargasPage() {
  await requireModuleAccess('cargas')

  return (
    <div className="border border-dashed rounded-lg p-12 text-center text-slate-400">
      Cargas — em construção
    </div>
  )
}

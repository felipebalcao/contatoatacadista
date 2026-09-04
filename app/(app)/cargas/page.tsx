import { requireModuleAccess } from '@/lib/auth/require-module-access'
import { listCargas } from '@/actions/carga-actions'
import { CargasPageClient } from '@/components/cargas/cargas-page-client'

export default async function CargasPage() {
  await requireModuleAccess('cargas')
  const cargas = await listCargas()

  return <CargasPageClient cargasIniciais={cargas} />
}

import { LayoutGrid, RotateCcw } from 'lucide-react'
import type { FC } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useKitSelection } from '@/lib/kits/kit-hooks'
import { applyKit } from '@/lib/kits/kit-storage'
import { findKit } from '@/lib/kits/kits'
import { sentry } from '@/lib/sentry/sentry'
import { MyKitCommandsCard } from './MyKitCommandsCard'
import { MyKitSitesCard } from './MyKitSitesCard'

/**
 * Settings > Meu kit: where the state a MaestroOS kit seeded (lib/kits) is
 * managed after onboarding. Switching reuses the onboarding picker, and
 * "restore" re-applies the kit, which only adds back items that were removed.
 */
export const MyKitPage: FC = () => {
  const selection = useKitSelection()
  const kit = findKit(selection?.kitId)

  const restore = async () => {
    if (!kit) return
    try {
      await applyKit(kit)
      toast.success(`Itens do kit ${kit.name} restaurados`)
    } catch (error) {
      sentry.captureException(error, {
        extra: { message: 'Failed to restore kit' },
      })
      toast.error('Não foi possível restaurar o kit')
    }
  }

  return (
    <div className="fade-in slide-in-from-bottom-5 animate-in space-y-6 duration-500">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-orange)]/10">
            <LayoutGrid className="h-6 w-6 text-[var(--accent-orange)]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="mb-1 font-semibold text-xl">Meu kit</h2>
            <p className="text-muted-foreground text-sm">
              {kit
                ? `Kit atual: ${kit.name}. ${kit.description}`
                : 'Nenhum kit escolhido. Escolha um para começar com os sites e comandos do seu setor.'}
            </p>
          </div>
          <div className="flex gap-2">
            {kit && (
              <Button variant="outline" size="sm" onClick={restore}>
                <RotateCcw className="h-4 w-4" />
                Restaurar itens do kit
              </Button>
            )}
            <Button asChild size="sm">
              <Link to="/onboarding/kit?next=/settings/kit">
                {kit ? 'Trocar de kit' : 'Escolher kit'}
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <MyKitSitesCard />
      <MyKitCommandsCard />
    </div>
  )
}

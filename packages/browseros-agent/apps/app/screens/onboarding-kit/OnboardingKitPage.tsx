import {
  Check,
  GraduationCap,
  HeartPulse,
  type LucideIcon,
  Scale,
  Sparkles,
  Store,
} from 'lucide-react'
import { type FC, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { applyKit, skipKit, useKitSelection } from '@/lib/kits/kit-storage'
import { KITS, type Kit, type KitId } from '@/lib/kits/kits'
import { sentry } from '@/lib/sentry/sentry'
import { cn } from '@/lib/utils'

const KIT_ICONS: Record<KitId, LucideIcon> = {
  essencial: Sparkles,
  juridico: Scale,
  saude: HeartPulse,
  educacao: GraduationCap,
  comercio: Store,
}

/**
 * First-run kit picker: the first MaestroOS step after the native onboarding,
 * before provider setup (/onboarding/ai). The new tab also links here, with
 * `?next=/home`, for installs that onboarded before kits existed.
 *
 * Applying a kit only seeds editable state (see lib/kits), so skipping or
 * picking the "wrong" kit is cheap; the copy says so to keep this step fast.
 */
export const OnboardingKitPage: FC = () => {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') ?? '/onboarding/ai'
  const current = useKitSelection()
  const [selected, setSelected] = useState<KitId | null>(null)
  const [saving, setSaving] = useState(false)

  const chosen = selected ?? current?.kitId ?? null

  const finish = async (action: () => Promise<void>) => {
    setSaving(true)
    try {
      await action()
      navigate(next, { replace: true })
    } catch (error) {
      sentry.captureException(error, {
        extra: { message: 'Failed to save kit' },
      })
      setSaving(false)
    }
  }

  const kit = KITS.find((entry) => entry.id === chosen)

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto w-full max-w-3xl px-6 py-14">
        <h1 className="mb-1.5 font-semibold text-3xl tracking-tight">
          Para que você vai usar o{' '}
          <span className="text-[var(--accent-orange)]">MaestroOS</span>?
        </h1>
        <p className="mb-8 text-muted-foreground">
          Escolha um kit e o navegador já abre com os sites e o jeito de
          responder do seu dia a dia. Você pode trocar ou editar tudo depois.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {KITS.map((entry) => (
            <KitCard
              key={entry.id}
              kit={entry}
              selected={entry.id === chosen}
              onSelect={() => setSelected(entry.id)}
            />
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <Button
            variant="ghost"
            disabled={saving}
            onClick={() => finish(skipKit)}
          >
            Pular por enquanto
          </Button>
          <Button
            disabled={!kit || saving}
            onClick={() => kit && finish(() => applyKit(kit))}
          >
            {kit ? `Usar o kit ${kit.name}` : 'Escolha um kit'}
          </Button>
        </div>
      </div>
    </div>
  )
}

const KitCard: FC<{ kit: Kit; selected: boolean; onSelect: () => void }> = ({
  kit,
  selected,
  onSelect,
}) => {
  const Icon = KIT_ICONS[kit.id]
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'relative flex flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:border-[var(--accent-orange)]/50',
        selected &&
          'border-[var(--accent-orange)] ring-1 ring-[var(--accent-orange)]',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-[var(--accent-orange)]" />
        <span className="font-medium">{kit.name}</span>
        {selected && (
          <Check className="ml-auto h-4 w-4 text-[var(--accent-orange)]" />
        )}
      </div>
      <p className="text-muted-foreground text-sm">{kit.description}</p>
      <p className="line-clamp-1 text-muted-foreground/80 text-xs">
        {kit.sites.map((site) => site.title).join(' · ')}
      </p>
    </button>
  )
}

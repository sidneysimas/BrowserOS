import { Globe, LayoutGrid, X } from 'lucide-react'
import type { FC } from 'react'
import { Link } from 'react-router'
import { getFavicons } from '@/lib/getFavicons'
import {
  removePinnedSite,
  useKitSelection,
  usePinnedSites,
} from '@/lib/kits/kit-storage'
import { SiteIcon } from './RecentSites'

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host
  } catch {
    return undefined
  }
}

/**
 * The "Seus sites" row: fixed tiles seeded by the MaestroOS kit (lib/kits),
 * shown above the history-based Recent sites. Until a kit is chosen or skipped
 * it shows an invite instead, which is how installs that onboarded before kits
 * existed reach the picker.
 */
export const PinnedSites: FC = () => {
  const selection = useKitSelection()
  const sites = usePinnedSites()

  // Still loading: render nothing rather than flash the invite.
  if (selection === undefined || sites === undefined) return null

  if (selection === null && sites.length === 0) {
    return (
      <Link
        to="/onboarding/kit?next=/home"
        className="mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-border/60 border-dashed bg-card/50 px-4 py-3 text-left transition-colors hover:border-[var(--accent-orange)]/50"
      >
        <LayoutGrid className="h-5 w-5 shrink-0 text-[var(--accent-orange)]" />
        <span className="text-sm">
          <span className="font-medium">
            Monte o MaestroOS para o seu trabalho.
          </span>{' '}
          <span className="text-muted-foreground">
            Escolha um kit com os sites do seu setor.
          </span>
        </span>
      </Link>
    )
  }

  if (sites.length === 0) return null

  return (
    <div className="space-y-4">
      <h2 className="text-center font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Seus sites
      </h2>
      <div className="flex flex-wrap items-center justify-center gap-6">
        {sites.map((site) => {
          const host = hostOf(site.url)
          const icon = host ? getFavicons(host) : undefined
          return (
            <div key={site.url} className="group relative">
              <a
                href={site.url}
                className="flex flex-col items-center gap-2 transition-transform hover:scale-110"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/50 bg-card shadow-sm transition-all group-hover:border-[var(--accent-orange)]/30 group-hover:shadow-md">
                  {icon ? (
                    <SiteIcon src={icon} alt={site.title} />
                  ) : (
                    <Globe className="h-7 w-7 text-foreground" />
                  )}
                </div>
                <span className="line-clamp-1 max-w-18 text-muted-foreground text-xs transition-colors group-hover:text-foreground">
                  {site.title}
                </span>
              </a>
              <button
                type="button"
                aria-label={`Remover ${site.title}`}
                onClick={() => removePinnedSite(site.url)}
                className="absolute -top-1.5 -right-1.5 hidden h-5 w-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground group-hover:flex"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import type { FC } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v3'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MAX_PINNED_SITES } from '@/lib/kits/kit-apply'
import { usePinnedSites } from '@/lib/kits/kit-hooks'
import {
  addPinnedSite,
  KitInputError,
  removePinnedSite,
} from '@/lib/kits/kit-storage'
import { findKit } from '@/lib/kits/kits'

const siteSchema = z.object({
  title: z.string().trim().min(1, 'Informe o nome').max(40),
  url: z
    .string()
    .trim()
    .url('Informe um endereço completo, com https://')
    .refine((value) => /^https?:\/\//.test(value), 'Use http:// ou https://'),
})

type SiteFormValues = z.infer<typeof siteSchema>

/** The "Seus sites" tiles of the new tab (screens/newtab/index/PinnedSites). */
export const MyKitSitesCard: FC = () => {
  const sites = usePinnedSites() ?? []
  const form = useForm<SiteFormValues>({
    resolver: zodResolver(siteSchema),
    defaultValues: { title: '', url: '' },
  })

  const onSubmit = async (values: SiteFormValues) => {
    try {
      await addPinnedSite(values)
      form.reset()
    } catch (error) {
      if (!(error instanceof KitInputError)) throw error
      form.setError('url', { message: error.message })
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="font-semibold">Sites da nova aba</h3>
      <p className="mb-4 text-muted-foreground text-sm">
        Aparecem em "Seus sites", acima dos sites recentes. Até{' '}
        {MAX_PINNED_SITES}.
      </p>

      {sites.length > 0 ? (
        <ul className="mb-5 divide-y rounded-lg border">
          {sites.map((site) => (
            <li key={site.url} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sm">{site.title}</div>
                <div className="truncate text-muted-foreground text-xs">
                  {site.url}
                  {site.kitId ? ` · kit ${findKit(site.kitId)?.name}` : ''}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover ${site.title}`}
                onClick={() => removePinnedSite(site.url)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-5 text-muted-foreground text-sm">Nenhum site ainda.</p>
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-start"
        >
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input placeholder="Intranet" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Endereço</FormLabel>
                <FormControl>
                  <Input placeholder="https://..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            className="sm:mt-[1.375rem]"
            disabled={form.formState.isSubmitting}
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </form>
      </Form>
    </section>
  )
}

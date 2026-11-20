import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import type { FC } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v3'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { KEYWORD_PATTERN } from '@/lib/kits/kit-apply'
import { useOmniboxCommands } from '@/lib/kits/kit-hooks'
import {
  addOmniboxCommand,
  KitInputError,
  removeOmniboxCommand,
} from '@/lib/kits/kit-storage'

const commandSchema = z.object({
  keyword: z
    .string()
    .trim()
    .toLowerCase()
    .regex(KEYWORD_PATTERN, 'Uma palavra: letras minúsculas, números ou hífen'),
  title: z.string().trim().min(1, 'Informe o nome').max(40),
  url: z
    .string()
    .trim()
    .url('Informe um endereço completo, com https://')
    .refine((value) => value.includes('{q}'), 'Inclua {q} onde entra o texto'),
})

type CommandFormValues = z.infer<typeof commandSchema>

/** Address-bar commands handled by entrypoints/background/omniboxCommands.ts. */
export const MyKitCommandsCard: FC = () => {
  const commands = useOmniboxCommands() ?? []
  const form = useForm<CommandFormValues>({
    resolver: zodResolver(commandSchema),
    defaultValues: { keyword: '', title: '', url: '' },
  })

  const onSubmit = async (values: CommandFormValues) => {
    try {
      await addOmniboxCommand(values)
      form.reset()
    } catch (error) {
      if (!(error instanceof KitInputError)) throw error
      form.setError('keyword', { message: error.message })
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="font-semibold">Comandos da barra de endereço</h3>
      <p className="mb-4 text-muted-foreground text-sm">
        Na barra de endereço, digite{' '}
        <kbd className="rounded border px-1">m</kbd>, espaço, o comando e o
        texto. Exemplo:{' '}
        <code className="rounded bg-muted px-1">m jus lei 8.112</code>. Qualquer
        outro texto depois do <code className="rounded bg-muted px-1">m</code>{' '}
        vira uma pergunta ao assistente.
      </p>

      {commands.length > 0 ? (
        <ul className="mb-5 divide-y rounded-lg border">
          {commands.map((command) => (
            <li
              key={command.keyword}
              className="flex items-center gap-3 px-3 py-2"
            >
              <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-sm">
                {command.keyword}
              </code>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sm">
                  {command.title}
                </div>
                <div className="truncate text-muted-foreground text-xs">
                  {command.url}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover o comando ${command.keyword}`}
                onClick={() => removeOmniboxCommand(command.keyword)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-5 text-muted-foreground text-sm">
          Nenhum comando ainda.
        </p>
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid gap-3 sm:grid-cols-[8rem_1fr_2fr_auto] sm:items-start"
        >
          <FormField
            control={form.control}
            name="keyword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Comando</FormLabel>
                <FormControl>
                  <Input placeholder="proc" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input placeholder="Consulta de processo" {...field} />
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
                  <Input placeholder="https://...?numero={q}" {...field} />
                </FormControl>
                <FormDescription>
                  {'{q}'} recebe o texto digitado.
                </FormDescription>
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

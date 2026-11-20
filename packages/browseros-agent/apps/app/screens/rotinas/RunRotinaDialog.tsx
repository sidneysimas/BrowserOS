import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, PanelRight, Play } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v3'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { extractInputNames, type RotinaMeta } from '@/lib/rotinas/rotinas'

/** Where a manual run happens: unattended with the result in the history, or
 * in the side panel where the user watches and can confirm write actions. */
export type RotinaRunTarget = 'background' | 'panel'

export interface RunRotinaDialogProps {
  rotina: { name: string; meta: RotinaMeta } | null
  onOpenChange: (open: boolean) => void
  onRun: (
    values: Record<string, string>,
    target: RotinaRunTarget,
  ) => Promise<void>
}

const valuesSchema = z.object({ values: z.record(z.string()) })
type ValuesForm = z.infer<typeof valuesSchema>

/** Asks for the rotina's `{{inputs}}` before a manual run. */
export const RunRotinaDialog: FC<RunRotinaDialogProps> = ({
  rotina,
  onOpenChange,
  onRun,
}) => {
  const [running, setRunning] = useState<RotinaRunTarget | null>(null)
  const names = rotina ? extractInputNames(rotina.meta.steps) : []
  const form = useForm<ValuesForm>({
    resolver: zodResolver(valuesSchema),
    defaultValues: { values: {} },
  })

  useEffect(() => {
    if (rotina) form.reset({ values: { ...rotina.meta.inputDefaults } })
  }, [rotina, form])

  const submit = (target: RotinaRunTarget) =>
    form.handleSubmit(async ({ values }) => {
      const empty = names.filter((name) => !values[name]?.trim())
      if (empty.length > 0) {
        for (const name of empty) {
          form.setError(`values.${name}`, { message: 'Preencha este valor' })
        }
        return
      }
      setRunning(target)
      try {
        await onRun(values, target)
        onOpenChange(false)
      } finally {
        setRunning(null)
      }
    })

  const isWrite = rotina?.meta.effects === 'write'

  return (
    <Dialog open={rotina !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rodar "{rotina?.name}"</DialogTitle>
          <DialogDescription>
            Informe os valores desta execução.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="space-y-3"
            onSubmit={submit(isWrite ? 'panel' : 'background')}
          >
            {names.map((name) => (
              <FormField
                key={name}
                control={form.control}
                name={`values.${name}`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">{name}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <DialogFooter className="gap-2 pt-2">
              {!isWrite && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={running !== null}
                  onClick={submit('panel')}
                >
                  <PanelRight className="h-4 w-4" />
                  Acompanhar no painel
                </Button>
              )}
              <Button type="submit" disabled={running !== null}>
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isWrite ? (
                  <PanelRight className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {isWrite ? 'Rodar no painel' : 'Rodar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { type FC, useEffect } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { extractInputNames } from '@/lib/rotinas/rotinas'
import {
  EMPTY_ROTINA_FORM,
  type RotinaFormInput,
  type RotinaFormValues,
  rotinaFormSchema,
} from './rotina-form'

export interface RotinaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Values to edit; null creates a new rotina. */
  initialValues: RotinaFormInput | null
  isEditing: boolean
  onSave: (values: RotinaFormValues) => Promise<void>
}

/**
 * Create/edit form for a rotina. Inputs are not declared separately: every
 * `{{name}}` typed in a step becomes an input, and a default-value field for it
 * appears below the steps, so the steps stay the single source of truth.
 */
export const RotinaDialog: FC<RotinaDialogProps> = ({
  open,
  onOpenChange,
  initialValues,
  isEditing,
  onSave,
}) => {
  const form = useForm<RotinaFormInput, unknown, RotinaFormValues>({
    resolver: zodResolver(rotinaFormSchema),
    defaultValues: EMPTY_ROTINA_FORM,
  })
  const steps = useFieldArray({ control: form.control, name: 'steps' })

  useEffect(() => {
    if (open) form.reset(initialValues ?? EMPTY_ROTINA_FORM)
  }, [open, initialValues, form])

  const stepTexts = form.watch('steps').map((step) => step.text)
  const inputNames = extractInputNames(stepTexts)
  const schedule = form.watch('schedule')

  const onSubmit = async (values: RotinaFormValues) => {
    await onSave(values)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar rotina' : 'Nova rotina'}
          </DialogTitle>
          <DialogDescription>
            Descreva os passos como explicaria a um colega. O assistente segue
            em ordem e se adapta se o site mudar um pouco.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Conferir situação do CNPJ" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Objetivo (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Para que serve esta rotina"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <div className="font-medium text-sm">Passos</div>
              {steps.fields.map((step, index) => (
                <div key={step.id} className="flex items-start gap-2">
                  <span className="mt-2 w-5 shrink-0 text-right text-muted-foreground text-sm">
                    {index + 1}.
                  </span>
                  <FormField
                    control={form.control}
                    name={`steps.${index}.text`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Textarea
                            rows={1}
                            className="min-h-9 resize-y"
                            placeholder={
                              index === 0
                                ? 'Abra o site da Receita e pesquise o CNPJ {{cnpj}}'
                                : 'Próximo passo'
                            }
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="flex shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Subir passo"
                      disabled={index === 0}
                      onClick={() => steps.move(index, index - 1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Descer passo"
                      disabled={index === steps.fields.length - 1}
                      onClick={() => steps.move(index, index + 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remover passo"
                      disabled={steps.fields.length === 1}
                      onClick={() => steps.remove(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => steps.append({ text: '' })}
                >
                  <Plus className="h-4 w-4" />
                  Adicionar passo
                </Button>
                <span className="text-muted-foreground text-xs">
                  Use {'{{nome}}'} para um valor que muda a cada execução.
                </span>
              </div>
              <FormMessage>
                {form.formState.errors.steps?.root?.message ??
                  form.formState.errors.steps?.message}
              </FormMessage>
            </div>

            {inputNames.length > 0 && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="font-medium text-sm">Entradas</div>
                <p className="text-muted-foreground text-xs">
                  Ao rodar manualmente você digita cada valor. O padrão é
                  sugerido e é o que as execuções agendadas usam.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {inputNames.map((name) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={`inputDefaults.${name}`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs">
                            {name}
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Valor padrão"
                              {...field}
                              value={field.value ?? ''}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="effects"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>O que a rotina faz</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="read">
                          Só consulta informações
                        </SelectItem>
                        <SelectItem value="write">
                          Envia, publica ou altera algo
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {field.value === 'write'
                        ? 'Pede sua confirmação antes de enviar. Agendada, só prepara e não envia.'
                        : 'O assistente é instruído a não enviar nem alterar nada.'}
                    </FormDescription>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hosts"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sites permitidos (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="gov.br, receita.fazenda.gov.br"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Separe por vírgula. Vazio deixa o assistente livre.
                    </FormDescription>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="schedule"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quando rodar</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="manual">
                          Só quando eu mandar
                        </SelectItem>
                        <SelectItem value="daily">
                          Todo dia, num horário
                        </SelectItem>
                        <SelectItem value="hourly">A cada N horas</SelectItem>
                        <SelectItem value="minutes">
                          A cada N minutos
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {schedule === 'daily' && (
                <FormField
                  control={form.control}
                  name="scheduleTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Horário</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {(schedule === 'hourly' || schedule === 'minutes') && (
                <FormField
                  control={form.control}
                  name="scheduleInterval"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {schedule === 'hourly' ? 'Horas' : 'Minutos'}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={60}
                          {...field}
                          value={String(field.value ?? '')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {isEditing ? 'Salvar' : 'Criar rotina'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

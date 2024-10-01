import { commands } from '@/bindings'
import { GetStartedMachineContext } from '@/context'
import { simulateDelay } from '@/helpers'
import { useSetWalletMutation } from '@/hooks'
import { FieldApi, useForm } from '@tanstack/react-form'
import { zodValidator } from '@tanstack/zod-form-adapter'
import { z } from 'zod'
import { Alert, AlertDescription } from '../ui/alert'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card'
import { FormMutationError } from '../ui/form-mutation-error'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SubmitButton } from '../ui/submit-button'

type FormValues = {
  receiveDescriptor: string
  changeDescriptor: string
}

type ValidatorType = ReturnType<typeof zodValidator>

// We don't use a field validator, hence the third type is "undefined"
const FieldInfo = ({ field }: { field: FieldApi<FormValues, keyof FormValues, undefined, ValidatorType> }) => {
  const { isTouched, errors } = field.state.meta

  return (
    <div className="m-2">
      {isTouched && errors.length > 0 ? (
        <Alert variant="destructive" className="flex justify-center p-1">
          <AlertDescription>{errors.join(', ')}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

export const DescriptorForm = () => {
  const getStartedActorRef = GetStartedMachineContext.useActorRef()
  const mutation = useSetWalletMutation()

  const form = useForm<FormValues, ValidatorType>({
    validatorAdapter: zodValidator(),
    defaultValues: {
      receiveDescriptor: '',
      changeDescriptor: '',
    },
    onSubmit: async ({ value }) => {
      mutation.mutate(value, {
        onSuccess: async () => {
          await simulateDelay(1200) // to show the success button
          getStartedActorRef.send({ type: 'NEXT' })
        },
      })
    },
  })

  const handleTestMachineClick = () => {
    getStartedActorRef.send({ type: 'NEXT' })
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <CardTitle>Wallet Info</CardTitle>
          <CardDescription>Enter your descriptors below</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <form.Field
            name="receiveDescriptor"
            validators={{
              onChange: z.string().min(1, 'Field is required'),
              onChangeAsyncDebounceMs: 1000,
              onChangeAsync: async ({ value }) => {
                const result = await commands.verifyDescriptor(value)
                if (result.status !== 'ok') {
                  return 'Invalid descriptor'
                }
                return undefined // No errors
              },
            }}
            children={(field) => (
              <>
                <Label className="text-foreground mb-2" htmlFor={field.name}>
                  Receive Descriptor
                </Label>
                <Input
                  className="px-4 py-2"
                  id={field.name}
                  type="text"
                  value={field.state.value}
                  onChange={(e) => {
                    field.handleChange(e.target.value)
                    // This makes the mutation error disappear upon re-entry of input
                    if (mutation.error) {
                      mutation.reset()
                    }
                  }}
                />
                <Label className="text-muted-foreground text-xs">
                  This is required. A multisig change descriptor typically starts with <code>wsh(multi(...))</code> and ends
                  with <code>/0/*</code> and a checksum.
                </Label>
                <FieldInfo field={field} />
              </>
            )}
          />
          <form.Field
            name="changeDescriptor"
            children={(field) => (
              <>
                <Label className="text-foreground mb-2" htmlFor={field.name}>
                  Change Descriptor
                </Label>
                <Input
                  className="px-4 py-2"
                  id={field.name}
                  type="text"
                  value={field.state.value}
                  onChange={(e) => {
                    field.handleChange(e.target.value)
                    if (mutation.error) {
                      mutation.reset()
                    }
                  }}
                />
                <Label className="text-muted-foreground text-xs">
                  This is optional. A multisig change descriptor typically starts with <code>wsh(multi(...))</code> and ends
                  with <code>/1/*</code> and a checksum.
                </Label>
                <FieldInfo field={field} />
              </>
            )}
          />
          <FormMutationError mutation={mutation} />
        </CardContent>
        <CardFooter className="flex justify-between gap-2">
          <Button variant="secondary" onClick={handleTestMachineClick}>
            Testing
          </Button>
          <form.Subscribe selector={(state) => [state.canSubmit]}>
            {([canSubmit]) => {
              return (
                <SubmitButton type="submit" mutation={mutation} disabled={!canSubmit}>
                  Submit
                </SubmitButton>
              )
            }}
          </form.Subscribe>
        </CardFooter>
      </Card>
    </form>
  )
}

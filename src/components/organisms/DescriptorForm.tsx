import { GetStartedMachineContext } from '@/context'
import { useForm } from '@tanstack/react-form'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

export const DescriptorForm = () => {
  const getStartedActorRef = GetStartedMachineContext.useActorRef()

  const form = useForm({
    defaultValues: {
      receive: '123',
      change: '456',
    },
  })

  const handleTestMachineClick = () => {
    getStartedActorRef.send({ type: 'NEXT' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Wallet Info</CardTitle>
        <CardDescription>Enter your descriptors below</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          <div>
            <Label className="text-foreground mb-2" htmlFor="receive-descriptor">
              Receive Descriptor
            </Label>
            <Input className="px-4 py-2" id="receive" type="text" />
          </div>
          <div>
            <Label className="text-foreground mb-2" htmlFor="change-descriptor">
              Change Descriptor
            </Label>
            <Input className="px-4 py-2" id="change" type="text" />
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex justify-between gap-2">
        <Button variant="destructive" onClick={form.reset}>
          Reset
        </Button>
        <Button variant="secondary" onClick={handleTestMachineClick}>
          Testing
        </Button>
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isValidating]}
          children={([canSubmit, isValidating]) => (
            <Button onClick={form.handleSubmit} disabled={!canSubmit || isValidating}>
              Submit
            </Button>
          )}
        />
      </CardFooter>
    </Card>
  )
}

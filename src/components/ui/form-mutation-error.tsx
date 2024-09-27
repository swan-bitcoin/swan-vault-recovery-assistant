// own creation
import { useMutationErrorMessage } from '@/hooks'
import { Alert, AlertDescription } from './alert'
import { Collapsible } from './collapsible'
import { UseMutationResult } from '@tanstack/react-query'

const Error = ({ mutation, ...props }: { mutation: UseMutationResult }) => {
  const { isError } = mutation
  const message = useMutationErrorMessage(mutation)

  if (!isError) {
    return null
  }

  return (
    <Alert variant="destructive" {...props}>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

export const FormMutationError = ({ mutation, ...props }: { mutation: UseMutationResult }) => {
  const { isError } = mutation

  return (
    <div className="min-h-14">
      <Collapsible open={isError} className={`transition-opacity duration-300 ${isError ? 'opacity-100' : 'opacity-0'}`}>
        <Error mutation={mutation} {...props} />
      </Collapsible>
    </div>
  )
}

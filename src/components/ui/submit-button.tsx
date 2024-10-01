/*
 * @author moneymanolis
 * <description>
 */
import { Button, ButtonProps } from '@/components/ui/button'; // Adjust the import path as necessary
import type { UseMutationResult } from '@tanstack/react-query'
import { CheckCircle, Loader2 } from 'lucide-react'
import { createContext, forwardRef, useContext, useLayoutEffect, useRef, useState } from 'react'

type SubmitButtonContextType = {
  mutation: UseMutationResult
} | null

const SubmitButtonContext = createContext<SubmitButtonContextType>(null)

const useSubmitButtonContext = () => {
  const context = useContext(SubmitButtonContext)
  if (!context) {
    throw new Error('SubmitButtonContext is not available')
  }
  return context
}

const useSubmitMutation = () => {
  const { mutation } = useSubmitButtonContext()
  return mutation
}

const Idle = forwardRef<HTMLButtonElement, ButtonProps>(({ children, ...props }, ref) => {
  const { isSuccess, isPending } = useSubmitMutation()

  if (isSuccess) {
    return null
  }

  if (isPending) {
    return null
  }

  return (
    <Button type="submit" ref={ref} {...props}>
      {children}
    </Button>
  )
})

const Pending = (props: ButtonProps) => {
  const { isPending } = useSubmitMutation()

  if (!isPending) {
    return null
  }

  return (
    <Button {...props} disabled>
      <Loader2 className="h-4 w-4 animate-spin" />
    </Button>
  )
}

const Success = (props: ButtonProps) => {
  const { isSuccess } = useSubmitMutation()

  if (!isSuccess) {
    return null
  }

  return (
    <Button {...props} className="bg-green-500 pointer-events-none">
      <CheckCircle className="h-4 w-4 text-white animate-success" />
    </Button>
  )
}

export type SubmitButtonProps = {
  mutation: UseMutationResult
  children: JSX.Element | string
} & ButtonProps

// Losely based on: https://www.kulik.io/2024/09/18/building-a-loading-button-in-react-with-typescript-shadcnui-and-tailwindcss/
const SubmitButton = ({ mutation, children, ...props }: SubmitButtonProps) => {
  const [buttonWidth, setButtonWidth] = useState<number | undefined>(undefined)
  const buttonRef = useRef<HTMLButtonElement>()

  // Calculate the width of the idle button when it's rendered.
  // This width is then used for the pending and success buttons to ensure the width does not jump.
  useLayoutEffect(() => {
    if (buttonRef.current) {
      setButtonWidth(buttonRef.current.offsetWidth)
    }
  }, [])

  const buttonWidthStyle = buttonWidth ? { minWidth: buttonWidth } : undefined

  return (
    <SubmitButtonContext.Provider value={{ mutation }}>
      <Success {...props} style={{ ...buttonWidthStyle }} />
      <Pending {...props} style={{ ...buttonWidthStyle }} />
      <Idle {...props} ref={buttonRef} style={{ ...buttonWidthStyle }}>
        {children}
      </Idle>
    </SubmitButtonContext.Provider>
  )
}

SubmitButton.Idle = Idle
SubmitButton.Pending = Pending
SubmitButton.Success = Success

export { SubmitButton }

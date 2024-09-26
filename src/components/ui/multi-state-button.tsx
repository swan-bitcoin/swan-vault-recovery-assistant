import { Button, ButtonProps } from '@/components/ui/button'
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { forwardRef, useLayoutEffect, useRef, useState } from 'react'

type MultiStateButtonProps = ButtonProps & {
  isLoading?: boolean
  isSuccess?: boolean
  isError?: boolean
}

const BaseButton = forwardRef<HTMLButtonElement, ButtonProps>(({ children, ...props }, ref) => {
  return (
    <Button ref={ref} {...props}>
      {children}
    </Button>
  )
})

const LoadingButton = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  return (
    <Button ref={ref} {...props} disabled>
      <Loader2 className="h-4 w-4 animate-spin" />
    </Button>
  )
})

const SuccessButton = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  return (
    <Button ref={ref} {...props} className="bg-green-500 pointer-events-none">
      <CheckCircle className="h-4 w-4 text-white" />
    </Button>
  )
})

const ErrorButton = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  return (
    <Button ref={ref} {...props} variant="destructive" className="pointer-events-none">
      <AlertTriangle className="h-4 w-4" />
    </Button>
  )
})

export const MultiStateButton = (props: MultiStateButtonProps) => {
  const { isLoading, isSuccess, isError, disabled, style, children, ...rest } = props
  const [buttonWidth, setButtonWidth] = useState<number | undefined>(undefined)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (buttonRef.current) {
      setButtonWidth(buttonRef.current.offsetWidth)
    }
  }, [])

  const buttonWidthStyle = buttonWidth ? { minWidth: buttonWidth } : undefined

  if (isLoading) {
    return <LoadingButton {...rest} ref={buttonRef} style={{ ...style, ...buttonWidthStyle }} />
  }

  if (isSuccess) {
    return <SuccessButton {...rest} ref={buttonRef} style={{ ...style, ...buttonWidthStyle }} />
  }

  if (isError) {
    return <ErrorButton {...rest} ref={buttonRef} style={{ ...style, ...buttonWidthStyle }} />
  }

  return (
    <BaseButton {...rest} ref={buttonRef} style={{ ...style, ...buttonWidthStyle }}>
      {children}
    </BaseButton>
  )
}

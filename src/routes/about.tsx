import { createFileRoute } from '@tanstack/react-router'

// TODO: Add about component
export const Route = createFileRoute('/about')({
  component: () => <div>Hello from the /about route!</div>,
})

import { Balance } from '@/components/pages'
import { createFileRoute } from '@tanstack/react-router'

// This is just a preliminary version to verify via getting the balance that everything works so far!
export const Route = createFileRoute('/balance')({
  component: Balance,
})

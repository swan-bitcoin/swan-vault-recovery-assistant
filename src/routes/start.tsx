import { GetStarted } from '@/components/pages'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/start')({
  component: GetStarted
})
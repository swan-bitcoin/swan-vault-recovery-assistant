import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator,
    DropdownMenuShortcut, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useNavigate } from '@tanstack/react-router'

export const UserMenu = () => {
  const navigate = useNavigate()
  const openAboutPage = () => {
    navigate({ to: '/about' }) // This will navigate to the /about route
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        asChild
        className="border-primary bg-cool-base-200 hover:bg-cool-base-300 rounded-5 border mr-3"
      >
        <Button variant="outline">Open</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="mr-2 bg-diamond-hands-blue-100 rounded-2">
        <DropdownMenuLabel>My Tempura Wallet</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          Settings
          <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          Backup
          <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>GitHub</DropdownMenuItem>
        <DropdownMenuItem>Support</DropdownMenuItem>
        <DropdownMenuItem onSelect={openAboutPage}>About</DropdownMenuItem>
        <DropdownMenuItem disabled>API (coming soon)</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          Quit
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

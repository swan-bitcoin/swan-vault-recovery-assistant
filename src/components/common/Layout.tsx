import type { ReactNode } from 'react'
import { AppHeader } from './AppHeader'
import { SideNavigation } from './SideNavigation'

export const Layout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="bg-neutral-base-0 flex min-h-dvh border-primary w-full">
      <AppHeader />
      <div className="relative flex min-h-full min-w-full">
        <div className="border-primary fixed bottom-0 top-10 w-[250px] border-r p-4">
          <SideNavigation />
        </div>
        {/* Main Content */}
        <div className="ml-[250px] flex-1 flex-grow pt-10">{children}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------
// |                     AppHeader                   |
// ---------------------------------------------------
// | SideNavigation  |         Main Content (Outlet)  |
// | (250px width)   |         (remaining space)      |
// |                 |                                |
// ---------------------------------------------------

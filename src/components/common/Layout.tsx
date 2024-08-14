import { Outlet } from '@tanstack/react-router'
import { AppHeader } from './AppHeader'
import { SideNavigation } from './SideNavigation'

export const Layout = () => {
  return (
    <div className="bg-neutral-base-0 flex min-h-dvh">
      <AppHeader />
      <div className="relative flex min-h-full min-w-full">
        <div className="border-primary fixed bottom-0 top-10 w-[250px] border-r p-4">
          <SideNavigation />
        </div>
        <div className="ml-[250px] flex-1 flex-grow pt-10">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

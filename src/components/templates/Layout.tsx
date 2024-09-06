import React from 'react'
import { AppHeader, SideNavigation } from '../organisms'

export const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppHeader />
      <div className="relative flex min-h-full min-w-full">
        <div className="fixed bottom-0 top-10 w-[250px] border-r border-primary p-4">
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

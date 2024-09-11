import { Outlet } from '@tanstack/react-router'
import { Layout } from './components/templates/Layout'
import { GetStartedMachineContext, ThemeProvider } from './context'

export const App = () => {
  return (
    <ThemeProvider>
      <GetStartedMachineContext.Provider>
        <Layout>
          <Outlet />
        </Layout>
      </GetStartedMachineContext.Provider>
    </ThemeProvider>
  )
}

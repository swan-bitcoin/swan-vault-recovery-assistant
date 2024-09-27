import { Outlet } from '@tanstack/react-router'
import { Layout } from './components/templates/Layout'
import { GetStartedMachineContext, ThemeProvider } from './context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export const queryClient = new QueryClient()

export const App = () => {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <GetStartedMachineContext.Provider>
          <Layout>
            <Outlet />
          </Layout>
        </GetStartedMachineContext.Provider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

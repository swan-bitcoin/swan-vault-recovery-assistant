import { Outlet } from '@tanstack/react-router'
import { Layout } from './components/templates/Layout'
import { GetStartedMachineContext, ThemeProvider } from './context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

export const queryClient = new QueryClient()

export const App = () => {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ReactQueryDevtools initialIsOpen={false} />
        <GetStartedMachineContext.Provider>
          <Layout>
            <Outlet />
          </Layout>
        </GetStartedMachineContext.Provider>
        <ReactQueryDevtools />
      </QueryClientProvider>
    </ThemeProvider>
  )
}

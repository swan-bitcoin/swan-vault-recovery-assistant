import { Outlet } from '@tanstack/react-router'
import { Layout } from './components/templates/Layout'
import { ThemeProvider } from './context'

export const App = () => {
  return (
    <ThemeProvider>
      <Layout>
        <Outlet />
      </Layout>
    </ThemeProvider>
  )
}

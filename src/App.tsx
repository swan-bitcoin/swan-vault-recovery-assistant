import { Outlet } from '@tanstack/react-router'
import { Layout } from './components'

export const App = () => {
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}

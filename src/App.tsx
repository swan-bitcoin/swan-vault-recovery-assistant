import { Button } from '@/components/ui/button'

export const App = () => {
  return (
    <div className="flex min-h-dvh bg-gray-400">
      <div className="fixed left-0 right-0 top-0 z-30 flex h-10 items-center justify-between border-b px-6">
        Some App Header
      </div>
      <div className="relative w-[250px] flex min-h-full min-w-full">
        <div className="fixed bottom-0 top-10 border-r p-4`">
          <ul className="m-4">
            <li>Some Link</li>
            <li>Another Link</li>
            <li>And another one</li>
          </ul>
        </div>
        <div className="ml-[250px] flex-1 flex-grow pt-10">
          <div>
            <h1 className="mb-2">Here will the components go!</h1>
            <Button>Click me</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

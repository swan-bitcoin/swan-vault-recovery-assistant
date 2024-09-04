import { TempuraIcon } from '../icons'
import { ThemeMenu } from './ThemeMenu'

export const AppHeader = () => {
  return (
    <div className="border-primary fixed left-0 right-0 top-0 z-30 flex h-10 items-center justify-between border-b gap-2">
      <div className="w-10 h-10 rounded-full overflow-hidden">
        <TempuraIcon className="w-full h-full" />
      </div>
      <div>
        <ThemeMenu />
      </div>
    </div>
  )
}

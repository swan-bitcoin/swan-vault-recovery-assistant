import { Link, LinkProps, RegisteredRouter } from '@tanstack/react-router'
import clsx from 'clsx';

const NavigationListItem = ({ label, path }: { label: string; path: LinkProps<RegisteredRouter>['to'] }) => {
  return (
    <li>
      <Link
        to={path}
        className="mb-3 flex items-center text-base font-medium hover:underline text-secondary [&.active]:text-primary"
      >
        {({ isActive }) => {
          return (
            <>
              <div className={`bg-neutral-base-25 flex h-7 w-7 items-center justify-center rounded-full`}>
                <div
                  className={clsx('h-2 w-2 rounded-full', isActive ? 'bg-brand-action-blue-500' : 'bg-neutral-base-150')}
                />
              </div>
              <span className="ml-2">{label}</span>
            </>
          )
        }}
      </Link>
    </li>
  )
}

export const SideNavigation = () => {
  return (
    <ul className="ml-4 mt-4">
      <NavigationListItem label="Home" path="/" />
      <NavigationListItem label="About" path="/about" />
    </ul>
  )
}

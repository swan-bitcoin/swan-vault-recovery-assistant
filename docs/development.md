# Frontend Overview

The frontend of this project is built using React and TypeScript. For styling and layout, we utilize **Tailwind CSS** and **shadcn/ui**. We use the "CSS-variables-approach" for theming in **shadcn/ui**. For more details on this see the [shadcn-documentation](https://ui.shadcn.com/docs/theming) or [this YouTube-snippet](https://youtu.be/ABbww4CFQSo?feature=shared&t=62).

We mostly adopt the **Atomic Design** principle (for more on this see [here](https://rjroopal.medium.com/atomic-design-pattern-structuring-your-react-application-970dd57520f8)), with components divided into **UI** (the standard folder from **shadcn/ui** where we put **Atoms** and **Molecules** in one folder), **Organisms**, **Templates**, and **Pages**. Here's the breakdown:

## Folder Structure

### `/ui` - Atoms & Molecules

- **Purpose**: Reusable, low-level UI components (e.g., buttons, dropdowns).
- **Example**: `button.tsx` is an Atom, and `dropdown-menu.tsx` is a Molecule.

### `/organisms` - Complex Components

- **Purpose**: Combine multiple UI elements to create functional parts of the app.
- **Example**: `AppHeader.tsx` and `ThemeMenu.tsx`

### `/templates` - Layouts

- **Purpose**: Provide page layouts that organize content and components.
- **Example**: `Layout.tsx`

### `/pages` - Page Components

- **Purpose**: Full pages that combine templates, organisms, and other components.
- **Example**: To be added ...

## Routing

We use **TanStack Router** for routing in our React application. The biggest advantage of TanStack Router is its **full type safety**, which ensures that routes and navigation are strongly typed and error-free. We implement it using the recommended file-based route generation approach.

## State Management

To be added ...

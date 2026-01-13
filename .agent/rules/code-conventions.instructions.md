# Code Conventions

## General Guidelines

- Use clear, descriptive, and meaningful names.
- Follow a consistent naming convention throughout the codebase.
- Avoid using abbreviations unless they are well-known and widely accepted.
- Use English for all names.
- Always use internationalization for all texts.
- Always comment by English.
- Always write documents by English.
- Always return messages by English to APIs
- Don't start app to check issues unless otherwise specified.

## TypeScript Guidelines

- Use TypeScript for all new code.
- Follow functional programming principles where possible.
- Always use arrow function.
- Use interfaces for data structures and type definitions.
- Prefer immutable data (const, readonly).
- Use optional chaining (?.) and nullish coalescing (??) operators.
- Don't use `any`, try to explicitly define types instead.

## React Guidelines

- Use functional components with hooks.
- Follow the React hooks rules (no conditional hooks).
- Use React.FC type for components with children.
- Keep components small and focused.

<!-- ## Regular File and Directory Naming

- Use kebab-case for regular file and directory names.
- Example: `app-button`, `app-error-boundary`, `main-layout`. -->

## Variable Naming

- Use camelCase for variable names.
- Example: `userName`, `isLoggedIn`, `fetchData`.

## State variables

- Prefix state variables with `is`, `has`, or `should` to denote boolean values.
- Example: `isActive`, `hasError`, `shouldRender`.

## Function Naming

- Use camelCase for function names.
- Use verbs to indicate actions.
- Example: `getUserData`, `handleClick`, `fetchPosts`.

## Event handlers

- Use handle as a prefix for event handler functions.
- Example: `handleClick`, `handleInputChange`.

## Class/Interface/Types/Enums Naming

- Use PascalCase for Class/Interface/Types/Enums names.
- Interface should start with the prefix `I`.
- Types should start with the prefix `T`.
- Enums should start with the prefix `E`.
- Example: `UserProfile`, `IAppButtonProps`, `TChartProps`, `EGender`.

## Component Naming

- Use PascalCase for React component names.
- Common components in src/components/ must start with `App`.
- Example: `AppButton`, `AppErrorBoundary`.

## Constant Naming

- Use UPPER_SNAKE_CASE for constant names.
- Example: `API_BASE_URL`, `DEFAULT_TIMEOUT`, `MAX_RETRIES`.

## Styling

- Use `Chakra UI` for component creating.
- Use the components of `@chakra-ui/react` with version 3.
- Use inline styles for styling, don't use CSS classes.

## Form & Validation

- Use `react-hook-form` for form management.
- Use `zod` for schema validation.
- Use `Field` from `@chakra-ui/react` to add labels, help text, and error messages to form fields.
- Use `PasswordInput` from `@chakra-ui/react` for password fields.

## State Management

- Use `zustand` for state management.

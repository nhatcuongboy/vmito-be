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

## File Size Guidelines

### Context: Gradual Refactoring Approach

**Current State:** The codebase contains many large files (500-1000+ lines) that need gradual refactoring. These existing files are **legacy code** and will be improved over time.

**Going Forward:** New code and modifications should follow stricter guidelines to prevent the problem from growing.

### Rules for NEW Code and Major Modifications

When **creating new files** or **substantially refactoring existing ones** (50%+ changes):

**Backend (NestJS):**
- Controllers: 150-250 lines (max 300)
- Services: 200-400 lines (max 500 for complex services)
- DTOs/Entities: 50-150 lines (max 200)
- Modules: 50-100 lines (max 150)
- Utils/Helpers: 100-200 lines (max 300)

**Key Principle:** If you're writing a new service/controller from scratch, keep it under the max threshold. If you can't, it's a sign of poor design or missing separation of concerns.

### Rules for EXISTING Large Files

For files that already exceed 500 lines:

**When making SMALL changes** (bug fixes, minor features):
- ✅ Make the change without refactoring the whole file
- ✅ Try to keep the new code clean and modular
- ⚠️ If adding 100+ lines to an already large file, consider extracting the new logic to a separate file instead

**When making MEDIUM changes** (new feature in existing service):
- 🎯 **Opportunistic refactoring**: If you're touching a large section, extract it to a separate service/helper
- Extract only what you're modifying — don't refactor unrelated code
- Example: If adding a new complex calculation to a 600-line service, extract that logic to a helper function or separate utility

**When making LARGE changes** (major feature, major bug fix):
- 🎯 **Mandatory refactoring**: Break down the file as part of your work
- Split by responsibility, domain, or feature
- Aim to get the file under 500 lines if feasible

### Progressive Refactoring Strategy

**Priority Levels:**
1. **Critical** (refactor when touched): Files > 800 lines
2. **High** (refactor during medium/large changes): Files 600-800 lines
3. **Medium** (refactor opportunistically): Files 500-600 lines
4. **Low** (leave alone unless major changes): Files 400-500 lines

**When NOT to Refactor:**
- Emergency hotfixes
- Code freeze periods
- Files that rarely change and work well
- When deadline pressure is high (but plan to refactor later)

### Signs a File Needs Refactoring

- More than 500 lines
- Too many responsibilities (violates Single Responsibility Principle)
- Difficult to locate specific functions/methods
- More than 20-30 import statements
- Requires excessive scrolling to understand logic
- Multiple developers struggle to work on it simultaneously
- Complex business logic mixed with infrastructure concerns

### Refactoring Strategies

**For Services:**
- Extract domain logic to separate domain services
- Move utility functions to dedicated helper files
- Split large services by feature or subdomain
- Use composition: inject smaller services into larger ones

**For Controllers:**
- Keep controllers thin — move logic to services
- Group related endpoints by feature
- Extract validation logic to pipes or guards

**For Modules:**
- Split large modules by feature or domain
- Use dynamic modules for complex configurations
- Create feature modules with clear boundaries

### Commit Message Convention

When refactoring for file size:
- `refactor: split TournamentService into scheduling and registration services`
- `refactor(session): extract court assignment logic to helper`

This helps track refactoring progress over time.

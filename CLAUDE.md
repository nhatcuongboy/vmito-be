### Debug

- The app is already running at http://localhost:3001, don't run the start command anymore, just open it and check/debug. If this port isn't running, please start it.

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
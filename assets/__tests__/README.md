# Asset Module Tests

This directory contains unit tests for the TypeScript modules in the `assets` folder.

## Running Tests

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test debug.test.ts
```

## Test Structure

Each module has a corresponding test file:
- `debug.test.ts` - Tests for debug logging utilities
- `searchContext.test.ts` - Tests for search context persistence
- `map-tools.test.ts` - Tests for map marker utilities
- `fb.test.ts` - Tests for FlatGeoBuf spatial indexing

## Writing Tests

Tests are written using Vitest and follow these conventions:

1. **File naming**: `[module-name].test.ts`
2. **Structure**: Use `describe` blocks for grouping related tests
3. **Happy path focus**: Current tests focus on successful scenarios
4. **Extensible design**: Tests are structured to easily add error cases

### Example Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { myFunction } from '../myModule';

describe('myModule', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  describe('myFunction', () => {
    it('should handle happy path scenario', () => {
      const result = myFunction('input');
      expect(result).toBe('expected output');
    });

    // Error cases can be added here later
    describe('error handling', () => {
      it.todo('should handle invalid input gracefully');
    });
  });
});
```

## Test Utilities

The `test-utils.ts` file provides reusable test utilities:

- `createMockElement()` - Create DOM elements for testing
- `createMockFetchResponse()` - Mock fetch responses
- `createMockMap()` - Mock MapLibre map instances
- `LocalStorageMock` - Mock localStorage implementation
- `flushPromises()` - Wait for promise resolution
- And more...

## Coverage

To view test coverage:

```bash
npm run test:coverage
```

This will generate a coverage report in the `coverage` directory.

## Adding New Tests

When adding tests for new modules:

1. Create a new test file following the naming convention
2. Import necessary testing utilities from `vitest` and `test-utils.ts`
3. Focus on happy path scenarios first
4. Structure tests to make adding error cases easy later
5. Run tests to ensure they pass
6. Update this README if needed

## Mocking

Common mocks are set up in `setup.ts`:
- `localStorage` - Mocked with full functionality
- `console` methods - Mocked to keep test output clean
- Environment variables - `VITE_DEBUG` set to false by default

## Tips

- Use `vi.mock()` for module mocking
- Use `beforeEach` to reset state between tests
- Keep tests focused and independent
- Test behavior, not implementation details
- Use descriptive test names that explain what is being tested
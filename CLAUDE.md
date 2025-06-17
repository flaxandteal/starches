# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands
- `npm run dev` - Run development server (Vite)
- `npm run build` - Build project (TypeScript + Vite)
- `npm run preview` - Preview built project
- `npm run reindex` - Process data files (essential after data changes)

## Code Style
- Use TypeScript with strict type checking
- Follow ES Modules syntax for imports
- Use 2-space indentation and semicolons
- Use PascalCase for classes, camelCase for variables/functions
- Add type annotations for function parameters and returns
- Prefer arrow functions for callbacks, traditional for named functions
- Handle errors with try/catch blocks and proper console logging
- Avoid unused variables and parameters
- Prevent fallthrough cases in switch statements
- Check side effect imports

## Project Structure
- Static site generator using Hugo with TypeScript and Vite
- Data processing happens in utils/ directory
- Frontend code in assets/ directory
- Templates in layouts/ directory
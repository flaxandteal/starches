# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Starches is a modern static site generator for displaying Arches cultural heritage data. It combines Hugo static site generation with TypeScript/Vite processing to create searchable, interactive heritage websites from Arches JSON data exports.

## Core Commands

### Development
- `npm run dev` - Start Vite development server (http://localhost:5173)
- `hugo serve` - Start Hugo development server for content generation

### Build and Deployment
- `npm run build` - Run TypeScript compilation and Vite production build
- `npm run preview` - Preview the production build

### Data Processing
- `npm run reindex` - Process Arches data files from prebuild/business_data/* into Hugo-compatible format

### Testing
- `npm run test` - Run tests with Vitest
- `npm run test:ui` - Run tests with UI interface
- `npm run test:coverage` - Run tests with coverage report

## Architecture

### Data Flow Pipeline
1. **Arches Data Input**: JSON exports from Arches placed in `prebuild/business_data/`
2. **Preprocessing**: `utils/preindex.ts` processes each data file individually
3. **Indexing**: `utils/reindex.ts` aggregates and transforms data for Hugo
4. **Static Generation**: Hugo builds pages from processed data in `static/definitions/`
5. **Frontend Enhancement**: TypeScript modules in `assets/` provide interactive features

### Key Module Structure

#### Frontend Assets (`assets/`)
- `map.ts` - MapLibreGL map initialization and layer management
- `search.ts` - Pagefind search integration and result handling
- `asset.ts` - Asset detail page functionality and navigation
- `searchContext.ts` - Search context preservation across page navigation
- `managers.ts` - Singleton managers for map, search, and configuration
- `fbwrapper.ts` - Flatgeobuf data loading wrapper

#### Data Processing (`utils/`)
- `reindex.ts` - Main indexing script that orchestrates data transformation
- `preindex.ts` - Individual file preprocessing with resource model handling
- `types.ts` - TypeScript interfaces for Asset, AssetMetadata, ModelEntry
- `debug.ts` - Environment-aware debug logging utilities

### Manager Pattern
The codebase uses a singleton manager pattern (stored on `window.__starchesManagers`) for:
- **MapManager**: Handles map initialization and layer management
- **SearchManager**: Manages Pagefind search functionality
- **Configuration**: Centralized configuration management

These managers use Promises to handle asynchronous initialization and ensure components can await readiness.

### Debug Logging
Use the debug utilities from `utils/debug.ts`:
- `debug()` - General debug messages (dev only)
- `debugWarn()` - Warning messages (dev only)
- `debugError()` - Error messages (dev only)
- `console.error()` - Critical errors only (always shown)

## Environment Configuration

Create `.env` file with:
```
STARCHES_INCLUDE_PRIVATE=0
PAGEFIND_BINARY_PATH=./pagefind-bin
```

Additional environment files:
- `.env.development` - Development-specific settings (DEBUG=true)
- `.env.production` - Production settings (DEBUG=false)

## TypeScript Configuration

The project uses strict TypeScript checking with:
- Target: ES2020
- Module: ESNext with bundler resolution
- Strict mode enabled
- No unused locals/parameters
- Type checking for `static/js` and `utils` directories

## Dependencies

Key dependencies include:
- **Alizarin**: Core library for Arches data handling
- **Leaflet/MapLibreGL**: Map visualization
- **Pagefind**: Search functionality (custom fork)
- **Hugo modules**: govukhugo, hugo-cookies for theming
# Starches [alpha]

<p align="center">
  <img src="static/images/favicon.svg" alt="Starches Logo" width="120" height="120"/>
</p>

A modern static site generator for displaying Arches cultural heritage data. Starches allows you to create fast, searchable, and interactive websites for heritage assets, built directly from Arches JSON data.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9%2B-blue)](https://www.typescriptlang.org/)
[![Hugo](https://img.shields.io/badge/Hugo-0.80%2B-ff4088)](https://gohugo.io/)
[![Vite](https://img.shields.io/badge/Vite-5.0%2B-646cff)](https://vitejs.dev/)

## 📖 Overview

Starches combines modern web technologies with the [Alizarin](https://github.com/flaxandteal/alizarin/) library to create static websites from [Arches](https://www.archesproject.org/) heritage data. It provides:

- Fast, searchable content with geographic visualization
- Responsive, accessible, and SEO-friendly pages
- TypeScript-based processing pipeline
- Integration with geospatial libraries
- Detail-level page navigation and search context preservation

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Hugo 0.80+
- Git

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/flaxandteal/starches.git
   cd starches
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cat > .env << EOF
   STARCHES_INCLUDE_PRIVATE=0
   PAGEFIND_BINARY_PATH=./pagefind-bin
   EOF
   ```

### Setup Data Directories

Create the necessary directory structure:

```bash
mkdir -p static/definitions/business_data static/definitions/collections static/definitions/reference_data prebuild/business_data
```

### Development Workflow

1. **Development Server**:
   ```bash
   npm run dev
   ```
   This starts a Vite development server at http://localhost:5173

2. **Building for Production**:
   ```bash
   npm run build
   ```
   Generates production-ready files in the `dist` directory

3. **Previewing the Build**:
   ```bash
   npm run preview
   ```

### Working with Arches Data

1. Place your Arches data export files in the appropriate directories:
   - Business data: `prebuild/business_data/`
   - Reference data collections: `static/definitions/collections/`
   - Reference data: `static/definitions/reference_data/`

2. Ensure your model files are correctly referenced in `utils/reindex.js`

3. Process your data files:
   ```bash
   npm run reindex
   ```

4. Start the Hugo server:
   ```bash
   hugo serve
   ```

## 🏗️ Project Structure

```
starches/
├── archetypes/           # Hugo archetypes
├── assets/               # Frontend TypeScript code
│   ├── asset.ts          # Asset detail page logic
│   ├── map.ts            # Map and search functionality
│   ├── searchContext.ts  # Navigation context handling
│   └── ...
├── content/              # Hugo content files
├── data/                 # Hugo data files
├── layouts/              # Hugo templates
│   ├── _default/         # Default layouts
│   ├── partials/         # Reusable template parts
│   └── shortcodes/       # Hugo shortcodes
├── prebuild/             # Data processing
├── static/               # Static assets
│   ├── css/              # Stylesheets
│   ├── definitions/      # Processed data
│   ├── images/           # Image assets
│   └── js/               # JavaScript files
├── themes/               # Hugo themes
├── utils/                # TypeScript utilities
│   ├── debug.ts          # Debug logging utilities
│   ├── preindex.ts       # Data preprocessing
│   ├── reindex.ts        # Main indexing script
│   └── types.ts          # TypeScript definitions
├── .env                  # Environment variables
├── .env.development      # Development environment configuration
├── .env.production       # Production environment configuration
├── tsconfig.json         # TypeScript configuration
├── hugo.toml             # Hugo configuration
└── package.json          # NPM package configuration
```

## 🧩 Features

- **Search Functionality**: Full-text search with PagefindModularUI
- **Geographic Visualization**: Interactive maps with MapLibreGL
- **Detail-Level Paging**: Navigate between search results with preserved context
- **Responsive Design**: Works on mobile and desktop devices
- **Accessibility**: Follows GOV.UK Design System principles
- **Debug Tools**: Optional debug pages for development (see Debug Pages below)

## 🛠️ Development Guidelines

### Debug Logging

The project uses a structured debug logging system that automatically handles different environments:

- **Development Mode**: Debug logs are displayed in the console
- **Production Mode**: Debug logs are stripped out completely

Use the debug utilities from `utils/debug.ts` instead of direct console methods:

```typescript
import { debug, debugWarn, debugError } from '../utils/debug';

// Only shows in development mode
debug("Loading asset data", asset);

// Shows in development mode only
debugWarn("Missing configuration", config);

// Shows in development mode only
debugError("Failed to load resource", error);

// Always shows, use for critical errors only
console.error("Critical error: Application cannot continue"); 
```

Environment-specific configuration is managed through:
- `.env.development` - Debug mode enabled
- `.env.production` - Debug mode disabled

### Debug Pages

Starches includes optional debug pages that can be enabled in consuming Hugo sites. These pages are **completely excluded** from the site build by default and only appear when explicitly enabled.

To enable debug pages, add this import to your consuming site's `hugo.toml`:

```toml
[[module.imports]]
  path = 'github.com/flaxandteal/starches'

[[module.imports]]
  path = 'github.com/flaxandteal/starches/debug'
```

Available debug pages:
- `/debug/graphs/` - Lists all Alizarin resource graphs loaded from data definitions

Without the `starches/debug` module import, debug pages will not be built or included in the site output.

### Code Style

We follow a consistent code style throughout the project:

- Use TypeScript with strict type checking
- Follow ES Modules syntax for imports
- Use 2-space indentation and semicolons
- Use PascalCase for classes, camelCase for variables/functions
- Add type annotations for function parameters and returns
- Prefer arrow functions for callbacks, traditional for named functions
- Handle errors with try/catch blocks and use the debug utilities

### Git Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Run tests and linting: `npm run lint`
5. Commit with a descriptive message
6. Push to your fork: `git push origin feature/your-feature-name`
7. Create a pull request

### Pull Request Guidelines

- Provide a clear description of the changes
- Link to any related issues
- Include screenshots for UI changes
- Ensure all tests pass
- Follow the code style guidelines
- Keep PRs focused on a single concern

## 📚 Documentation

- [Alizarin Documentation](https://github.com/flaxandteal/alizarin/)
- [Arches Project](https://www.archesproject.org/)
- [Hugo Documentation](https://gohugo.io/documentation/)
- [Vite Documentation](https://vitejs.dev/guide/)

## 📄 License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

**Important Licensing Notes:**

Currently, any use of this package carries AGPL requirements, meaning derived work must be licensed appropriately with shared source code. This includes untranspiled JavaScript/TypeScript for any web platform using this library.

**This library may not be suitable for most traditional commercial products.**

We may consider dual-licensing or relicensing more liberally in the future. Therefore:
- All PRs should be MIT-licensed to enable this possibility
- For substantial contributions, please contact us beforehand to discuss licensing

## 🤝 Contributing

We welcome contributions from the community! Please see our [Contributing Guidelines](CONTRIBUTING.md) for more information on how to get involved.

### Getting Help

- Create an issue on GitHub
- Join the discussion in existing issues
- Contact the maintainers via email

## 👏 Acknowledgments

Thanks to the folks at [Historic England](https://historicengland.org.uk/), the
[GCI](https://www.getty.edu/conservation/) and the [Arches Developer Community](https://www.archesproject.org/)
for the fantastic Arches project, and to the
[Historic Environment Division](https://www.communities-ni.gov.uk/topics/historic-environment) for their
support of our related Arches work.

In particular, the test data is based on the resource models from [Arches for HERs](https://www.archesproject.org/arches-for-hers/)
and [Arches for Science](https://www.archesproject.org/arches-for-science/).
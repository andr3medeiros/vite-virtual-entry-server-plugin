# Vite Virtual Entry Server Plugin

A Vite plugin for server-side resource handling with virtual entry support and CSS bundling capabilities.

## Features

- 🚀 **Virtual Entry Support**: Handle virtual entry points in your Vite development server
- 🎨 **CSS Bundling**: Automatically bundle CSS-only virtual modules into single CSS files
- 📁 **Folder Exposure**: Expose custom folders as served files through the dev server
- ⚡ **Caching**: Built-in caching for improved performance
- 🔧 **TypeScript Support**: Full TypeScript support with type definitions
- 🔗 **Multi-Entry Integration**: Perfect companion for [virtual-multi-entry-plugin](https://www.npmjs.com/package/virtual-multi-entry-plugin)

## Installation

```bash
yarn add vite-virtual-entry-server-plugin
# or
npm install vite-virtual-entry-server-plugin
# or
pnpm add vite-virtual-entry-server-plugin
```

## Usage

### Basic Usage

```typescript
import { defineConfig } from 'vite';
import { serverPlugin } from 'vite-virtual-entry-server-plugin';

export default defineConfig({
  plugins: [
    serverPlugin()
  ],
  build: {
    rollupOptions: {
      input: {
        main: 'src/main.ts',
        'virtual:main': 'virtual:main',
        'virtual:css': 'virtual:css'
      }
    }
  }
});
```

### With Exposed Folders

```typescript
import { defineConfig } from 'vite';
import { serverPlugin } from 'vite-virtual-entry-server-plugin';

export default defineConfig({
  plugins: [
    serverPlugin({
      exposedFolders: ['public', 'assets']
    })
  ]
});
```

## API

### `serverPlugin(options?)`

Creates a Vite plugin for server-side resource handling.

#### Parameters

- `options` (optional): `ServerPluginOptions`
  - `exposedFolders` (optional): `string[]` - Array of folder paths to expose through the dev server

#### Returns

A Vite plugin object that can be used in your Vite configuration.

## How It Works

### Virtual Entry Handling

The plugin automatically detects virtual entries (those starting with `virtual:`) and:

1. **CSS-only virtual entries**: If a virtual entry only imports CSS files, it generates a synthetic CSS bundle with `@import` statements
2. **JavaScript virtual entries**: Serves the transformed JavaScript code normally

### Folder Exposure

When `exposedFolders` is provided, the plugin:

1. Recursively scans the specified folders for files
2. Creates middleware to serve each file at its relative path
3. Transforms files through Vite's transformation pipeline
4. Serves files with appropriate content types

### Caching

The plugin implements intelligent caching:

- Entry code is cached after first transformation
- CSS bundles are cached for repeated requests
- Cached content is served with appropriate headers

## Integration with virtual-multi-entry-plugin

This plugin is particularly useful when used alongside the [`virtual-multi-entry-plugin`](https://www.npmjs.com/package/virtual-multi-entry-plugin). The `virtual-multi-entry-plugin` allows you to create multiple virtual entry points from a single source, which pairs perfectly with this server plugin's virtual entry handling capabilities.

### Example Integration

```typescript
import { defineConfig } from 'vite';
import { serverPlugin } from 'vite-virtual-entry-server-plugin';
import { virtualMultiEntry } from 'virtual-multi-entry-plugin';

export default defineConfig({
  plugins: [
    virtualMultiEntry({
      entries: {
        'main': {
          files: ['./src/main.js', './src/styles.css'],
          type: 'app'
        },
        'admin': {
          files: ['./src/admin.js', './src/admin.css'],
          type: 'app'
        }
      }
    }),
    serverPlugin({
      exposedFolders: ['public']
    })
  ]
});
```

This combination allows you to:
- **Create multiple virtual entries** from your source files
- **Handle CSS-only virtual entries** with automatic bundling
- **Serve virtual entries** through the development server
- **Cache virtual entry outputs** for better performance

## Requirements

- Node.js >= 20.19.0 (for Vite 7.x)
- Vite >= 7.1.7

## TypeScript Support

The plugin includes full TypeScript support with exported types:

```typescript
import { serverPlugin, type ServerPluginOptions } from 'vite-virtual-entry-server-plugin';

const options: ServerPluginOptions = {
  exposedFolders: ['public']
};

const plugin = serverPlugin(options);
```

## Development

This project uses Vite as both the development server and bundler.

### Available Scripts

- `yarn dev` - Start the Vite development server
- `yarn build` - Build the library for production
- `yarn preview` - Preview the production build
- `yarn test` - Run tests in watch mode
- `yarn test:run` - Run tests once
- `yarn test:ui` - Run tests with UI

### Project Structure

```
src/
├── index.ts              # Main entry point
├── server.plugin.ts      # Plugin implementation
└── __tests__/            # Test files
    └── server-plugin.test.ts
```

The build process generates:
- `dist/index.es.js` - ES module build
- `dist/index.d.ts` - TypeScript declarations
- Source maps for debugging

## Publishing

To publish this package to npm:

1. **Build**: `yarn build` - Create production build
2. **Test**: `yarn test:run` - Run test suite
3. **Publish**: `yarn publish` - Publish to npm

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Changelog

### 1.0.0

- Initial release
- Virtual entry support
- CSS bundling for CSS-only virtual entries
- Folder exposure functionality
- TypeScript support
- Comprehensive test coverage

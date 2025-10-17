/// <reference types="vitest" />

import { array as A, option as O, record } from 'fp-ts';
import { pipe } from 'fp-ts/lib/function';
import { glob } from 'glob';
import type { Plugin } from 'vite';

export interface ServerPluginOptions {
	exposedFolders?: string[];
}

/**
 * Vite plugin for server-side resource handling.
 *
 * This plugin exposes custom folders as served files (optionally),
 * distinguishes between virtual and non-virtual inputs,
 * adds special middleware for each entry, and handles CSS-only virtual modules.
 *
 * @param options Optional plugin options.
 *   - exposedFolders: Folders to expose through the dev server.
 * @returns Vite Plugin object
 *
 * Main behaviors:
 *   - Attaches middleware to serve "exposed folder" files under their real paths.
 *   - Attaches middleware for each entry (virtual or not) for on-demand serving and caching.
 *   - CSS-only virtual entries are served as virtual bundles of @import statements with content-type text/css.
 *   - Other entries are served as JavaScript.
 *   - Caches generated output for repeated requests.
 */
export const serverPlugin = (options?: ServerPluginOptions): Plugin => ({
	name: 'server-plugin',
	apply: 'serve',

	/**
	 * Configure dev server with additional resource middleware.
	 * @param server - Vite dev server instance
	 */
	configureServer(server) {
		const middlewares = server.middlewares;
		// Inputs from rollupOptions.input, keyed by entry name
		const inputs = server.config.build.rollupOptions.input as Record<string, string>;

		console.debug('Inputs', inputs);

		// Filter out virtual: entries and index.html files to get "non-virtual" actual source inputs
		const nonVirtualInputs = pipe(
			inputs,
			record.filter(entry => !entry.startsWith('virtual:')),
			record.filterWithIndex((_, file) => !file.endsWith('index.html')),
		);

		console.debug('Non-virtual inputs', nonVirtualInputs);

		// Virtual entry points (e.g. "virtual:main", "virtual:...")
		const virtualInputs = pipe(
			inputs,
			record.filter(entry => entry.startsWith('virtual:')),
		);

		console.debug('Virtual inputs', virtualInputs);

		// Serve all files from user-specified exposed folders, if provided
		if (options?.exposedFolders) {
			console.debug('Exposed folders', options.exposedFolders);

			options.exposedFolders.forEach(folder => {
				// Gather all files recursively in the folder (ignore node_modules/.git)
				const files = glob
					.sync(`${folder}/**/*`, {
						nodir: true,
						absolute: true,
						ignore: ['**/node_modules/**', '**/.git/**'],
					})
					.map(file => file.replace(`${folder}/`, ''));

				// Add one middleware per file, serving from /<file>
				files.forEach(file => {
					middlewares.use(`/${file}`, async (req, res, next) => {
						if (!req.originalUrl?.startsWith(`/${file}`)) {
							return next();
						}

						console.debug(`Request for the extra folder "${folder}", serving file: ${file}`);

						const transformed = await server.transformRequest(`${folder}/${file}`);

						res.setHeader('Content-Type', 'application/javascript');
						res.end(transformed?.code ?? '');
					});
				});
			});
		}

		// Entry code cache: name (as route) -> result code
		const entryCache = new Map<string, string>();
		// Add middleware for each input (virtual and non-virtual)
		Object.entries({ ...virtualInputs, ...nonVirtualInputs }).forEach(([name, input]) => {
			// Eagerly warm up this inputs, otherwise it will not work on first request
			console.debug(`Warming up entry: ${name} -> ${input}`);
			server.warmupRequest(input).catch(err => {
				console.error(`Error warming up request for ${name}:`, err);
			});

			// Middleware to serve the corresponding code for this entry
			middlewares.use(`/${name}`, async (req, res, next) => {
				if (!req.originalUrl?.startsWith(`/${name}`)) {
					return next();
				}

				if (entryCache.has(name)) {
					console.debug(`Serving cached entry for ${name}`);
					const contents = entryCache.get(name) ?? '';

					res.setHeader(
						'Content-Type',
						contents.startsWith('// type: cssBundle') ? 'text/css' : 'application/javascript',
					);

					res.end(contents);

					return;
				}

				// Find the module by input URL and obtain its output
				const module = await server.moduleGraph.getModuleByUrl(input);
				const transformed = module?.transformResult;

				// For "virtual:" inputs, check if they import only .css files, and generate a synthetic CSS bundle.
				if (input.startsWith('virtual:')) {
					const importedFiles = pipe(
						Array.from(module?.importedModules ?? []),
						A.filterMap(m => O.fromNullable(m.file)),
						A.map(file => file.replace(import.meta.dirname, '')),
					);

					const isCssOnly = importedFiles.length > 0 && importedFiles.every(file => file.endsWith('.css'));

					if (isCssOnly) {
						console.debug(`Request for ${name}, serving CSS only file`);

						const cssBundle = `${importedFiles.map(file => `@import '${file}';`).join('\n')}`;

						res.setHeader('Content-Type', 'text/css');
						res.end('// type: cssBundle\n\n' + cssBundle);

						entryCache.set(name, cssBundle);

						return;
					}
				}

				console.debug(`Request for ${name}, serving input file "${input}"`);

				res.setHeader('Content-Type', 'application/javascript');
				res.end(transformed?.code ?? '');

				if (transformed?.code) {
					entryCache.set(name, transformed.code ?? '');
				}
			});
		});
	},
});

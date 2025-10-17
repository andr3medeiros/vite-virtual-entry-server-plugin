import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { serverPlugin } from '../server.plugin';

// Mock glob
vi.mock('glob', () => ({
  glob: {
    sync: vi.fn(),
  },
}));

describe('serverPlugin', () => {
  let mockServer: any;
  let mockMiddlewares: any;
  let mockModuleGraph: any;
  let mockConfig: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock module graph
    mockModuleGraph = {
      getModuleByUrl: vi.fn(),
    };

    // Mock config
    mockConfig = {
      build: {
        rollupOptions: {
          input: {
            'main': 'src/main.ts',
            'virtual:main': 'virtual:main',
            'virtual:css': 'virtual:css',
            'index.html': 'index.html',
          },
        },
      },
    };

    // Mock middlewares
    mockMiddlewares = {
      use: vi.fn(),
    };

    // Mock server
    mockServer = {
      middlewares: mockMiddlewares,
      config: mockConfig,
      moduleGraph: mockModuleGraph,
      transformRequest: vi.fn(),
      warmupRequest: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('plugin creation', () => {
    it('should create a plugin with correct name and apply condition', () => {
      const plugin = serverPlugin();
      
      expect(plugin).toBeDefined();
      expect(plugin.name).toBe('server-plugin');
      expect(plugin.apply).toBe('serve');
      expect(typeof plugin.configureServer).toBe('function');
    });

    it('should accept optional options parameter', () => {
      const options = { exposedFolders: ['public'] };
      const plugin = serverPlugin(options);
      
      expect(plugin).toBeDefined();
      expect(plugin.name).toBe('server-plugin');
    });
  });

  describe('configureServer', () => {
    it('should call configureServer without errors', () => {
      const plugin = serverPlugin();
	  const configureServer = plugin.configureServer as any;

	  expect(configureServer).toBeTypeOf('function');
      expect(() => configureServer(mockServer)).not.toThrow();
    });

    it('should set up middleware for exposed folders when provided', async () => {
      const { glob } = await import('glob');
      
      vi.mocked(glob.sync).mockReturnValue([
        '/absolute/path/public/file1.js',
        '/absolute/path/public/file2.css',
        '/absolute/path/public/subdir/file3.ts',
      ]);

      const options = { exposedFolders: ['public'] };
      const plugin = serverPlugin(options);
      
      const configureServer = plugin.configureServer as any;
      configureServer(mockServer);

      expect(glob.sync).toHaveBeenCalledWith('public/**/*', {
        nodir: true,
        absolute: true,
        ignore: ['**/node_modules/**', '**/.git/**'],
      });

      expect(mockMiddlewares.use).toHaveBeenCalledWith('//absolute/path/file1.js', expect.any(Function));
      expect(mockMiddlewares.use).toHaveBeenCalledWith('//absolute/path/file2.css', expect.any(Function));
      expect(mockMiddlewares.use).toHaveBeenCalledWith('//absolute/path/subdir/file3.ts', expect.any(Function));
    });

    it('should not set up exposed folder middleware when no folders provided', async () => {
      const { glob } = await import('glob');
      const plugin = serverPlugin();
      
      const configureServer = plugin.configureServer as any;
      configureServer(mockServer);

      expect(glob.sync).not.toHaveBeenCalled();
    });

    it('should set up middleware for all input entries', async () => {
      const plugin = serverPlugin();
      
      const configureServer = plugin.configureServer as any;
      configureServer(mockServer);

      // Should set up middleware for each input entry
      expect(mockMiddlewares.use).toHaveBeenCalledWith('/main', expect.any(Function));
      expect(mockMiddlewares.use).toHaveBeenCalledWith('/virtual:main', expect.any(Function));
      expect(mockMiddlewares.use).toHaveBeenCalledWith('/virtual:css', expect.any(Function));
    });

    it('should call warmupRequest for each entry', async () => {
      const plugin = serverPlugin();
      
      const configureServer = plugin.configureServer as any;
      configureServer(mockServer);

      expect(mockServer.warmupRequest).toHaveBeenCalledWith('src/main.ts');
      expect(mockServer.warmupRequest).toHaveBeenCalledWith('virtual:main');
      expect(mockServer.warmupRequest).toHaveBeenCalledWith('virtual:css');
    });
  });

  describe('exposed folder middleware', () => {
    it('should serve files from exposed folders with correct content type', async () => {
      const { glob } = await import('glob');
      
      vi.mocked(glob.sync).mockReturnValue(['/absolute/path/public/test.js']);
      mockServer.transformRequest.mockResolvedValue({ code: 'console.log("test");' });

      const options = { exposedFolders: ['public'] };
      const plugin = serverPlugin(options);
      
      const configureServer = plugin.configureServer as any;
      configureServer(mockServer);

      // Get the middleware function
      const middlewareCall = mockMiddlewares.use.mock.calls.find(
        (call: string[]) => call[0] === '//absolute/path/test.js'
      );
      expect(middlewareCall).toBeDefined();

      const middleware = middlewareCall![1];
      const mockReq = { originalUrl: '//absolute/path/test.js' };
      const mockRes = {
        setHeader: vi.fn(),
        end: vi.fn(),
      };
      const mockNext = vi.fn();

      await middleware(mockReq, mockRes, mockNext);

      expect(mockServer.transformRequest).toHaveBeenCalledWith('public//absolute/path/test.js');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/javascript');
      expect(mockRes.end).toHaveBeenCalledWith('console.log("test");');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next() when URL does not match', async () => {
      const { glob } = await import('glob');
      
      vi.mocked(glob.sync).mockReturnValue(['/absolute/path/public/test.js']);

      const options = { exposedFolders: ['public'] };
      const plugin = serverPlugin(options);
      
      const configureServer = plugin.configureServer as any;
      configureServer(mockServer);

      const middlewareCall = mockMiddlewares.use.mock.calls.find(
        (call: string[]) => call[0] === '//absolute/path/test.js'
      );
      const middleware = middlewareCall![1];
      const mockReq = { originalUrl: '/other.js' };
      const mockRes = { setHeader: vi.fn(), end: vi.fn() };
      const mockNext = vi.fn();

      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.setHeader).not.toHaveBeenCalled();
      expect(mockRes.end).not.toHaveBeenCalled();
    });
  });

  describe('entry middleware', () => {
    it('should serve cached entries', async () => {
      const plugin = serverPlugin();
      
      const configureServer = plugin.configureServer as any;
      configureServer(mockServer);

      // Find the middleware for 'main' entry
      const middlewareCall = mockMiddlewares.use.mock.calls.find(
		  (call: string[]) => call[0] === '/main'
      );
      const middleware = middlewareCall![1];

      const mockReq = { originalUrl: '/main' };
      const mockRes = {
        setHeader: vi.fn(),
        end: vi.fn(),
      };
      const mockNext = vi.fn();

      // First call - should populate cache
      mockModuleGraph.getModuleByUrl.mockResolvedValue({
        transformResult: { code: 'console.log("main");' },
        importedModules: [],
      });

      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/javascript');
      expect(mockRes.end).toHaveBeenCalledWith('console.log("main");');

      // Second call - should use cache
      const mockRes2 = {
        setHeader: vi.fn(),
        end: vi.fn(),
      };
      const mockNext2 = vi.fn();

      await middleware(mockReq, mockRes2, mockNext2);

      expect(mockRes2.setHeader).toHaveBeenCalledWith('Content-Type', 'application/javascript');
      expect(mockRes2.end).toHaveBeenCalledWith('console.log("main");');
    });

    it('should serve CSS bundle for CSS-only virtual entries', async () => {
      const plugin = serverPlugin();
      
      const configureServer = plugin.configureServer as any;
      mockServer.config.build.rollupOptions.input = {
        'virtual:main': 'virtual:main',
      };

      mockModuleGraph.getModuleByUrl.mockResolvedValue({
        transformResult: { code: ':root { --color: red; }' },
        importedModules: [{ file: 'styles/style1.css' }, { file: 'styles/style2.css' }],
      });

      configureServer(mockServer);

      const middlewareCall = mockMiddlewares.use.mock.calls.find(
        (call: string[]) => call[0] === '/virtual:main'
      );
      const middleware = middlewareCall![1];

      const mockReq = { originalUrl: '/virtual:main' };
      const mockRes = {
        setHeader: vi.fn(),
        end: vi.fn(),
      };
      const mockNext = vi.fn();

      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/css');
      expect(mockRes.end).toHaveBeenCalledWith('// type: cssBundle\n\n@import \'styles/style1.css\';\n@import \'styles/style2.css\';');
    });

    it('should serve JavaScript for non-CSS virtual entries', async () => {
      const plugin = serverPlugin();
      
      const configureServer = plugin.configureServer as any;
      mockServer.config.build.rollupOptions.input = {
        'virtual:main': 'virtual:main.ts',
      };

      mockModuleGraph.getModuleByUrl.mockResolvedValue({
        transformResult: { code: 'export default function main() { console.log("main"); }' },
        importedModules: [],
      });
      configureServer(mockServer);

      const middlewareCall = mockMiddlewares.use.mock.calls.find(
        (call: string[]) => call[0] === '/virtual:main'
      );
      const middleware = middlewareCall![1];

      const mockReq = { originalUrl: '/virtual:main' };
      const mockRes = {
        setHeader: vi.fn(),
        end: vi.fn(),
      };
      const mockNext = vi.fn();

      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/javascript');
      expect(mockRes.end).toHaveBeenCalledWith('export default function main() { console.log("main"); }');
    });

    it('should handle missing module gracefully', async () => {
      const plugin = serverPlugin();
      
      const configureServer = plugin.configureServer as any;
      configureServer(mockServer);

      const middlewareCall = mockMiddlewares.use.mock.calls.find(
        (call: string[]) => call[0] === '/main'
      );
      const middleware = middlewareCall![1];

      const mockReq = { originalUrl: '/main' };
      const mockRes = {
        setHeader: vi.fn(),
        end: vi.fn(),
      };
      const mockNext = vi.fn();

      mockModuleGraph.getModuleByUrl.mockResolvedValue(null);

      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/javascript');
      expect(mockRes.end).toHaveBeenCalledWith('');
    });

    it('should call next() when URL does not match entry', async () => {
      const plugin = serverPlugin();
      
      const configureServer = plugin.configureServer as any;
      configureServer(mockServer);

      const middlewareCall = mockMiddlewares.use.mock.calls.find(
        (call: string[]) => call[0] === '/main'
      );
      const middleware = middlewareCall![1];

      const mockReq = { originalUrl: '/other' };
      const mockRes = { setHeader: vi.fn(), end: vi.fn() };
      const mockNext = vi.fn();

      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.setHeader).not.toHaveBeenCalled();
      expect(mockRes.end).not.toHaveBeenCalled();
    });
  });
});
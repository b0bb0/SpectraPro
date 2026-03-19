import { Test, TestingModule } from '@nestjs/testing';
import { ScanOrchestratorService } from './scan-orchestrator.service';
import { Logger } from '@nestjs/common';

// Mock dependencies
const mockConsoleService = {
  appendOutput: jest.fn(),
};

const mockPrismaService = {
  scan: {
    update: jest.fn(),
  },
};

describe('ScanOrchestratorService', () => {
  let service: ScanOrchestratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScanOrchestratorService,
        { provide: 'ConsoleService', useValue: mockConsoleService },
        { provide: 'PrismaService', useValue: mockPrismaService },
        { provide: 'ScanAiPhase2Service', useValue: {} },
        { provide: 'NucleiService', useValue: {} },
        Logger,
      ],
    }).compile();

    service = module.get<ScanOrchestratorService>(ScanOrchestratorService);
  });

  describe('validateAndSanitizeTags', () => {
    // Helper to access private method for testing
    const validateTags = (tags: string[]) => (service as any).validateAndSanitizeTags(tags);

    it('should reject CVE IDs', () => {
      const result = validateTags(['CVE-2023-1234', 'cve-2022-5678']);
      expect(result).toEqual([]);
    });

    it('should reject CVE IDs with 5+ digits in sequence', () => {
      const result = validateTags(['CVE-2023-12345', 'cve-2024-1234567']);
      expect(result).toEqual([]);
    });

    it('should reject filenames and extensions', () => {
      const result = validateTags(['wordpress-plugin.yaml', 'config.yml', 'backup.bak']);
      expect(result).toEqual([]);
    });

    it('should reject path-like strings', () => {
      const result = validateTags(['http/cves/php/', '/etc/passwd', 'folder/file']);
      expect(result).toEqual([]);
    });

    it('should reject wildcards', () => {
      const result = validateTags(['cve-*', 'wp-*']);
      expect(result).toEqual([]);
    });

    it('should accept valid allowlisted tags', () => {
      const validTags = ['sqli', 'xss', 'rce', 'lfi'];
      const result = validateTags(validTags);
      expect(result).toEqual(expect.arrayContaining(validTags));
      expect(result.length).toBe(4);
    });

    it('should translate semantic vulnerability classes', () => {
      const result = validateTags(['sql-injection', 'remote-file-inclusion']);
      
      // Should include both the original (if valid) and the translated short codes
      expect(result).toContain('sqli');
      expect(result).toContain('sql-injection');
      expect(result).toContain('rfi');
      expect(result).toContain('remote-file-inclusion');
    });

    it('should handle mixed valid and invalid input', () => {
      const input = [
        'sqli',                 // Valid
        'CVE-2023-1234',        // Invalid (CVE)
        'wordpress-plugin.yaml',// Invalid (Filename)
        'authentication-bypass' // Valid (Semantic translation)
      ];
      const result = validateTags(input);
      
      expect(result).toContain('sqli');
      expect(result).toContain('auth-bypass'); // Translated
      expect(result).not.toContain('CVE-2023-1234');
      expect(result).not.toContain('wordpress-plugin.yaml');
    });

    it('should normalize tags to lowercase and trim whitespace', () => {
      const result = validateTags(['  SQLi  ', 'XSS']);
      expect(result).toContain('sqli');
      expect(result).toContain('xss');
    });

    it('should handle complex mixed input with duplicates and normalization', () => {
      const input = [
        'SQLi',                   // Valid (needs normalization)
        'sqli',                   // Valid (duplicate)
        'CVE-2023-9999',          // Invalid (CVE)
        '/etc/passwd',            // Invalid (Path)
        'remote-code-execution',  // Valid (Semantic translation -> rce, remote-code-execution)
        'RCE',                    // Valid (needs normalization, duplicate of translation)
        'unknown-tag-123'         // Invalid (Not in allowlist)
      ];
      const result = validateTags(input);
      
      expect(result).toHaveLength(3);
      expect(result).toEqual(expect.arrayContaining(['sqli', 'rce', 'remote-code-execution']));
    });
  });

  describe('validateNucleiExecution', () => {
    const validateExecution = (folders: string[], tags: string[], severities: string[]) => 
      (service as any).validateNucleiExecution(folders, tags, severities);

    it('should return valid when folders and severities are provided', () => {
      const result = validateExecution(['http/vulnerabilities/'], [], ['low', 'medium']);
      expect(result.valid).toBe(true);
    });

    it('should return valid when tags and severities are provided', () => {
      const result = validateExecution([], ['sqli'], ['critical']);
      expect(result.valid).toBe(true);
    });

    it('should return invalid when neither folders nor tags are provided', () => {
      const result = validateExecution([], [], ['high']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('No folders or tags specified');
    });

    it('should return invalid when no severities are provided', () => {
      const result = validateExecution(['http/cves/'], [], []);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('No severity levels specified');
    });
  });

  describe('buildAuthArgs', () => {
    const buildAuthArgs = (config: any) => (service as any).buildAuthArgs(config);

    it('should return empty array for null config', () => {
      expect(buildAuthArgs(null)).toEqual([]);
    });

    it('should return empty array for none method', () => {
      expect(buildAuthArgs({ method: 'none' })).toEqual([]);
    });

    it('should build basic auth header', () => {
      const config = { method: 'basic', username: 'user', password: 'password' };
      const args = buildAuthArgs(config);
      expect(args).toEqual(['-H', 'Authorization: Basic dXNlcjpwYXNzd29yZA==']);
    });

    it('should build bearer token header', () => {
      const config = { method: 'bearer', bearerToken: 'secret-token' };
      const args = buildAuthArgs(config);
      expect(args).toEqual(['-H', 'Authorization: Bearer secret-token']);
    });

    it('should build cookie header', () => {
      const config = { method: 'cookie', cookies: { session: '123', User: 'test' } };
      const args = buildAuthArgs(config);
      expect(args).toEqual(['-H', 'Cookie: session=123; User=test']);
    });

    it('should build custom headers', () => {
      const config = { method: 'header', headers: { 'X-Custom': 'Value', 'X-Api-Key': 'key' } };
      const args = buildAuthArgs(config);
      expect(args).toContain('-H');
      expect(args).toContain('X-Custom: Value');
      expect(args).toContain('X-Api-Key: key');
      expect(args.length).toBe(4);
    });
  });
});
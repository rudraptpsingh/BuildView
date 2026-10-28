import { describe, it, expect } from 'vitest';
import { RepoParser } from './repo-parser.js';

describe('RepoParser TypeScript AST Suite', () => {
  it('should parse functions, classes, and members accurately', () => {
    const code = `
      export interface UserProfile {
        id: string;
        email: string;
        isActive: boolean;
      }

      export class UserManager {
        private dbHandle: string;
        public activeCount: number = 0;

        public async fetchUser(id: string): Promise<UserProfile> {
          return { id, email: 'test@example.com', isActive: true };
        }

        public deleteUser(id: string): boolean {
          return true;
        }
      }
    `;

    const result = RepoParser.parseFile('src/users.ts', code);
    expect(result.isTestFile).toBe(false);
    expect(result.astMetrics.totalClasses).toBe(1);
    expect(result.astMetrics.totalInterfaces).toBe(1);

    // Verify members
    const idField = result.members.find((m) => m.name === 'id');
    expect(idField).toBeDefined();
    expect(idField?.type).toBe('string');

    const dbHandle = result.members.find((m) => m.name === 'dbHandle');
    expect(dbHandle).toBeDefined();
    expect(dbHandle?.access).toBe('private');

    // Verify methods
    const fetchUser = result.functions.find((f) => f.name === 'fetchUser');
    expect(fetchUser).toBeDefined();
    expect(fetchUser?.isAsync).toBe(true);
    expect(fetchUser?.returnType).toContain('Promise<UserProfile>');
  });

  it('should parse test suites, describe blocks, and it/test assertions', () => {
    const testCode = `
      import { describe, it, expect } from 'vitest';

      describe('Auth Verification Suite', () => {
        it('validates correct JWT signature', () => {
          expect(true).toBe(true);
        });

        it('rejects expired token', () => {
          expect(false).toBe(false);
        });
      });

      describe('Refresh Token Rotation', () => {
        test('rotates token family safely', () => {
          expect(1).toBe(1);
        });
      });
    `;

    const result = RepoParser.parseFile('src/auth.test.ts', testCode);
    expect(result.isTestFile).toBe(true);
    expect(result.testSuites).toHaveLength(2);
    expect(result.testSuites).toContain('Auth Verification Suite');
    expect(result.testSuites).toContain('Refresh Token Rotation');
    expect(result.testCases).toHaveLength(3);
    expect(result.testCases?.[0].name).toBe('validates correct JWT signature');
  });

  it('should correlate source files with corresponding test files and compute test coverage', () => {
    const sourceFiles = ['src/auth/jwt.ts', 'src/auth/token.ts'];
    const parsedTestFiles = [
      RepoParser.parseFile(
        'src/auth/jwt.test.ts',
        `describe('JWT', () => { it('signs', () => {}); it('verifies', () => {}); });`
      ),
    ];

    const { matchedTestFiles, testSummary } = RepoParser.correlateTests(sourceFiles, parsedTestFiles);
    expect(matchedTestFiles).toHaveLength(1);
    expect(matchedTestFiles[0].testCount).toBe(2);
    expect(testSummary.status).toBe('partial');
    expect(testSummary.totalTests).toBe(2);
  });
});

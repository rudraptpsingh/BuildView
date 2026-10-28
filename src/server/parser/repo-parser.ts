import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import {
  DataMember,
  FunctionSpec,
  TestCaseInfo,
  TestFileInfo,
  TestCoverageSummary,
  AstMetrics,
} from '../../shared/types.js';

export interface ExportedSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'variable' | 'type';
  line: number;
  loc: number;
}

export interface ImportDetail {
  specifier: string;
  importedSymbols: string[];
  isTypeOnly?: boolean;
}

export interface FunctionDetail extends FunctionSpec {
  bodySnippet?: string;
  line: number;
  loc: number;
}

export interface ParsedFileResult {
  filePath: string;
  isTestFile: boolean;
  members: DataMember[];
  functions: FunctionSpec[];
  functionDetails?: FunctionDetail[];
  imports: string[];
  importDetails?: ImportDetail[];
  exportedSymbols?: ExportedSymbol[];
  testSuites?: string[];
  testCases?: TestCaseInfo[];
  astMetrics: AstMetrics;
}

export class RepoParser {
  /**
   * Parses an individual TypeScript/JavaScript source or test file using the TypeScript AST compiler.
   */
  public static parseFile(filePath: string, fileContent: string): ParsedFileResult {
    const isTestFile = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath) ||
      filePath.includes('/__tests__/') ||
      filePath.includes('/tests/');

    const sourceFile = ts.createSourceFile(
      path.basename(filePath),
      fileContent,
      ts.ScriptTarget.Latest,
      false,
      filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const members: DataMember[] = [];
    const functions: FunctionSpec[] = [];
    const functionDetails: FunctionDetail[] = [];
    const imports: string[] = [];
    const importDetails: ImportDetail[] = [];
    const exportedSymbols: ExportedSymbol[] = [];
    const testSuites: string[] = [];
    const testCases: TestCaseInfo[] = [];

    let totalFunctions = 0;
    let totalClasses = 0;
    let totalInterfaces = 0;
    let totalExports = 0;

    let currentSuite = 'Root';

    function isNodeExported(node: ts.Node): boolean {
      return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
    }

    function visit(node: ts.Node) {
      // 1. Detect Imports & Detailed Symbols
      if (ts.isImportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const specifier = node.moduleSpecifier.text;
          imports.push(specifier);
          const importedSymbols: string[] = [];
          if (node.importClause) {
            if (node.importClause.name) {
              importedSymbols.push(node.importClause.name.text);
            }
            if (node.importClause.namedBindings) {
              if (ts.isNamedImports(node.importClause.namedBindings)) {
                for (const el of node.importClause.namedBindings.elements) {
                  importedSymbols.push(el.name.text);
                }
              } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
                importedSymbols.push(node.importClause.namedBindings.name.text);
              }
            }
          }
          importDetails.push({
            specifier,
            importedSymbols,
            isTypeOnly: node.importClause?.isTypeOnly || false,
          });
        }
      }

      // 2. Export Declarations (export { a, b })
      if (ts.isExportDeclaration(node)) {
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) {
            totalExports++;
            const pos = sourceFile.getLineAndCharacterOfPosition(el.getStart(sourceFile));
            exportedSymbols.push({
              name: el.name.text,
              kind: 'variable',
              line: pos.line + 1,
              loc: 1,
            });
          }
        }
      }

      // 3. Variable Statements (export const X = ...)
      if (ts.isVariableStatement(node)) {
        const isExp = isNodeExported(node);
        if (isExp) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name)) {
              totalExports++;
              const pos = sourceFile.getLineAndCharacterOfPosition(decl.getStart(sourceFile));
              exportedSymbols.push({
                name: decl.name.text,
                kind: 'variable',
                line: pos.line + 1,
                loc: node.getText(sourceFile).split('\n').length,
              });
            }
          }
        }
      }

      // 4. Parse Test Suites & Cases (describe, it, test)
      if (isTestFile && ts.isCallExpression(node)) {
        const expressionText = node.expression.getText(sourceFile);
        if (expressionText === 'describe' || expressionText === 'suite') {
          const firstArg = node.arguments[0];
          if (firstArg && ts.isStringLiteral(firstArg)) {
            const suiteName = firstArg.text;
            if (!testSuites.includes(suiteName)) {
              testSuites.push(suiteName);
            }
            const prevSuite = currentSuite;
            currentSuite = suiteName;
            ts.forEachChild(node, visit);
            currentSuite = prevSuite;
            return;
          }
        } else if (expressionText === 'it' || expressionText === 'test') {
          const firstArg = node.arguments[0];
          if (firstArg && ts.isStringLiteral(firstArg)) {
            testCases.push({
              name: firstArg.text,
              suite: currentSuite,
            });
          }
        }
      }

      // 5. Functions & Methods
      if (ts.isFunctionDeclaration(node)) {
        totalFunctions++;
        if (node.name) {
          const fnName = node.name.text;
          const isAsync = (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Async) !== 0;
          const returnType = node.type ? node.type.getText(sourceFile) : 'void';
          const params = node.parameters
            .map((p) => `${p.name.getText(sourceFile)}: ${p.type ? p.type.getText(sourceFile) : 'any'}`)
            .join(', ');

          const signature = `(${params}): ${returnType}`;
          const bodySnippet = node.body ? node.body.getText(sourceFile) : undefined;
          const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          const loc = node.getText(sourceFile).split('\n').length;

          functions.push({
            name: fnName,
            signature,
            returnType,
            isAsync,
          });

          functionDetails.push({
            name: fnName,
            signature,
            returnType,
            isAsync,
            bodySnippet,
            line: pos.line + 1,
            loc,
          });

          if (isNodeExported(node)) {
            totalExports++;
            exportedSymbols.push({
              name: fnName,
              kind: 'function',
              line: pos.line + 1,
              loc,
            });
          }
        }
      }

      // 6. Classes & Members
      if (ts.isClassDeclaration(node)) {
        totalClasses++;
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const loc = node.getText(sourceFile).split('\n').length;

        if (isNodeExported(node) && node.name) {
          totalExports++;
          exportedSymbols.push({
            name: node.name.text,
            kind: 'class',
            line: pos.line + 1,
            loc,
          });
        }

        for (const member of node.members) {
          if (ts.isPropertyDeclaration(member) && member.name) {
            const propName = member.name.getText(sourceFile);
            const propType = member.type ? member.type.getText(sourceFile) : 'unknown';
            const flags = ts.getCombinedModifierFlags(member);
            const access = (flags & ts.ModifierFlags.Private)
              ? 'private'
              : (flags & ts.ModifierFlags.Protected)
              ? 'protected'
              : 'public';

            members.push({
              name: propName,
              type: propType,
              access,
            });
          } else if (ts.isMethodDeclaration(member) && member.name) {
            totalFunctions++;
            const methodName = member.name.getText(sourceFile);
            const isAsync = (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Async) !== 0;
            const returnType = member.type ? member.type.getText(sourceFile) : 'void';
            const params = member.parameters
              .map((p) => `${p.name.getText(sourceFile)}: ${p.type ? p.type.getText(sourceFile) : 'any'}`)
              .join(', ');

            const signature = `(${params}): ${returnType}`;
            const bodySnippet = member.body ? member.body.getText(sourceFile) : undefined;
            const mPos = sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile));
            const mLoc = member.getText(sourceFile).split('\n').length;

            functions.push({
              name: methodName,
              signature,
              returnType,
              isAsync,
            });

            functionDetails.push({
              name: methodName,
              signature,
              returnType,
              isAsync,
              bodySnippet,
              line: mPos.line + 1,
              loc: mLoc,
            });
          }
        }
      }

      // 7. Interfaces & Type Aliases
      if (ts.isInterfaceDeclaration(node)) {
        totalInterfaces++;
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const loc = node.getText(sourceFile).split('\n').length;

        if (isNodeExported(node) && node.name) {
          totalExports++;
          exportedSymbols.push({
            name: node.name.text,
            kind: 'interface',
            line: pos.line + 1,
            loc,
          });
        }

        for (const member of node.members) {
          if (ts.isPropertySignature(member) && member.name) {
            const propName = member.name.getText(sourceFile);
            const propType = member.type ? member.type.getText(sourceFile) : 'unknown';
            members.push({
              name: propName,
              type: propType,
              access: 'public',
            });
          } else if (ts.isMethodSignature(member) && member.name) {
            totalFunctions++;
            const methodName = member.name.getText(sourceFile);
            const returnType = member.type ? member.type.getText(sourceFile) : 'void';
            const params = member.parameters
              .map((p) => `${p.name.getText(sourceFile)}: ${p.type ? p.type.getText(sourceFile) : 'any'}`)
              .join(', ');

            functions.push({
              name: methodName,
              signature: `(${params}): ${returnType}`,
              returnType,
              isAsync: false,
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    const linesOfCode = fileContent.split('\n').length;

    return {
      filePath,
      isTestFile,
      members,
      functions,
      functionDetails,
      imports,
      importDetails,
      exportedSymbols,
      testSuites: isTestFile ? testSuites : undefined,
      testCases: isTestFile ? testCases : undefined,
      astMetrics: {
        totalFunctions,
        totalClasses,
        totalInterfaces,
        totalExports,
        linesOfCode,
      },
    };
  }

  /**
   * Associates a set of source files with corresponding test files.
   * Looks for naming conventions: foo.test.ts, foo.spec.ts, foo.testPlatform.test.ts, etc.
   */
  public static correlateTests(
    sourceFiles: string[],
    testFilesData: ParsedFileResult[]
  ): {
    matchedTestFiles: TestFileInfo[];
    testSummary: TestCoverageSummary;
  } {
    const matchedTestFiles: TestFileInfo[] = [];
    const sourceBasenames = sourceFiles.map((f) => path.basename(f, path.extname(f)).toLowerCase());
    const sourceSet = new Set(sourceFiles.map((f) => f.replace(/\\/g, '/')));

    for (const testResult of testFilesData) {
      const testBasename = path.basename(testResult.filePath, path.extname(testResult.filePath)).toLowerCase();
      const cleanTest = testBasename.replace(/\.(test|spec)$/, '');

      // 1. Basename matching
      let isMatch = sourceBasenames.some((srcBase) => {
        return cleanTest === srcBase || cleanTest.startsWith(srcBase) || srcBase.startsWith(cleanTest);
      });

      // 2. Import matching (if test directly imports source file)
      if (!isMatch && testResult.imports) {
        isMatch = testResult.imports.some((imp) => {
          const impBase = path.basename(imp).replace(/\.(ts|tsx|js|jsx)$/, '').toLowerCase();
          return sourceBasenames.includes(impBase);
        });
      }

      // 3. Submodule directory proximity matching (only for specific subdirectories, e.g. components/cull, components/compare)
      if (!isMatch) {
        const testDir = path.dirname(testResult.filePath).toLowerCase();
        isMatch = sourceFiles.some((sf) => {
          const srcDir = path.dirname(sf).toLowerCase();
          const srcSegments = srcDir.split(/[\\/]/).filter((s) => s && s !== 'src' && s !== 'electron' && s !== 'components');
          if (srcSegments.length === 0) return false;
          const specificDir = srcSegments.join('/');
          return testDir.includes(specificDir);
        });
      }

      if (isMatch) {
        matchedTestFiles.push({
          path: testResult.filePath,
          testCount: testResult.testCases?.length || 1, // at least 1 test spec if file exists
          suites: testResult.testSuites || [],
          testCases: testResult.testCases || [],
        });
      }
    }

    const totalTests = matchedTestFiles.reduce((acc, t) => acc + (t.testCount || 0), 0);
    const testFilesCount = matchedTestFiles.length;

    let status: 'tested' | 'partial' | 'untested' = 'untested';
    let coverageEstimatePercent = 0;

    if (testFilesCount > 0 && totalTests > 0) {
      if (testFilesCount >= Math.min(3, sourceFiles.length)) {
        status = 'tested';
        coverageEstimatePercent = Math.min(100, Math.max(65, totalTests * 8));
      } else {
        status = 'partial';
        coverageEstimatePercent = Math.min(75, Math.max(30, totalTests * 6));
      }
    }

    return {
      matchedTestFiles,
      testSummary: {
        testFilesCount,
        totalTests,
        status,
        coverageEstimatePercent,
      },
    };
  }

  /**
   * Deep scans a repository directory and parses all matching source and test files.
   */
  public static scanRepository(
    rootDir: string,
    options: {
      includeExtensions?: string[];
      ignoreDirs?: string[];
    } = {}
  ): {
    sourceFiles: ParsedFileResult[];
    testFiles: ParsedFileResult[];
  } {
    const extFilter = options.includeExtensions || ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
    const defaultIgnoreDirs = [
      'node_modules',
      'dist',
      'dist-electron',
      'dist-web',
      '.git',
      '.buildview',
      'build',
      'out',
      'output',
      'outputs',
      'test-results',
      'coverage',
      '.cache',
      '.turbo',
      '.next',
      '.tmp',
      'tmp',
      'tmp2',
      'tmp3',
      'tmp4',
      '.playwright-cli',
      '.shotselect-dev',
      '.vscode',
      '.idea',
      'benchmarks',
      'mockups',
      'assets',
      'videos',
      'public',
      'marketing',
      'mock-wedding-dataset',
      'test-fixtures',
      'docs',
      'captures',
      'screenshots',
      'artifacts',
    ];
    const ignoreDirs = new Set([...defaultIgnoreDirs, ...(options.ignoreDirs || [])]);

    const sourceFiles: ParsedFileResult[] = [];
    const testFiles: ParsedFileResult[] = [];

    function traverse(currentDir: string) {
      if (!fs.existsSync(currentDir)) return;
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') || ignoreDirs.has(entry.name)) {
            continue;
          }
          traverse(path.join(currentDir, entry.name));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extFilter.includes(ext)) {
            const fullPath = path.join(currentDir, entry.name);
            const relativePath = path.relative(rootDir, fullPath);
            try {
              const stat = fs.statSync(fullPath);
              if (stat.size > 1024 * 1024) continue; // skip files > 1MB

              const content = fs.readFileSync(fullPath, 'utf-8');
              const parsed = RepoParser.parseFile(relativePath, content);
              if (parsed.isTestFile) {
                testFiles.push(parsed);
              } else {
                sourceFiles.push(parsed);
              }
            } catch (err) {
              // Ignore binary or syntax error files
            }
          }
        }
      }
    }

    traverse(rootDir);

    return { sourceFiles, testFiles };
  }
}

import { Graph, Module } from "./graph";
import * as ts from "typescript";
import FileCache, { ImportMap } from "./file-cache";
import createHost from "./host";

type FromNode = ts.ImportDeclaration | ts.ExportDeclaration | ts.CallExpression;

interface ResolvedFrom {
  fromNode: FromNode;
  fromFile: ts.SourceFile;
  fromModule: Module;
}

export default class Compiler {
  private graph = new Graph();
  private options: ts.CompilerOptions;
  private fileCache: FileCache;
  private host: ts.CompilerHost;
  private program: ts.Program;
  private checker: ts.TypeChecker;

  constructor(modulesRoot: string, rootNames: string[]) {
    let options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2015,
      module: ts.ModuleKind.ES2015,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      allowJs: true,
      baseUrl: modulesRoot,
      noEmit: true
    };
    let fileCache = new FileCache(modulesRoot);
    let host = createHost(fileCache, options);
    let program = ts.createProgram(rootNames, options, host);
    this.options = options;
    this.fileCache = fileCache;
    this.host = host;
    this.program = program;
    this.checker = program.getTypeChecker();
  }

  compile(): Graph {
    let program = this.program;
    let graph = this.graph;
    this.checkDiagnostics();
    let sourceFiles = program.getSourceFiles();
    for (let i = 0; i < sourceFiles.length; i++) {
      let sourceFile = sourceFiles[i];
      if (sourceFile.isDeclarationFile) continue;
      this.resolveModule(sourceFile);
    }
    return graph;
  }

  resolveModule(sourceFile: ts.SourceFile) {
    let { fileCache, graph, checker } = this;
    let entry = fileCache.get(sourceFile.fileName);
    if (entry.visited) return;
    entry.visited = true;

    let moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol || (moduleSymbol.flags & ts.SymbolFlags.ValueModule) === 0) {
      console.error(this.formatMessage(sourceFile, 0, "not a module"));
      return;
    }

    let moduleNode = graph.addModule(entry.moduleId);
    entry.moduleNode = moduleNode;
    this.resolveExportNames(moduleSymbol, moduleNode);
    let imports = entry.imports;
    if (imports) {
      this.resolveImports(sourceFile, imports, moduleNode);
    }
  }

  resolveExportNames(moduleSymbol: ts.Symbol, moduleNode: Module) {
    let { checker } = this;
    let exports = checker.getExportsOfModule(moduleSymbol);
    exports.forEach(ex => {
      moduleNode.addExport(ex.name);
    });
  }

  resolveImports(sourceFile: ts.SourceFile, imports: ImportMap, moduleNode: Module) {
    // this is private but I don't want to redo the work of the binding diagnostics
    let importLiterals: ts.LiteralExpression[] | undefined = sourceFile["imports"];
    if (importLiterals) {
      importLiterals.forEach(importLiteral => {
        let resolvedFrom = this.resolveFrom(importLiteral, imports);
        if (!resolvedFrom) {
          this.warnBinding(importLiteral);
          return;
        }
        this.resolveImport(resolvedFrom, moduleNode);
      });
    }
  }

  resolveImport(resolvedFrom: ResolvedFrom, moduleNode: Module) {
    let { fromNode, fromModule } = resolvedFrom;
    if (isImportDeclaration(fromNode)) {
      let { importClause } = fromNode;
      if (importClause) {
        let { name, namedBindings } = importClause;
        if (name) {
          let exportName = fromModule.getExport("default");
          if (exportName) {
            moduleNode.addNamedImport(name.text, exportName);
          } else {
            this.warnBinding(name);
            console.log(this.formatNodeMessage(name, "unable to resolve import"));
          }
        }
        if (namedBindings) {
          if (isNamespaceBinding(namedBindings)) {
            moduleNode.addNamedImport(namedBindings.name.text, fromModule);
          } else {
            namedBindings.elements.forEach(importSpecifier => {
              let importName = importSpecifier.name.text;
              let fromName = importSpecifier.propertyName && importSpecifier.propertyName.text || importName;
              let fromNode = fromModule.getExport(fromName);
              if (!fromNode) {
                this.warnBinding(importSpecifier);
                return;
              }
              moduleNode.addNamedImport(importName, fromNode);
            });
          }
        }
      } else {
        moduleNode.addModuleImport(fromModule);
      }
    } else if (isExportDeclaration(fromNode)) {
      // we've already added all exports this is just adding the from binding
      let { exportClause } = fromNode;
      if (exportClause) {
        exportClause.elements.forEach(exportSpecifier => {
          let importName = exportSpecifier.name.text;
          let toNode = moduleNode.getExport(importName);
          let fromName = exportSpecifier.propertyName && exportSpecifier.propertyName.text || importName;
          let fromNode = fromModule.getExport(fromName);
          if (!toNode || !fromNode) {
            this.warnBinding(exportSpecifier);
            return;
          }
          toNode.from = fromNode;
        });
      } else { // export *
        let exports = moduleNode.exports;
        if (!exports) {
          this.warnBinding(fromNode);
          return;
        }
        exports.forEach(exportName => {
          exportName.from = fromModule.getExport(exportName.name);
        });
      }
    } else {
      moduleNode.addRequire(fromModule);
    }
  }

  warnBinding(node: ts.Node) {
    let msg = `unable to resolve: ${node.getText()}`;
    console.error(this.formatNodeMessage(node, msg));
  }

  resolveFrom(importLiteral: ts.LiteralExpression, imports: ImportMap): ResolvedFrom | undefined {
    if (importLiteral.kind !== ts.SyntaxKind.StringLiteral) {
      return;
    }
    let moduleName = (<ts.StringLiteral>importLiteral).text;
    let fromEntry = imports && imports[moduleName];
    let fromNode = importLiteral.parent;
    if (!isImportParent(fromNode)) return;
    if (!fromEntry) return;
    let fromFile = fromEntry.sourceFile;
    if (!fromFile) return;
    if (!fromEntry.visited) this.resolveModule(fromFile);
    let fromModule = fromEntry.moduleNode;
    if (!fromModule) return;
    return { fromNode, fromFile, fromModule };
  }

  checkDiagnostics() {
    let diagnostics = ts.getPreEmitDiagnostics(this.program);
    if (diagnostics && diagnostics.length) {
      diagnostics.forEach(diagnostic => {
        // if (diagnostic.category === ts.DiagnosticCategory.Error) {
        //   throw new Error(this.formatDiagnostic(diagnostic));
        // }
        console.error(this.formatDiagnostic(diagnostic));
      });
    }
  }

  relativePath(fileName: string) {
    return this.fileCache.get(fileName).relative;
  }

  formatDiagnostic(d: ts.Diagnostic): string {
    let msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
    return this.formatMessage(d.file, d.start, msg);
  }

  formatNodeMessage(node: ts.Node, msg: string): string {
    let sourceFile = node.getSourceFile();
    let start = node.getStart(sourceFile);
    return this.formatMessage(sourceFile, start, msg);
  }

  formatMessage(sourceFile: ts.SourceFile, start: number, msg: string): string {
    let loc = sourceFile.getLineAndCharacterOfPosition(start);
    let relative = this.relativePath(sourceFile.fileName);
    return `${ relative }(${ loc.line + 1 },${ loc.character + 1 }): ${msg}`;
  }
}

function isImportParent(node: ts.Node | undefined): node is (ts.ImportDeclaration | ts.ExportDeclaration | ts.CallExpression) {
  if (!node) return false;
  let { kind } = node;
  return (kind === ts.SyntaxKind.ImportDeclaration || kind === ts.SyntaxKind.ExportDeclaration || kind === ts.SyntaxKind.CallExpression);
}

function isImportDeclaration(node: ts.Node | undefined): node is ts.ImportDeclaration {
  if (!node) return false;
  return node.kind === ts.SyntaxKind.ImportDeclaration;
}

function isExportDeclaration(node: ts.Node | undefined): node is ts.ExportDeclaration {
  if (!node) return false;
  return node.kind === ts.SyntaxKind.ExportDeclaration;
}

function isNamespaceBinding(node: ts.Node): node is ts.NamespaceImport {
  return node.kind === ts.SyntaxKind.NamespaceImport;
}

//

// function getSymbolFlags(symbol: ts.Symbol): string[] {
//   let symbolFlags: string[] = [];
//   for (let key in ts.SymbolFlags) {
//     if (symbol.flags & (<any>ts.SymbolFlags)[key]) {
//       symbolFlags.push(key);
//     }
//   }
//   return symbolFlags;
// }

// function getNodeFlags(node: ts.Node): string[] {
//   let nodeFlags: string[] = [];
//   for (let key in ts.NodeFlags) {
//     if (node.flags & (<any>ts.NodeFlags)[key]) {
//       nodeFlags.push(key);
//     }
//   }
//   return nodeFlags;
// }
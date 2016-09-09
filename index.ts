import * as ts from "typescript";
import Graph, { Module } from "./graph";
// import assert = require("assert");

let modulesDir = ts.sys.resolvePath(__dirname + "/../../emberjs/ember.js/dist/es");
let options: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2015,
  module: ts.ModuleKind.ES2015,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  allowJs: true,
  // need outDir so it doesn't warm about over-writting input
  outDir: "_out_",
  baseUrl: modulesDir
};

let rootNames = ts.sys.readDirectory(modulesDir, ["js"]);
let host = ts.createCompilerHost(options);
let program = ts.createProgram(rootNames, options, host);
ts.getPreEmitDiagnostics(program);
let checker = program.getTypeChecker();
let graph = new Graph();

let moduleMap: {[fileName: string]: Module | undefined } = Object.create(null);

let moduleFiles: ts.SourceFile[] = [];

let resolveModule = (moduleSpecifier: ts.Node): Module | undefined => {
  let moduleSymbol = checker.getSymbolAtLocation(moduleSpecifier);
  if (!moduleSymbol) return;
  let { valueDeclaration } = moduleSymbol;
  if (!valueDeclaration) return;
  let sourceFile = valueDeclaration.getSourceFile();
  return moduleMap[sourceFile.fileName];
};

program.getSourceFiles().forEach(sourceFile => {
  if (sourceFile.isDeclarationFile) return;
  let { fileName } = sourceFile;
  if (!fileName.startsWith(modulesDir) || !fileName.endsWith(".js")) return;
  let relativePath = fileName.substring(modulesDir.length + 1);
  let moduleId = relativePath.substr(0, relativePath.length - 3);
  let moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol && moduleSymbol.getFlags() & ts.SymbolFlags.Module) {
    let mod = graph.addModule(moduleId);
    moduleMap[sourceFile.fileName] = mod;
    moduleFiles.push(sourceFile);
    let exports = checker.getExportsOfModule(moduleSymbol);
    exports.forEach(ex => mod.exports.add(ex.name));
  } else {
    console.error(`${moduleId} is not a module`);
  }
});

moduleFiles.forEach(sourceFile => {
  const mod = moduleMap[sourceFile.fileName];
  if (!mod) return;
  let imports: ts.ImportDeclaration[] = [];
  let exports: ts.ExportDeclaration[] = [];
  ts.forEachChild(sourceFile, (node) => {
    if (node.kind === ts.SyntaxKind.ImportDeclaration) {
      imports.push(<ts.ImportDeclaration>node);
    } else if (node.kind === ts.SyntaxKind.ExportDeclaration) {
      exports.push(<ts.ExportDeclaration>node);
    }
  });

  exports.forEach(ex => {
    let { moduleSpecifier } = ex;
    if (!moduleSpecifier) return;
    const fromModule = resolveModule(moduleSpecifier);
    if (!fromModule) {
      logUnresolvable(ex);
      return;
    }
    let exportClause = ex.exportClause;
    if (exportClause) {
      exportClause.elements.forEach(exportSpecifier => {
        let exportName = exportSpecifier.name.text;
        let fromName = exportSpecifier.propertyName && exportSpecifier.propertyName.text || exportName;
        let toExport = mod.exports.add(exportName);
        let fromExport = fromModule.exports.add(fromName);
        toExport.incoming.push(fromExport);
      });
    }
    if (!ex.exportClause) {
      // export * from "mod";
      fromModule.exports.forEach(fromExport => {
        let toExport = mod.exports.add(fromExport.name);
        toExport.incoming.push(fromExport);
      });
    }
  });

  // In case of:
  // import d from "mod" => name = d, namedBinding = undefined
  // import * as ns from "mod" => name = undefined, namedBinding: NamespaceImport = { name: ns }
  // import d, * as ns from "mod" => name = d, namedBinding: NamespaceImport = { name: ns }
  // import { a, b as x } from "mod" =>
  //        name = undefined, namedBinding: NamedImports =
  //           { elements: [{ name: a }, { name: x, propertyName: b}]}
  // import d, { a, b as x } from "mod" => name = d, namedBinding: NamedImports = { elements: [{ name: a }, { name: x, propertyName: b}]}
  // @kind(SyntaxKind.ImportClause)
  imports.forEach(im => {
    let { moduleSpecifier } = im;
    const fromModule = resolveModule(moduleSpecifier);
    if (!fromModule) {
      logUnresolvable(im);
      return;
    }

    let { importClause } = im;
    if (importClause) {
      let { name } = importClause;
      if (name) {
        // default import
        mod.imports.add(name.text).incoming.push(
          fromModule.exports.add("default")
        );
      }
      let { namedBindings } = importClause;
      if (namedBindings) {
        if (isNamedImports(namedBindings)) {
          namedBindings.elements.forEach(importSpecifier => {
            let importName = importSpecifier.name.text;
            let fromName = importSpecifier.propertyName && importSpecifier.propertyName.text || importName;
            let toImport = mod.imports.add(importName);
            let fromExport = fromModule.exports.add(fromName);
            toImport.incoming.push(fromExport);
          });
        } else {
          let importName = namedBindings.name.text;
          let toImport = mod.imports.add(importName);
          fromModule.exports.forEach(fromExport => {
            toImport.incoming.push(fromExport);
          });
        }
      }
    } else {
      // import "module";
      mod.incoming.push(fromModule);
    }
  });
});

function isNamedImports(node: ts.Node): node is ts.NamedImports {
  return node.kind === ts.SyntaxKind.NamedImports;
}

function logUnresolvable(node: ts.Node) {
  let file = getFilePrefix(node);
  console.error(`${file} unresolvable module ${JSON.stringify(node.getText())}`);
}

function getFilePrefix(node: ts.Node) {
  let sourceFile = node.getSourceFile();
  let loc = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  return `${ sourceFile.fileName }(${ loc.line + 1 },${ loc.character + 1 }): `;
}
//
console.log(graph.toDot());

/**
 *
 *     let imports: ts.ImportDeclaration[] = [];
    let exports: ts.ExportDeclaration[] = [];
    ts.forEachChild(sourceFile, (node) => {
      if (node.kind === ts.SyntaxKind.ImportDeclaration) {
        imports.push(<ts.ImportDeclaration>node);
      } else if (node.kind === ts.SyntaxKind.ExportDeclaration) {
        exports.push(<ts.ExportDeclaration>node);
      }
    });
    exports.forEach(ex => {
      let { moduleSpecifier } = ex;
      if (moduleSpecifier) {
        assert(moduleSpecifier.kind === ts.SyntaxKind.StringLiteral);
        let from = (<ts.StringLiteral>moduleSpecifier).text;

        if (ex.exportClause) {
          ex.exportClause.elements.forEach(() => {
            // let symbol = checker.getSymbolAtLocation(spec);
            // console.log(symbol && getSymbolFlags(symbol));
          });
          // export default or names from
        } else {
          // export * from
        }
      }
    });
 */
// function getSymbolFlags(symbol: ts.Symbol): string[] {
//   let names: string[] = [];
//   for (let name in ts.SymbolFlags) {
//     if (symbol.flags & Number(ts.SymbolFlags[name])) {
//       names.push(name);
//     }
//   }
//   return names;
// }



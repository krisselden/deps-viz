import * as ts from "typescript";
import FileCache, { FileCacheEntry } from "./file-cache";

export default function createHost(cache: FileCache, options: ts.CompilerOptions): ts.CompilerHost {
  let host = ts.createCompilerHost(options);

  return {
    fileExists: host.fileExists,
    readFile: host.readFile,
    trace: host.trace,
    getDirectories: host.getDirectories,
    getDefaultLibFileName: host.getDefaultLibFileName,
    getCurrentDirectory: () => cache.modulesRoot,
    getSourceFile: (fileName: string, languageVersion: ts.ScriptTarget, onError?: (message: string) => void) => {
      let entry = cache.get(fileName);
      if (entry.sourceFile) return entry.sourceFile;
      let sourceFile = host.getSourceFile(fileName, languageVersion, onError);
      Object.defineProperty(sourceFile, "commonJsModuleIndicator", {
        get: () => sourceFile["externalModuleIndicator"]
      });
      return entry.sourceFile = sourceFile;
    },
    writeFile: () => new Error("not implemented"),
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    resolveModuleNames: (moduleNames: string[], containingFile: string): ts.ResolvedModule[] => {
      let entry = cache.get(containingFile);
      if (entry.resolvedModules) return entry.resolvedModules;
      let resolvedModules = new Array(moduleNames.length);
      let imports: { [moduleName: string]: FileCacheEntry | undefined } = Object.create(null);
      for (let i = 0; i < moduleNames.length; i++) {
        let moduleName = moduleNames[i];
        let { resolvedModule } = ts.resolveModuleName(moduleName, containingFile, options, host);
        resolvedModules[i] = resolvedModule;
        if (resolvedModule && resolvedModule.resolvedFileName) {
          imports[moduleName] = cache.get(resolvedModule.resolvedFileName);
        }
      }
      entry.imports = imports;
      entry.resolvedModules = resolvedModules;
      return resolvedModules;
    }
  };
}

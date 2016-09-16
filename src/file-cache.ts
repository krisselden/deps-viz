import { SourceFile, ResolvedModule, sys } from "typescript";
import { Module } from "./graph";
import * as path from "path";

export interface ImportMap {
  [moduleName: string]: FileCacheEntry | undefined;
}

export interface FileCacheEntry {
  fileName: string;
  relative: string;
  moduleId: string;
  visited: boolean;
  sourceFile: SourceFile | undefined;
  imports: ImportMap | undefined;
  resolvedModules: ResolvedModule[] | undefined;
  moduleNode: Module | undefined;
}

const NORMALIZE_SLASHES = /\\/g;

function normalizeSlashes(path: string): string {
  return path.replace(NORMALIZE_SLASHES, "/");
}

export default class FileCache {
  private entries: {[fileName: string]: FileCacheEntry} = Object.create(null);
  public modulesRoot: string;

  constructor(modulesRoot: string) {
    this.modulesRoot = sys.resolvePath(modulesRoot);
  }

  get(fileName: string): FileCacheEntry {
    let entry = this.entries[fileName];
    if (!entry) {
      let modulesRoot = this.modulesRoot;
      let relative = path.relative(modulesRoot, fileName);
      let parsed = path.parse(relative);
      let moduleId = normalizeSlashes(parsed.dir) + "/" + parsed.name;

      this.entries[fileName] = entry = {
        fileName: fileName,
        relative: relative,
        moduleId: moduleId,
        visited: false,
        sourceFile: void 0,
        imports: void 0,
        resolvedModules: void 0,
        moduleNode: void 0
      };
    }
    return entry;
  }
}

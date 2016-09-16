export class Graph implements Node {
  public id = -1;
  public key: "";
  public parent = null;
  public nodeType = NodeType.Graph;

  public nodes: Node[] = [];
  public modules: Module[] = [];
  public moduleMap: { [moduleId: string]: Module } = Object.create(null);

  addModule(moduleId: string): Module {
    let m = this.moduleMap[moduleId];
    if (m) return m;
    m = addNode(this.nodes, new Module(this, moduleId));
    this.modules.push(m);
    this.moduleMap[moduleId] = m;
    return m;
  }
}

function findNode<T extends Node>(nodes: T[], key: string): T | undefined {
  let node;
  for (let i = 0; i < nodes.length; i++) {
    node = nodes[i];
    if (node.key === key) return node;
  }
}

function addNode<T extends Node>(nodes: Node[], node: T): T {
  node.id = nodes.length;
  nodes.push(node);
  return node;
}

export enum NodeType {
  Graph,
  Module,
  ImportName,
  ExportName
}

export interface Node {
  id: number;
  key: string;
  nodeType: NodeType;
  parent: Node | null;
}

export class Module implements Node {
  public nodeType = NodeType.Module;
  public key: string;
  public id = 0;

  public moduleImports: Module[] | undefined = undefined;
  public requires: Module[] | undefined = undefined;
  public namedImports: ImportName[] | undefined = undefined;
  public exports: ExportName[] | undefined = undefined;

  constructor(
    public parent: Graph,
    public moduleId: string) {
    this.key = moduleId;
  }

  addModuleImport(moduleNode: Module): void {
    let { moduleImports } = this;
    if (!moduleImports) moduleImports = this.moduleImports = [];
    if (!findNode(moduleImports, moduleNode.key)) {
      moduleImports.push(moduleNode);
    }
  }

  addRequire(moduleNode: Module) {
    let { requires } = this;
    if (!requires) requires = this.requires = [];
    if (!findNode(requires, moduleNode.key)) {
      requires.push(moduleNode);
    }
  }

  addNamedImport(name: string, fromNode: ExportName | Module) {
    let { namedImports } = this;
    if (!namedImports) namedImports = this.namedImports = [];
    let node = addNode(this.parent.nodes, new ImportName(this, name, fromNode));
    namedImports.push(node);
    return node;
  }

  getNamedImport(name: string): ImportName | undefined {
    let { namedImports } = this;
    if (!namedImports) return;
    return findNode(namedImports, name);
  }

  addExport(name: string): ExportName {
    let { exports } = this;
    if (!exports) exports = this.exports = [];
    let node = addNode(this.parent.nodes, new ExportName(this, name));
    exports.push(node);
    return node;
  }

  getExport(name: string): ExportName | undefined {
    let { exports } = this;
    if (!exports) return;
    return findNode(exports, name);
  }
}

export abstract class Name implements Node {
  abstract nodeType;
  public id = 0;
  public key: string;

  constructor(
    public parent: Module,
    public name: string) {
    this.key = name;
  }
}

export class ImportName extends Name {
  public nodeType = NodeType.ImportName;
  constructor(parent: Module, name: string, public from: ExportName | Module) {
    super(parent, name);
  }
}

export class ExportName extends Name {
  public nodeType = NodeType.ExportName;
  public id = 0;
  public key: string;
  public from: ExportName | undefined;

  constructor(parent: Module, name: string) {
    super(parent, name);
  }
}

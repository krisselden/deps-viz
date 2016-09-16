export default class Writer {
  private buffer = "";
  private _indent = "";

  indent(cb: (writer: this) => void) {
    let old = this._indent;
    this._indent = old + "  ";
    cb(this);
    this._indent = old;
  }

  line(line: string) {
    this.buffer += this._indent + line + "\n";
  }

  lines(lines: string) {
    this.buffer += this._indent + lines.split("\n").map(str => str.trim()).join("\n  ") + "\n";
  }

  toString() {
    return this.buffer;
  }
}
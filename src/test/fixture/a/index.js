import "./side-effect";
import * as Module from "./mod";
import { state } from "./state";

export const Mod = Module;
export function getState() {
  return state;
}

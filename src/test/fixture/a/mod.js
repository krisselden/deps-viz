import A1, { B as B1 } from "./mod1";
export function A() {
  return A1();
}
export function B() {
  return B1();
}
export {
  default as C2,
  D as D2,
  E as E2
} from "./mod2";
export {
  G as G3
} from "./mod3-export-star";

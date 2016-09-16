import { A, B } from "./mod";
import C, { D, E } from "./mod2";
import F, { G } from "./mod3";
import { setState } from "./state";

/* globals global */
setState({
  A: A(),
  B: B(),
  C: C(),
  D: D,
  E: E,
  F: F(),
  G: G
});

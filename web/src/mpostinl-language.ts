import { latex } from "codemirror-lang-latex";
import type { Extension } from "@codemirror/state";

import { findMetaPostRegions, metaPostOverlayForRegions } from "./metapost-language";
import { texHighlight } from "./tex-highlight";

/** mpostinl：LaTeX 骨架 + mpostfig/mpostdef 内 MetaPost 高亮 */
export function mpostinl(readonly: boolean): Extension[] {
  return [
    latex({
      enableLinting: false,
      enableAutocomplete: !readonly,
      enableTooltips: !readonly,
      autoCloseTags: !readonly,
      autoCloseBrackets: !readonly,
    }),
    ...texHighlight(),
    ...metaPostOverlayForRegions(findMetaPostRegions),
  ];
}

import type { LeafletEventHandlerFnMap } from "leaflet";

export function selectionHandlers(
  label: string,
  onSelect: () => void,
): LeafletEventHandlerFnMap {
  return {
    add(event) {
      const element = event.target.getElement() as SVGElement | undefined;
      element?.setAttribute("tabindex", "0");
      element?.setAttribute("role", "button");
      element?.setAttribute("aria-label", label);
      element?.setAttribute("aria-haspopup", "dialog");
    },
    click(event) {
      event.originalEvent?.stopPropagation();
      onSelect();
    },
    keydown(event) {
      if (
        event.originalEvent.key !== "Enter" &&
        event.originalEvent.key !== " "
      )
        return;
      event.originalEvent.preventDefault();
      event.originalEvent.stopPropagation();
      onSelect();
    },
  };
}

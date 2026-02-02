import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { appIcons } from "../../globals";
import { customButton } from "../components/custom-button";

export interface MainToolbarState {
    components: OBC.Components;
    world: OBC.World;
}

export const mainToolbarTemplate: BUI.StatefullComponent<MainToolbarState> = (
    state
) => {
    const { components, world } = state;

    const clipper = components.get(OBC.Clipper);
    const lengthMeasurer = components.get(OBF.LengthMeasurement);
    const areaMeasurer = components.get(OBF.AreaMeasurement);

    const onSlice = () => {
        clipper.enabled = !clipper.enabled;
        if (clipper.enabled) {
            clipper.create(world as any);
        } else {
            clipper.delete(world as any);
        }
    };

    const onMeasureLength = () => {
        lengthMeasurer.enabled = !lengthMeasurer.enabled;
        if (lengthMeasurer.enabled) lengthMeasurer.create();
        else lengthMeasurer.delete();
    };

    const onMeasureArea = () => {
        areaMeasurer.enabled = !areaMeasurer.enabled;
        if (areaMeasurer.enabled) areaMeasurer.create();
        else areaMeasurer.delete();
    };

    const onDelete = () => {
        if (clipper.enabled) clipper.delete(world as any);
        lengthMeasurer.delete();
        areaMeasurer.delete();
    };

    return BUI.html`
    <div class="glass-panel" style="display: flex; gap: 0.5rem; padding: 0.5rem; pointer-events: auto;">
      ${customButton({ onClick: onSlice, label: "Slice", icon: appIcons.CLIPPING })}
      ${customButton({ onClick: onMeasureLength, label: "Measure", icon: appIcons.RULER })}
      ${customButton({ onClick: onMeasureArea, label: "Area", icon: appIcons.AREA })}
      <div style="width: 1px; background: rgba(0,0,0,0.1); margin: 0 0.25rem;"></div>
      ${customButton({ onClick: onDelete, label: "Clear", icon: appIcons.DELETE })}
    </div>
  `;
};

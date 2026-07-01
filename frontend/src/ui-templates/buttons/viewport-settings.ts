import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as THREE from "three";
import { appIcons } from "../../globals";

interface ViewportSettingsState {
  components: OBC.Components;
  world: OBC.SimpleWorld<
    OBC.SimpleScene,
    OBC.OrthoPerspectiveCamera,
    OBF.PostproductionRenderer
  >;
}

export const viewportSettingsTemplate: BUI.StatefullComponent<
  ViewportSettingsState
> = (state) => {
  const { components, world } = state;

  const grids = components.get(OBC.Grids);

  const worldGrid = grids.list.get(world.uuid);
  let worldEnableCheckbox: BUI.TemplateResult | undefined;
  if (worldGrid) {
    const onToggleGrid = ({ target }: { target: BUI.Checkbox }) => {
      worldGrid.visible = target.checked;
      target.checked = worldGrid.visible;
    };

    worldEnableCheckbox = BUI.html`
      <bim-checkbox style="width: 15rem;" ?checked=${worldGrid.visible} label="Grid" @change=${onToggleGrid}></bim-checkbox>
    `;
  }

  const tiltSideViewForPerspective = async () => {
    const controls = world.camera.controls as any;
    if (!controls?.setLookAt) return;

    const position = new THREE.Vector3();
    const target = new THREE.Vector3();

    if (typeof controls.getPosition === "function") {
      controls.getPosition(position, false);
    } else {
      position.copy(world.camera.three.position);
    }

    if (typeof controls.getTarget === "function") {
      controls.getTarget(target, false);
    }

    const offset = position.clone().sub(target);
    const horizontalDistance = Math.hypot(offset.x, offset.z);
    if (horizontalDistance < 0.0001) return;

    const verticalRatio = Math.abs(offset.y) / horizontalDistance;
    if (verticalRatio >= 0.25) return;

    const direction = new THREE.Vector3(offset.x, 0, offset.z).normalize();
    const distance = Math.max(offset.length(), horizontalDistance, 10);
    const newPosition = target.clone().add(direction.multiplyScalar(horizontalDistance));
    newPosition.y = target.y + Math.max(distance * 0.35, 5);

    await controls.setLookAt(
      newPosition.x,
      newPosition.y,
      newPosition.z,
      target.x,
      target.y,
      target.z,
      true,
    );
  };

  const onProjectionChange = async ({ target }: { target: BUI.Dropdown }) => {
    const [projection] = target.value;
    if (!projection) return;

    await world.camera.projection.set(projection);
    if (projection === "Perspective") {
      await tiltSideViewForPerspective();
    }

    if (world.renderer) {
      world.renderer.postproduction.updateCamera();
    }
  };

  return BUI.html`
    <bim-button style="position: absolute; top: 0.5rem; right: 0.5rem; background-color: transparent;" icon=${appIcons.SETTINGS}>
      <bim-context-menu style="width: 15rem; gap: 0.25rem">
        ${worldEnableCheckbox}
        <bim-dropdown label="Camera Projection" @change=${onProjectionChange}>
          <bim-option label="Perspective" ?checked=${world.camera.projection.current === "Perspective"}></bim-option> 
          <bim-option label="Orthographic" ?checked=${world.camera.projection.current === "Orthographic"}></bim-option> 
        </bim-dropdown>
      </bim-context-menu> 
    </bim-button>
  `;
};

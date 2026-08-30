import * as THREE from "three";
import type { BIMMesh, FragmentsModel } from "@thatopen/fragments";
import { IfcEdgesGeometry } from "./ifc-edges-geometry";

type TileEvent = {
  key: string | number;
  value: BIMMesh;
};

type ModelBinding = {
  model: FragmentsModel;
  onTileAdded: (event: TileEvent) => void;
  onTileRemoved: (event: TileEvent) => void;
  hiddenItems: Set<number>;
  isolatedItems: Set<number> | null;
};

export class IfcEdgeOverlay {
  private readonly material = new THREE.LineBasicMaterial({
    color: 0x050505,
    depthTest: true,
    depthWrite: false,
    opacity: 0.68,
    transparent: true,
    toneMapped: false,
  });

  private readonly outlines = new WeakMap<BIMMesh, THREE.LineSegments>();
  private readonly bindings = new Map<string, ModelBinding>();
  private readonly featureAngle: number;
  private readonly smoothFacetAngle: number;
  private readonly depthBias: number;

  constructor(featureAngle = 35, smoothFacetAngle = 70, depthBias = 0.003) {
    this.featureAngle = featureAngle;
    this.smoothFacetAngle = smoothFacetAngle;
    this.depthBias = depthBias;
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.vhEdgeDepthBias = { value: this.depthBias };
      shader.vertexShader = `
        uniform float vhEdgeDepthBias;
        attribute float vhEdgeVisible;
        varying float vhEdgeVisibility;
        ${shader.vertexShader}
      `;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vhEdgeVisibility = vhEdgeVisible;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        float vhEdgeDistance = length(mvPosition.xyz);
        if (isPerspectiveMatrix(projectionMatrix)) {
          float vhEdgeScale = max(
            0.0,
            1.0 - vhEdgeDepthBias / max(vhEdgeDistance, vhEdgeDepthBias)
          );
          mvPosition.xyz *= vhEdgeScale;
        } else {
          mvPosition.z += vhEdgeDepthBias;
        }
        gl_Position = projectionMatrix * mvPosition;`,
      );
      shader.fragmentShader = `varying float vhEdgeVisibility;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace(
        "void main() {",
        `void main() {
        if (vhEdgeVisibility < 0.5) discard;`,
      );
    };
    this.material.customProgramCacheKey = () => "vh-ifc-edge-visibility-v2";
  }

  addModel(model: FragmentsModel) {
    if (this.bindings.has(model.modelId)) return;

    const onTileAdded = ({ value }: TileEvent) => this.addTile(model.modelId, value);
    const onTileRemoved = ({ value }: TileEvent) => this.removeTile(value);

    model.tiles.onItemSet.add(onTileAdded);
    model.tiles.onBeforeDelete.add(onTileRemoved);
    this.bindings.set(model.modelId, {
      model,
      onTileAdded,
      onTileRemoved,
      hiddenItems: new Set(),
      isolatedItems: null,
    });

    for (const tile of model.tiles.values()) this.addTile(model.modelId, tile);
  }

  removeModel(modelId: string) {
    const binding = this.bindings.get(modelId);
    if (!binding) return;

    binding.model.tiles.onItemSet.remove(binding.onTileAdded);
    binding.model.tiles.onBeforeDelete.remove(binding.onTileRemoved);
    for (const tile of binding.model.tiles.values()) this.removeTile(tile);
    this.bindings.delete(modelId);
  }

  async hideItems(itemsByModel: Record<string, Iterable<number>>) {
    await Promise.all([...this.bindings].map(async ([modelId, binding]) => {
      const geometryIds = await this.getGeometryIds(binding, itemsByModel[modelId]);
      if (geometryIds.length === 0) return;

      geometryIds.forEach((itemId) => {
        binding.hiddenItems.add(itemId);
        binding.isolatedItems?.delete(itemId);
      });
      this.forEachGeometry(binding, (geometry) => {
        geometry.setItemsVisible(geometryIds, false);
      });
    }));
  }

  async isolateItems(itemsByModel: Record<string, Iterable<number>>) {
    await Promise.all([...this.bindings].map(async ([modelId, binding]) => {
      const geometryIds = await this.getGeometryIds(binding, itemsByModel[modelId]);
      binding.hiddenItems.clear();
      binding.isolatedItems = new Set(geometryIds);
      this.forEachGeometry(binding, (geometry) => {
        geometry.isolateItems(geometryIds);
      });
    }));
  }

  showAllItems() {
    for (const binding of this.bindings.values()) {
      binding.hiddenItems.clear();
      binding.isolatedItems = null;
      this.forEachGeometry(binding, (geometry) => geometry.showAllItems());
    }
  }

  clear() {
    for (const modelId of [...this.bindings.keys()]) this.removeModel(modelId);
  }

  dispose() {
    this.clear();
    this.material.dispose();
  }

  private addTile(modelId: string, tile: BIMMesh) {
    if (this.outlines.has(tile)) return;

    const geometry = tile.geometry;
    if (geometry instanceof THREE.InstancedBufferGeometry) return;

    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const index = geometry.getIndex();
    if (!positions?.array || !normals?.array || (index && !index.array)) return;

    const edgeGeometry = new IfcEdgesGeometry(
      geometry,
      this.featureAngle,
      this.smoothFacetAngle,
    );
    const edgePositions = edgeGeometry.getAttribute("position");
    if (!edgePositions || edgePositions.count === 0) {
      edgeGeometry.dispose();
      return;
    }

    const binding = this.bindings.get(modelId);
    if (binding?.isolatedItems) {
      edgeGeometry.isolateItems(binding.isolatedItems);
    } else if (binding?.hiddenItems.size) {
      edgeGeometry.setItemsVisible(binding.hiddenItems, false);
    }

    const outline = new THREE.LineSegments(edgeGeometry, this.material);
    outline.name = "VH IFC Edge Overlay";
    outline.matrixAutoUpdate = false;
    outline.renderOrder = 10;
    outline.raycast = () => {};
    outline.userData.isIfcEdgeOverlay = true;

    tile.add(outline);
    this.outlines.set(tile, outline);
  }

  private async getGeometryIds(binding: ModelBinding, localIds?: Iterable<number>) {
    const ids = localIds ? [...localIds] : [];
    if (ids.length === 0) return [];
    return await binding.model.threads.invoke(
      binding.model.modelId,
      "getItemIdsByLocalIds",
      [ids],
    ) as number[];
  }

  private forEachGeometry(
    binding: ModelBinding,
    action: (geometry: IfcEdgesGeometry) => void,
  ) {
    for (const tile of binding.model.tiles.values()) {
      const outline = this.outlines.get(tile);
      if (outline) action(outline.geometry as IfcEdgesGeometry);
    }
  }

  private removeTile(tile: BIMMesh) {
    const outline = this.outlines.get(tile);
    if (!outline) return;

    tile.remove(outline);
    outline.geometry.dispose();
    this.outlines.delete(tile);
  }
}

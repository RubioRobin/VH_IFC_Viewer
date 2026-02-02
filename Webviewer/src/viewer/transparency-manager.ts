import * as THREE from "three";
import * as OBC from "@thatopen/components";

/**
 * TransparencyManager - Control element opacity for better visibility
 * 
 * This class manages material transparency for IFC elements, allowing users
 * to see through walls and other obstructions. It preserves original materials
 * so they can be restored.
 */
export class TransparencyManager {
    private components: OBC.Components;
    private originalMaterials: Map<string, THREE.Material | THREE.Material[]> = new Map();
    private currentTransparency: number = 1.0; // 1.0 = fully opaque

    constructor(components: OBC.Components) {
        this.components = components;
    }

    /**
     * Set transparency for specific elements
     * @param modelIdMap - Map of model IDs to element IDs
     * @param opacity - Opacity value (0 = fully transparent, 1 = fully opaque)
     */
    setTransparency(modelIdMap: OBC.ModelIdMap, opacity: number): void {
        const fragments = this.components.get(OBC.FragmentsManager);

        for (const [modelId, elementIds] of Object.entries(modelIdMap)) {
            const model = fragments.list.get(modelId);
            if (!model) continue;

            for (const elementId of elementIds) {
                const fragment = model.getFragmentByID(elementId);
                if (!fragment) continue;

                this.applyTransparencyToMesh(fragment.mesh, opacity, `${modelId}-${elementId}`);
            }
        }
    }

    /**
     * Set global transparency for all loaded models
     * @param opacity - Opacity value (0 = fully transparent, 1 = fully opaque)
     */
    setGlobalTransparency(opacity: number): void {
        this.currentTransparency = opacity;
        const fragments = this.components.get(OBC.FragmentsManager);

        for (const [modelId, model] of fragments.list) {
            model.object.traverse((obj) => {
                if (obj instanceof THREE.Mesh) {
                    this.applyTransparencyToMesh(obj, opacity, `${modelId}-${obj.uuid}`);
                }
            });
        }
    }

    /**
     * Apply transparency to a specific mesh
     */
    private applyTransparencyToMesh(
        mesh: THREE.Mesh | THREE.InstancedMesh,
        opacity: number,
        key: string
    ): void {
        // Store original material if not already stored
        if (!this.originalMaterials.has(key)) {
            this.originalMaterials.set(key, mesh.material);
        }

        // Handle both single material and material arrays
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

        materials.forEach((material) => {
            if (material instanceof THREE.Material) {
                material.transparent = opacity < 1.0;
                material.opacity = opacity;

                // Fix z-fighting and flickering issues
                if (opacity < 1.0) {
                    material.depthWrite = false; // Prevent depth buffer issues
                    material.side = THREE.DoubleSide; // Render both sides
                    mesh.renderOrder = 999; // Render transparent objects last
                } else {
                    material.depthWrite = true;
                    material.side = THREE.FrontSide;
                    mesh.renderOrder = 0;
                }

                material.needsUpdate = true;
            }
        });
    }

    /**
     * Reset all materials to their original state
     */
    resetTransparency(): void {
        const fragments = this.components.get(OBC.FragmentsManager);

        for (const [modelId, model] of fragments.list) {
            model.object.traverse((obj) => {
                if (obj instanceof THREE.Mesh) {
                    const key = `${modelId}-${obj.uuid}`;
                    const originalMaterial = this.originalMaterials.get(key);

                    if (originalMaterial) {
                        obj.material = originalMaterial;
                        this.originalMaterials.delete(key);
                    }
                }
            });
        }

        this.currentTransparency = 1.0;
    }

    /**
     * Quick presets
     */
    setGhostMode(): void {
        this.setGlobalTransparency(0.3);
    }

    setSolidMode(): void {
        this.setGlobalTransparency(1.0);
    }

    /**
     * Get current global transparency
     */
    getCurrentTransparency(): number {
        return this.currentTransparency;
    }
}

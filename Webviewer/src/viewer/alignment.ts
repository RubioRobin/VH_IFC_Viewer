import * as THREE from "three";
import * as OBC from "@thatopen/components";
// import { FragmentsGroup } from "@thatopen/fragments"; // Type not found explicitly, using any

/**
 * Alignment strategies for positioning models in the scene
 */
export enum AlignmentStrategy {
    /** No alignment - keep model at original position */
    NONE = "none",
    /** Align model bottom to grid (Y=0) */
    BOTTOM_TO_GRID = "bottom_to_grid",
    /** Center model at origin */
    CENTER = "center",
    /** Custom offset */
    CUSTOM = "custom",
}

/**
 * Method for calculating bounding boxes
 */
export enum BoundsCalculationMethod {
    /** Use engine's BoundingBoxer (accurate but slower) */
    BOUNDING_BOXER = "bounding_boxer",
    /** Fast manual scan of instance positions (faster but may be less accurate) */
    FAST_SCAN = "fast_scan",
    /** Use THREE.Box3.setFromObject (simple but unreliable for instanced meshes) */
    THREE_BOX3 = "three_box3",
}

export interface AlignmentOptions {
    strategy: AlignmentStrategy;
    method?: BoundsCalculationMethod;
    customOffset?: THREE.Vector3;
    logDetails?: boolean;
}

export interface BoundsResult {
    box: THREE.Box3;
    minY: number;
    maxY: number;
    height: number;
    method: BoundsCalculationMethod;
}

/**
 * ModelAligner - Custom alignment logic with full control
 * 
 * This class provides multiple strategies for aligning IFC models in the scene.
 * It gives us complete control over the alignment process, independent of the
 * library's built-in behavior.
 */
export class ModelAligner {
    private components: OBC.Components;
    private defaultMethod: BoundsCalculationMethod = BoundsCalculationMethod.FAST_SCAN;

    constructor(components: OBC.Components) {
        this.components = components;
    }

    /**
     * Main alignment function
     * @param model - The FragmentsModel to align
     * @param options - Alignment options
     */
    async alignModel(
        model: any,
        options: AlignmentOptions
    ): Promise<void> {
        const { strategy, method = this.defaultMethod, customOffset, logDetails = true } = options;

        if (strategy === AlignmentStrategy.NONE) {
            if (logDetails) console.log("[ModelAligner] Strategy: NONE - No alignment applied");
            return;
        }

        if (logDetails) {
            console.log(`[ModelAligner] Starting alignment with strategy: ${strategy}, method: ${method}`);
        }

        try {
            // Calculate bounds
            const bounds = await this.calculateBounds(model, method, logDetails);

            if (logDetails) {
                console.log(`[ModelAligner] Bounds calculated:`, {
                    minY: bounds.minY,
                    maxY: bounds.maxY,
                    height: bounds.height,
                    method: bounds.method,
                });
            }

            // Apply alignment based on strategy
            switch (strategy) {
                case AlignmentStrategy.BOTTOM_TO_GRID:
                    this.alignBottomToGrid(model, bounds, logDetails);
                    break;

                case AlignmentStrategy.CENTER:
                    this.alignCenter(model, bounds, logDetails);
                    break;

                case AlignmentStrategy.CUSTOM:
                    if (customOffset) {
                        this.applyOffset(model, customOffset, logDetails);
                    } else {
                        console.warn("[ModelAligner] CUSTOM strategy requires customOffset");
                    }
                    break;

                default:
                    console.warn(`[ModelAligner] Unknown strategy: ${strategy}`);
            }
        } catch (error) {
            console.error("[ModelAligner] Alignment failed:", error);
            throw error;
        }
    }

    /**
     * Calculate bounding box for a model using specified method
     */
    async calculateBounds(
        model: any,
        method: BoundsCalculationMethod,
        logDetails: boolean = false
    ): Promise<BoundsResult> {
        let box: THREE.Box3;

        switch (method) {
            case BoundsCalculationMethod.BOUNDING_BOXER:
                box = await this.calculateBoundsWithBoundingBoxer(model, logDetails);
                break;

            case BoundsCalculationMethod.FAST_SCAN:
                box = this.calculateBoundsWithFastScan(model, logDetails);
                break;

            case BoundsCalculationMethod.THREE_BOX3:
                box = this.calculateBoundsWithThreeBox3(model, logDetails);
                break;

            default:
                console.warn(`[ModelAligner] Unknown method: ${method}, falling back to FAST_SCAN`);
                box = this.calculateBoundsWithFastScan(model, logDetails);
        }

        return {
            box,
            minY: box.min.y,
            maxY: box.max.y,
            height: box.max.y - box.min.y,
            method,
        };
    }

    /**
     * Calculate bounds using the engine's BoundingBoxer component
     * Most accurate but slower
     */
    private async calculateBoundsWithBoundingBoxer(
        model: any,
        logDetails: boolean
    ): Promise<THREE.Box3> {
        if (logDetails) console.log("[ModelAligner] Using BoundingBoxer method");

        const bbox = this.components.get(OBC.BoundingBoxer);
        bbox.list.clear();

        // Get model ID from the fragments list
        const fragments = this.components.get(OBC.FragmentsManager);
        let modelId: string | null = null;
        for (const [id, m] of fragments.list) {
            if (m === model) {
                modelId = id;
                break;
            }
        }

        if (modelId) {
            bbox.addFromModels([new RegExp(`^${modelId}$`)]);
        } else {
            // Fallback: add all models (less precise but works)
            bbox.addFromModels();
        }

        const box = bbox.get();
        bbox.list.clear();

        return box;
    }

    /**
     * Calculate bounds using fast instance scanning
     * Faster but may be less accurate for complex rotations
     */
    private calculateBoundsWithFastScan(
        model: any,
        logDetails: boolean
    ): THREE.Box3 {
        if (logDetails) console.log("[ModelAligner] Using FAST_SCAN method");

        const tempBox = new THREE.Box3();
        const tempMatrix = new THREE.Matrix4();
        const globalBox = new THREE.Box3();

        let meshCount = 0;
        let instanceCount = 0;

        model.object.traverse((obj: any) => {
            if (obj instanceof THREE.Mesh) {
                meshCount++;
                const mesh = obj;
                const geom = mesh.geometry;

                if (!geom.boundingBox) {
                    geom.computeBoundingBox();
                }

                if (mesh instanceof THREE.InstancedMesh) {
                    for (let i = 0; i < mesh.count; i++) {
                        instanceCount++;
                        mesh.getMatrixAt(i, tempMatrix);
                        tempBox.copy(geom.boundingBox!).applyMatrix4(tempMatrix);
                        globalBox.union(tempBox);
                    }
                } else {
                    // Standard mesh
                    tempBox.copy(geom.boundingBox!).applyMatrix4(mesh.matrix);
                    globalBox.union(tempBox);
                }
            }
        });

        if (logDetails) {
            console.log(`[ModelAligner] Scanned ${meshCount} meshes, ${instanceCount} instances`);
        }

        // Safety check: if no geometry found, return a default box at origin
        if (meshCount === 0 && instanceCount === 0) {
            console.warn("[ModelAligner] No geometry found in model! Returning default box.");
            return new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
        }

        return globalBox;
    }

    /**
     * Calculate bounds using THREE.Box3.setFromObject
     * Simple but unreliable for instanced meshes
     */
    private calculateBoundsWithThreeBox3(
        model: any,
        logDetails: boolean
    ): THREE.Box3 {
        if (logDetails) console.log("[ModelAligner] Using THREE_BOX3 method");

        model.object.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model.object);
        return box;
    }

    /**
     * Align model bottom to grid (Y=0)
     */
    private alignBottomToGrid(
        model: any,
        bounds: BoundsResult,
        logDetails: boolean
    ): void {
        const offset = -bounds.minY;

        if (logDetails) {
            console.log(`[ModelAligner] Aligning bottom to grid. Current minY: ${bounds.minY}, offset: ${offset}`);
        }

        model.object.position.y += offset;
        model.object.updateMatrixWorld(true);

        if (logDetails) {
            console.log(`[ModelAligner] Model position after alignment: ${model.object.position.y}`);
        }
    }

    /**
     * Align model center to origin
     */
    private alignCenter(
        model: any,
        bounds: BoundsResult,
        logDetails: boolean
    ): void {
        const center = bounds.box.getCenter(new THREE.Vector3());
        const offset = -center.y;

        if (logDetails) {
            console.log(`[ModelAligner] Centering model. Current center Y: ${center.y}, offset: ${offset}`);
        }

        model.object.position.y += offset;
        model.object.updateMatrixWorld(true);

        if (logDetails) {
            console.log(`[ModelAligner] Model position after centering: ${model.object.position.y}`);
        }
    }

    /**
     * Apply custom offset to model
     */
    private applyOffset(
        model: any,
        offset: THREE.Vector3,
        logDetails: boolean
    ): void {
        if (logDetails) {
            console.log(`[ModelAligner] Applying custom offset:`, offset);
        }

        model.object.position.add(offset);
        model.object.updateMatrixWorld(true);

        if (logDetails) {
            console.log(`[ModelAligner] Model position after offset: ${model.object.position.toArray()}`);
        }
    }

    /**
     * Get the minimum Y value of a model (lowest point)
     */
    async getMinY(
        model: any,
        method: BoundsCalculationMethod = this.defaultMethod
    ): Promise<number> {
        const bounds = await this.calculateBounds(model, method, false);
        return bounds.minY;
    }

    /**
     * Set the default calculation method
     */
    setDefaultMethod(method: BoundsCalculationMethod): void {
        this.defaultMethod = method;
    }
}

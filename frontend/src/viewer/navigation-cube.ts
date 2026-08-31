import * as THREE from "three";
import type CameraControls from "camera-controls";

type NavigationTargetKind = "face" | "edge" | "corner";

interface NavigationTarget {
  kind: NavigationTargetKind;
  name: string;
  direction: THREE.Vector3;
  priority: number;
  faceMaterial?: THREE.MeshBasicMaterial;
  highlightMaterial?: THREE.MeshBasicMaterial;
}

interface NavigationCubeOptions {
  controls: CameraControls;
  getCamera: () => THREE.Camera;
}

interface FaceDefinition {
  label: string;
  name: string;
  direction: THREE.Vector3;
  up: THREE.Vector3;
  tone: "top" | "side" | "bottom";
}

const CUBE_HALF_SIZE = 0.72;
const CUBE_SIZE = CUBE_HALF_SIZE * 2;
const FACE_OFFSET = CUBE_HALF_SIZE + 0.006;
const PICK_DISTANCE_TOLERANCE = 0.16;
const TOP_VIEW_EPSILON = 0.0001;
const MAX_DEVICE_PIXEL_RATIO = 2;
const DEFAULT_VIEW_DIRECTION = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1);
const ORIGIN = new THREE.Vector3();
const BASE_FACE_COLOR = new THREE.Color("#ffffff");
const HOVER_FACE_COLOR = new THREE.Color("#dac99f");

const FACE_DEFINITIONS: FaceDefinition[] = [
  {
    label: "FRONT",
    name: "Vooraanzicht",
    direction: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    tone: "side",
  },
  {
    label: "BACK",
    name: "Achteraanzicht",
    direction: new THREE.Vector3(0, 0, -1),
    up: new THREE.Vector3(0, 1, 0),
    tone: "side",
  },
  {
    label: "RIGHT",
    name: "Rechteraanzicht",
    direction: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    tone: "side",
  },
  {
    label: "LEFT",
    name: "Linkeraanzicht",
    direction: new THREE.Vector3(-1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    tone: "side",
  },
  {
    label: "TOP",
    name: "Bovenaanzicht",
    direction: new THREE.Vector3(0, 1, 0),
    up: new THREE.Vector3(0, 0, -1),
    tone: "top",
  },
  {
    label: "BOTTOM",
    name: "Onderaanzicht",
    direction: new THREE.Vector3(0, -1, 0),
    up: new THREE.Vector3(0, 0, 1),
    tone: "bottom",
  },
];

const easeInOutCubic = (value: number) =>
  value < 0.5 ? 4 * value * value * value : 1 - (-2 * value + 2) ** 3 / 2;

const getFaceQuaternion = (normal: THREE.Vector3, up: THREE.Vector3) => {
  const zAxis = normal.clone().normalize();
  const yAxis = up.clone().addScaledVector(zAxis, -up.dot(zAxis)).normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  yAxis.crossVectors(zAxis, xAxis).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis),
  );
};

const createFaceTexture = (label: string, tone: FaceDefinition["tone"]) => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvascontext voor navigatiekubus ontbreekt.");

  const backgrounds = {
    top: ["rgba(83, 73, 52, 0.98)", "rgba(43, 40, 34, 0.98)"],
    side: ["rgba(47, 50, 52, 0.98)", "rgba(27, 29, 31, 0.98)"],
    bottom: ["rgba(31, 33, 35, 0.98)", "rgba(18, 19, 20, 0.98)"],
  } as const;
  const gradient = context.createLinearGradient(0, 0, 256, 256);
  gradient.addColorStop(0, backgrounds[tone][0]);
  gradient.addColorStop(1, backgrounds[tone][1]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  context.strokeStyle =
    tone === "top" ? "rgba(218, 201, 159, 0.82)" : "rgba(193, 169, 121, 0.56)";
  context.lineWidth = 10;
  context.strokeRect(5, 5, 246, 246);

  context.fillStyle = "rgba(244, 239, 228, 0.96)";
  context.font =
    label.length > 5
      ? "600 34px Outfit, Segoe UI, sans-serif"
      : "650 42px Outfit, Segoe UI, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 128, 130);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
};

const describeDirection = (
  direction: THREE.Vector3,
  kind: NavigationTargetKind,
) => {
  const parts: string[] = [];
  if (direction.y > 0.25) parts.push("boven");
  if (direction.y < -0.25) parts.push("onder");
  if (direction.x > 0.25) parts.push("rechts");
  if (direction.x < -0.25) parts.push("links");
  if (direction.z > 0.25) parts.push("voor");
  if (direction.z < -0.25) parts.push("achter");
  const prefix = kind === "corner" ? "Isometrisch" : "Schuin aanzicht";
  return `${prefix} · ${parts.join(" / ")}`;
};

const getStableViewDirection = (direction: THREE.Vector3) => {
  const stableDirection = direction.clone().normalize();
  if (Math.abs(stableDirection.dot(WORLD_UP)) > 0.9999) {
    stableDirection.z = TOP_VIEW_EPSILON;
    stableDirection.normalize();
  }
  return stableDirection;
};

const getViewQuaternion = (direction: THREE.Vector3) => {
  const stableDirection = getStableViewDirection(direction);
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(stableDirection, ORIGIN, WORLD_UP),
  );
};

export class NavigationCube {
  readonly element: HTMLElement;

  private readonly controls: CameraControls;
  private readonly getCamera: () => THREE.Camera;
  private readonly stage: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly overlayCamera = new THREE.OrthographicCamera(
    -1.28,
    1.28,
    1.28,
    -1.28,
    0.1,
    20,
  );
  private readonly cubeRoot = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickables: THREE.Object3D[] = [];
  private readonly targetsByKey = new Map<string, NavigationTarget>();
  private readonly disposableGeometries = new Set<THREE.BufferGeometry>();
  private readonly disposableMaterials = new Set<THREE.Material>();
  private readonly disposableTextures = new Set<THREE.Texture>();
  private readonly abortController = new AbortController();
  private readonly resizeObserver: ResizeObserver;
  private hoveredTarget: NavigationTarget | null = null;
  private renderFrameId: number | undefined;
  private cameraAnimationFrameId: number | undefined;
  private animationSequence = 0;
  private pixelRatio = 0;
  private disposed = false;

  constructor(options: NavigationCubeOptions) {
    this.controls = options.controls;
    this.getCamera = options.getCamera;

    this.element = document.createElement("aside");
    this.element.className = "viewer-navigation-cube";
    this.element.setAttribute("aria-label", "3D-navigatie");

    this.stage = document.createElement("div");
    this.stage.className = "viewer-navigation-cube__stage";
    this.stage.tabIndex = 0;
    this.stage.setAttribute("role", "button");
    this.stage.setAttribute(
      "aria-label",
      "3D-navigatiekubus. Gebruik Home, End en de pijltjestoetsen voor standaardaanzichten.",
    );
    this.stage.setAttribute(
      "aria-keyshortcuts",
      "Home End ArrowLeft ArrowRight ArrowUp ArrowDown",
    );

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.sortObjects = true;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "viewer-navigation-cube__canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.dataset.navigationCube = "canvas";
    this.stage.append(this.canvas);
    this.element.append(this.stage);

    this.overlayCamera.position.set(0, 0, 5);
    this.overlayCamera.lookAt(ORIGIN);
    this.scene.add(this.cubeRoot);
    this.createCubeGeometry();

    const signal = this.abortController.signal;
    this.stage.addEventListener("pointermove", this.onPointerMove, { signal });
    this.stage.addEventListener("pointerleave", this.onPointerLeave, {
      signal,
    });
    this.stage.addEventListener("pointerdown", this.onPointerDown, { signal });
    this.stage.addEventListener("click", this.onClick, { signal });
    this.stage.addEventListener("keydown", this.onKeyDown, { signal });
    this.controls.addEventListener("update", this.onCameraUpdate);
    this.controls.addEventListener("controlstart", this.onControlStart);

    this.resizeObserver = new ResizeObserver(() => this.requestRender());
    this.resizeObserver.observe(this.stage);
    this.requestRender();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.animationSequence += 1;
    if (this.renderFrameId !== undefined)
      window.cancelAnimationFrame(this.renderFrameId);
    if (this.cameraAnimationFrameId !== undefined) {
      window.cancelAnimationFrame(this.cameraAnimationFrameId);
    }
    this.abortController.abort();
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("update", this.onCameraUpdate);
    this.controls.removeEventListener("controlstart", this.onControlStart);
    this.disposableGeometries.forEach((geometry) => geometry.dispose());
    this.disposableMaterials.forEach((material) => material.dispose());
    this.disposableTextures.forEach((texture) => texture.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.element.remove();
  }

  private createCubeGeometry() {
    const coreGeometry = new THREE.BoxGeometry(
      CUBE_SIZE - 0.025,
      CUBE_SIZE - 0.025,
      CUBE_SIZE - 0.025,
    );
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: "#17191a",
      toneMapped: false,
    });
    this.trackGeometry(coreGeometry);
    this.trackMaterial(coreMaterial);
    this.cubeRoot.add(new THREE.Mesh(coreGeometry, coreMaterial));

    const faceGeometry = new THREE.PlaneGeometry(
      CUBE_SIZE - 0.02,
      CUBE_SIZE - 0.02,
    );
    this.trackGeometry(faceGeometry);
    for (const definition of FACE_DEFINITIONS) {
      const texture = createFaceTexture(definition.label, definition.tone);
      const material = new THREE.MeshBasicMaterial({
        color: BASE_FACE_COLOR,
        map: texture,
        side: THREE.FrontSide,
        toneMapped: false,
        transparent: true,
      });
      const mesh = new THREE.Mesh(faceGeometry, material);
      mesh.position.copy(definition.direction).multiplyScalar(FACE_OFFSET);
      mesh.quaternion.copy(
        getFaceQuaternion(definition.direction, definition.up),
      );
      mesh.renderOrder = 2;

      const target: NavigationTarget = {
        kind: "face",
        name: definition.name,
        direction: definition.direction.clone(),
        priority: 1,
        faceMaterial: material,
      };
      mesh.userData.navigationTarget = target;
      this.pickables.push(mesh);
      this.targetsByKey.set(definition.label.toLowerCase(), target);
      this.trackTexture(texture);
      this.trackMaterial(material);
      this.cubeRoot.add(mesh);
    }

    const edgeSourceGeometry = new THREE.BoxGeometry(
      CUBE_SIZE + 0.025,
      CUBE_SIZE + 0.025,
      CUBE_SIZE + 0.025,
    );
    const edgeGeometry = new THREE.EdgesGeometry(edgeSourceGeometry);
    edgeSourceGeometry.dispose();
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: "#c1a979",
      opacity: 0.66,
      transparent: true,
      toneMapped: false,
    });
    this.trackGeometry(edgeGeometry);
    this.trackMaterial(edgeMaterial);
    const outline = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    outline.renderOrder = 3;
    this.cubeRoot.add(outline);

    this.createEdgeTargets();
    this.createCornerTargets();
  }

  private createEdgeTargets() {
    const axes = ["x", "y", "z"] as const;
    for (const axis of axes) {
      const otherAxes = axes.filter((candidate) => candidate !== axis);
      for (const firstSign of [-1, 1]) {
        for (const secondSign of [-1, 1]) {
          const direction = new THREE.Vector3();
          direction[otherAxes[0]] = firstSign;
          direction[otherAxes[1]] = secondSign;
          direction.normalize();

          const pickSize = new THREE.Vector3(0.26, 0.26, 0.26);
          const highlightSize = new THREE.Vector3(0.105, 0.105, 0.105);
          pickSize[axis] = CUBE_SIZE - 0.3;
          highlightSize[axis] = CUBE_SIZE - 0.34;

          const position = new THREE.Vector3();
          position[otherAxes[0]] = firstSign * (CUBE_HALF_SIZE + 0.025);
          position[otherAxes[1]] = secondSign * (CUBE_HALF_SIZE + 0.025);

          const highlightMaterial = this.createHighlightMaterial(0);
          const highlightGeometry = new THREE.BoxGeometry(
            highlightSize.x,
            highlightSize.y,
            highlightSize.z,
          );
          const highlight = new THREE.Mesh(
            highlightGeometry,
            highlightMaterial,
          );
          highlight.position.copy(position);
          highlight.renderOrder = 4;
          this.trackGeometry(highlightGeometry);
          this.cubeRoot.add(highlight);

          const target: NavigationTarget = {
            kind: "edge",
            name: describeDirection(direction, "edge"),
            direction,
            priority: 2,
            highlightMaterial,
          };
          const pickMesh = this.createPickMesh(pickSize, position, target);
          this.cubeRoot.add(pickMesh);
        }
      }
    }
  }

  private createCornerTargets() {
    for (const xSign of [-1, 1]) {
      for (const ySign of [-1, 1]) {
        for (const zSign of [-1, 1]) {
          const direction = new THREE.Vector3(xSign, ySign, zSign).normalize();
          const position = new THREE.Vector3(
            xSign,
            ySign,
            zSign,
          ).multiplyScalar(CUBE_HALF_SIZE + 0.03);

          const highlightMaterial = this.createHighlightMaterial(0);
          const highlightGeometry = new THREE.BoxGeometry(0.18, 0.18, 0.18);
          const highlight = new THREE.Mesh(
            highlightGeometry,
            highlightMaterial,
          );
          highlight.position.copy(position);
          highlight.renderOrder = 5;
          this.trackGeometry(highlightGeometry);
          this.cubeRoot.add(highlight);

          const target: NavigationTarget = {
            kind: "corner",
            name: describeDirection(direction, "corner"),
            direction,
            priority: 3,
            highlightMaterial,
          };
          const pickMesh = this.createPickMesh(
            new THREE.Vector3(0.34, 0.34, 0.34),
            position,
            target,
          );
          this.cubeRoot.add(pickMesh);
        }
      }
    }
  }

  private createPickMesh(
    size: THREE.Vector3,
    position: THREE.Vector3,
    target: NavigationTarget,
  ) {
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const material = new THREE.MeshBasicMaterial({
      color: "#000000",
      opacity: 0,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.userData.navigationTarget = target;
    mesh.renderOrder = 6;
    this.pickables.push(mesh);
    this.trackGeometry(geometry);
    this.trackMaterial(material);
    return mesh;
  }

  private createHighlightMaterial(opacity: number) {
    const material = new THREE.MeshBasicMaterial({
      color: "#dac99f",
      opacity,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.trackMaterial(material);
    return material;
  }

  private trackGeometry(geometry: THREE.BufferGeometry) {
    this.disposableGeometries.add(geometry);
  }

  private trackMaterial(material: THREE.Material) {
    this.disposableMaterials.add(material);
  }

  private trackTexture(texture: THREE.Texture) {
    this.disposableTextures.add(texture);
  }

  private readonly onCameraUpdate = () => {
    this.requestRender();
  };

  private readonly onControlStart = () => {
    this.cancelCameraAnimation();
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const target = this.pickTarget(event.clientX, event.clientY);
    this.setHoveredTarget(target);
  };

  private readonly onPointerLeave = () => {
    this.setHoveredTarget(null);
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    event.stopPropagation();
  };

  private readonly onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const target = this.pickTarget(event.clientX, event.clientY);
    if (target) this.navigateTo(target);
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    const keyTargets: Partial<Record<string, string>> = {
      Home: "front",
      End: "back",
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "top",
      ArrowDown: "bottom",
    };
    let target = keyTargets[event.key]
      ? this.targetsByKey.get(keyTargets[event.key] as string)
      : undefined;
    if ((event.key === "Enter" || event.key === " ") && !target) {
      target = this.hoveredTarget ?? this.targetsByKey.get("front");
    }
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    this.navigateTo(target);
  };

  private pickTarget(clientX: number, clientY: number) {
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    this.pointer.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.overlayCamera);
    const intersections = this.raycaster.intersectObjects(
      this.pickables,
      false,
    );
    if (intersections.length === 0) return null;

    const nearestDistance = intersections[0].distance;
    const nearbyTargets = intersections
      .filter(
        (intersection) =>
          intersection.distance <= nearestDistance + PICK_DISTANCE_TOLERANCE,
      )
      .map(
        (intersection) =>
          intersection.object.userData.navigationTarget as NavigationTarget,
      )
      .filter(Boolean)
      .sort((first, second) => second.priority - first.priority);
    return nearbyTargets[0] ?? null;
  }

  private setHoveredTarget(target: NavigationTarget | null) {
    if (target === this.hoveredTarget) return;
    this.clearTargetHighlight(this.hoveredTarget);
    this.hoveredTarget = target;
    this.applyTargetHighlight(target);
    this.stage.dataset.hasTarget = String(Boolean(target));
    this.requestRender();
  }

  private applyTargetHighlight(target: NavigationTarget | null) {
    if (!target) return;
    target.faceMaterial?.color.copy(HOVER_FACE_COLOR);
    if (target.highlightMaterial) {
      target.highlightMaterial.opacity = target.kind === "corner" ? 0.92 : 0.78;
    }
  }

  private clearTargetHighlight(target: NavigationTarget | null) {
    if (!target) return;
    target.faceMaterial?.color.copy(BASE_FACE_COLOR);
    if (target.highlightMaterial) target.highlightMaterial.opacity = 0;
  }

  private navigateTo(target: NavigationTarget) {
    const currentTarget = new THREE.Vector3();
    const currentPosition = new THREE.Vector3();
    this.controls.getTarget(currentTarget, false);
    this.controls.getPosition(currentPosition, false);
    const distance = currentPosition.distanceTo(currentTarget);
    if (!Number.isFinite(distance) || distance <= Number.EPSILON) return;

    this.cancelCameraAnimation();
    this.controls.cancel();
    this.controls.setLookAt(
      currentPosition.x,
      currentPosition.y,
      currentPosition.z,
      currentTarget.x,
      currentTarget.y,
      currentTarget.z,
      false,
    );
    this.controls.update(0);

    const camera = this.getCamera();
    camera.updateWorldMatrix(true, false);
    const startQuaternion = camera.getWorldQuaternion(new THREE.Quaternion());
    const endQuaternion = getViewQuaternion(target.direction);
    const angle = startQuaternion.angleTo(endQuaternion);
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const duration = reducedMotion
      ? 0
      : THREE.MathUtils.clamp(250 + (angle / Math.PI) * 190, 280, 440);
    const sequence = ++this.animationSequence;
    const startedAt = performance.now();
    const interpolatedQuaternion = new THREE.Quaternion();
    const viewDirection = new THREE.Vector3();
    const position = new THREE.Vector3();
    const updateCamera = (timestamp: number) => {
      if (this.disposed || sequence !== this.animationSequence) return;
      const progress =
        duration === 0
          ? 1
          : THREE.MathUtils.clamp((timestamp - startedAt) / duration, 0, 1);
      interpolatedQuaternion.slerpQuaternions(
        startQuaternion,
        endQuaternion,
        easeInOutCubic(progress),
      );
      viewDirection
        .copy(LOCAL_FORWARD)
        .applyQuaternion(interpolatedQuaternion)
        .normalize();
      position.copy(currentTarget).addScaledVector(viewDirection, distance);
      this.controls.setLookAt(
        position.x,
        position.y,
        position.z,
        currentTarget.x,
        currentTarget.y,
        currentTarget.z,
        false,
      );
      this.controls.update(0);

      if (progress < 1) {
        this.cameraAnimationFrameId =
          window.requestAnimationFrame(updateCamera);
      } else {
        this.cameraAnimationFrameId = undefined;
      }
    };

    this.cameraAnimationFrameId = window.requestAnimationFrame(updateCamera);
  }

  private cancelCameraAnimation() {
    this.animationSequence += 1;
    if (this.cameraAnimationFrameId !== undefined) {
      window.cancelAnimationFrame(this.cameraAnimationFrameId);
      this.cameraAnimationFrameId = undefined;
    }
  }

  private requestRender() {
    if (this.disposed || this.renderFrameId !== undefined) return;
    this.renderFrameId = window.requestAnimationFrame(() => {
      this.renderFrameId = undefined;
      this.render();
    });
  }

  private render() {
    if (this.disposed) return;
    const width = Math.round(this.stage.clientWidth);
    const height = Math.round(this.stage.clientHeight);
    if (width <= 0 || height <= 0) return;
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      MAX_DEVICE_PIXEL_RATIO,
    );
    if (pixelRatio !== this.pixelRatio) {
      this.pixelRatio = pixelRatio;
      this.renderer.setPixelRatio(pixelRatio);
    }
    const drawingBufferWidth = Math.round(width * pixelRatio);
    const drawingBufferHeight = Math.round(height * pixelRatio);
    if (
      this.canvas.width !== drawingBufferWidth ||
      this.canvas.height !== drawingBufferHeight
    ) {
      this.renderer.setSize(width, height, false);
    }

    const camera = this.getCamera();
    camera.updateWorldMatrix(true, false);
    camera.getWorldQuaternion(this.cubeRoot.quaternion).invert();
    this.cubeRoot.updateMatrixWorld(true);
    this.renderer.render(this.scene, this.overlayCamera);
  }
}

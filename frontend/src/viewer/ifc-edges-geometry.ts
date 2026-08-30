import * as THREE from "three";

type EdgeData = {
  index0: number;
  index1: number;
  normal: THREE.Vector3;
  itemId: number | null;
  faceKey: string | null;
};

export class IfcEdgesGeometry extends THREE.BufferGeometry {
  private allPositions = new Float32Array();
  private edgeItemIds = new Int32Array();
  private edgeVisibility = new Uint8Array();
  private readonly edgesByItem = new Map<number, number[]>();
  private readonly unknownEdges: number[] = [];
  private readonly itemVisibility = new Map<number, boolean>();
  private defaultItemVisibility = true;

  constructor(
    geometry: THREE.BufferGeometry,
    featureAngle = 35,
    smoothFacetAngle = 70,
  ) {
    super();

    const indexAttribute = geometry.getIndex();
    const positionAttribute = geometry.getAttribute("position");
    const itemAttribute = geometry.getAttribute("id");
    const faceAttribute = geometry.getAttribute("color");
    if (!positionAttribute) return;

    const featureThreshold = Math.cos(THREE.MathUtils.DEG2RAD * featureAngle);
    const smoothFacetThreshold = Math.cos(
      THREE.MathUtils.DEG2RAD * smoothFacetAngle,
    );
    const indexCount = indexAttribute?.count ?? positionAttribute.count;
    const edgeData = new Map<string, EdgeData | null>();
    const vertices: number[] = [];
    const itemIds: number[] = [];
    const triangle = new THREE.Triangle();
    const normal = new THREE.Vector3();
    const boundaryFirst = new THREE.Vector3();
    const boundarySecond = new THREE.Vector3();
    const vertexIndices = [0, 0, 0];
    const vertexHashes = ["", "", ""];
    const triangleVertices = [triangle.a, triangle.b, triangle.c];
    const precision = 10_000;

    const getVertexHash = (vertex: THREE.Vector3) => `${
      Math.round(vertex.x * precision)
    },${Math.round(vertex.y * precision)},${Math.round(vertex.z * precision)}`;

    const getFaceKey = (index: number) => {
      if (!faceAttribute) return null;
      return `${faceAttribute.getX(index)},${faceAttribute.getY(index)},${
        faceAttribute.getZ(index)
      }`;
    };

    const pushEdge = (
      first: THREE.Vector3,
      second: THREE.Vector3,
      firstItemId: number | null,
      secondItemId: number | null = firstItemId,
    ) => {
      vertices.push(first.x, first.y, first.z, second.x, second.y, second.z);
      itemIds.push(firstItemId ?? -1, secondItemId ?? -1);
    };

    const shouldRenderEdge = (
      sibling: EdgeData,
      currentNormal: THREE.Vector3,
      currentItemId: number | null,
      currentFaceKey: string | null,
    ) => {
      if (
        sibling.itemId !== null
        && currentItemId !== null
        && sibling.itemId !== currentItemId
      ) {
        return true;
      }

      const normalDot = currentNormal.dot(sibling.normal);
      const isSameIfcFace = sibling.faceKey !== null
        && currentFaceKey !== null
        && sibling.faceKey === currentFaceKey;

      return normalDot <= (isSameIfcFace ? smoothFacetThreshold : featureThreshold);
    };

    for (let triangleOffset = 0; triangleOffset < indexCount; triangleOffset += 3) {
      for (let vertexOffset = 0; vertexOffset < 3; vertexOffset += 1) {
        vertexIndices[vertexOffset] = indexAttribute
          ? indexAttribute.getX(triangleOffset + vertexOffset)
          : triangleOffset + vertexOffset;
      }

      triangle.a.fromBufferAttribute(positionAttribute, vertexIndices[0]);
      triangle.b.fromBufferAttribute(positionAttribute, vertexIndices[1]);
      triangle.c.fromBufferAttribute(positionAttribute, vertexIndices[2]);
      triangle.getNormal(normal);

      for (let vertexOffset = 0; vertexOffset < 3; vertexOffset += 1) {
        vertexHashes[vertexOffset] = getVertexHash(triangleVertices[vertexOffset]);
      }

      if (
        vertexHashes[0] === vertexHashes[1]
        || vertexHashes[1] === vertexHashes[2]
        || vertexHashes[2] === vertexHashes[0]
      ) {
        continue;
      }

      const itemId = itemAttribute?.getX(vertexIndices[0]) ?? null;
      const faceKey = getFaceKey(vertexIndices[0]);

      for (let edgeOffset = 0; edgeOffset < 3; edgeOffset += 1) {
        const nextEdgeOffset = (edgeOffset + 1) % 3;
        const firstHash = vertexHashes[edgeOffset];
        const secondHash = vertexHashes[nextEdgeOffset];
        const hash = `${firstHash}_${secondHash}`;
        const reverseHash = `${secondHash}_${firstHash}`;
        const sibling = edgeData.get(reverseHash);

        if (sibling) {
          if (shouldRenderEdge(sibling, normal, itemId, faceKey)) {
            pushEdge(
              triangleVertices[edgeOffset],
              triangleVertices[nextEdgeOffset],
              itemId,
              sibling.itemId,
            );
          }
          edgeData.set(reverseHash, null);
        } else if (!edgeData.has(hash)) {
          edgeData.set(hash, {
            index0: vertexIndices[edgeOffset],
            index1: vertexIndices[nextEdgeOffset],
            normal: normal.clone(),
            itemId,
            faceKey,
          });
        }
      }
    }

    for (const edge of edgeData.values()) {
      if (!edge) continue;

      boundaryFirst.fromBufferAttribute(
        positionAttribute,
        edge.index0,
      );
      boundarySecond.fromBufferAttribute(
        positionAttribute,
        edge.index1,
      );
      pushEdge(boundaryFirst, boundarySecond, edge.itemId);
    }

    this.allPositions = new Float32Array(vertices);
    this.edgeItemIds = new Int32Array(itemIds);
    const edgeCount = this.edgeItemIds.length / 2;
    this.edgeVisibility = new Uint8Array(edgeCount * 2);
    this.edgeVisibility.fill(1);

    for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
      const firstItemId = this.edgeItemIds[edgeIndex * 2];
      const secondItemId = this.edgeItemIds[edgeIndex * 2 + 1];
      if (firstItemId < 0 && secondItemId < 0) this.unknownEdges.push(edgeIndex);
      this.addItemEdge(firstItemId, edgeIndex);
      if (secondItemId !== firstItemId) this.addItemEdge(secondItemId, edgeIndex);
    }

    this.setAttribute("position", new THREE.BufferAttribute(this.allPositions, 3));
    this.setAttribute(
      "vhEdgeVisible",
      new THREE.BufferAttribute(this.edgeVisibility, 1),
    );
  }

  setHiddenItems(hiddenItems: ReadonlySet<number>) {
    this.showAllItems();
    this.setItemsVisible(hiddenItems, false);
  }

  setItemsVisible(itemIds: Iterable<number>, visible: boolean) {
    const affectedEdges = new Set<number>();

    for (const itemId of itemIds) {
      if (visible === this.defaultItemVisibility) {
        this.itemVisibility.delete(itemId);
      } else {
        this.itemVisibility.set(itemId, visible);
      }

      for (const edgeIndex of this.edgesByItem.get(itemId) ?? []) {
        affectedEdges.add(edgeIndex);
      }
    }

    if (affectedEdges.size === 0) return;
    for (const edgeIndex of affectedEdges) this.updateEdgeVisibility(edgeIndex);
    this.markVisibilityForUpdate(affectedEdges);
  }

  isolateItems(itemIds: Iterable<number>) {
    this.defaultItemVisibility = false;
    this.itemVisibility.clear();
    this.edgeVisibility.fill(0);

    for (const edgeIndex of this.unknownEdges) this.setEdgeVisibility(edgeIndex, true);

    for (const itemId of itemIds) {
      this.itemVisibility.set(itemId, true);
      for (const edgeIndex of this.edgesByItem.get(itemId) ?? []) {
        this.setEdgeVisibility(edgeIndex, true);
      }
    }

    this.markVisibilityForUpdate();
  }

  showAllItems() {
    this.defaultItemVisibility = true;
    this.itemVisibility.clear();
    this.edgeVisibility.fill(1);
    this.markVisibilityForUpdate();
  }

  private addItemEdge(itemId: number, edgeIndex: number) {
    if (itemId < 0) return;
    const edges = this.edgesByItem.get(itemId);
    if (edges) {
      edges.push(edgeIndex);
    } else {
      this.edgesByItem.set(itemId, [edgeIndex]);
    }
  }

  private updateEdgeVisibility(edgeIndex: number) {
    const firstItemId = this.edgeItemIds[edgeIndex * 2];
    const secondItemId = this.edgeItemIds[edgeIndex * 2 + 1];
    const hasKnownItem = firstItemId >= 0 || secondItemId >= 0;
    const firstVisible = firstItemId >= 0 && this.isItemVisible(firstItemId);
    const secondVisible = secondItemId >= 0 && this.isItemVisible(secondItemId);
    this.setEdgeVisibility(edgeIndex, !hasKnownItem || firstVisible || secondVisible);
  }

  private isItemVisible(itemId: number) {
    return this.itemVisibility.get(itemId) ?? this.defaultItemVisibility;
  }

  private setEdgeVisibility(edgeIndex: number, visible: boolean) {
    const value = visible ? 1 : 0;
    this.edgeVisibility[edgeIndex * 2] = value;
    this.edgeVisibility[edgeIndex * 2 + 1] = value;
  }

  private markVisibilityForUpdate(affectedEdges?: ReadonlySet<number>) {
    const attribute = this.getAttribute("vhEdgeVisible") as THREE.BufferAttribute | undefined;
    if (!attribute) return;

    attribute.clearUpdateRanges();
    if (affectedEdges?.size) {
      let firstEdge = Infinity;
      let lastEdge = -Infinity;
      for (const edgeIndex of affectedEdges) {
        firstEdge = Math.min(firstEdge, edgeIndex);
        lastEdge = Math.max(lastEdge, edgeIndex);
      }
      attribute.addUpdateRange(firstEdge * 2, (lastEdge - firstEdge + 1) * 2);
    }
    attribute.needsUpdate = true;
  }
}

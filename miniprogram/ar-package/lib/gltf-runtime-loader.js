/*
 * Minimal GLB 2.0 runtime loader for the AR subpackage.
 *
 * It supports the static PBR mesh subset used by daji.glb: embedded buffers,
 * indexed triangle meshes, node transforms, PNG/JPEG textures and normal maps.
 */

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const COMPONENTS = {
  5120: { ArrayType: Int8Array, bytes: 1, getter: "getInt8" },
  5121: { ArrayType: Uint8Array, bytes: 1, getter: "getUint8" },
  5122: { ArrayType: Int16Array, bytes: 2, getter: "getInt16" },
  5123: { ArrayType: Uint16Array, bytes: 2, getter: "getUint16" },
  5125: { ArrayType: Uint32Array, bytes: 4, getter: "getUint32" },
  5126: { ArrayType: Float32Array, bytes: 4, getter: "getFloat32" },
};

const TYPE_SIZE = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

function readFile(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success: (res) => resolve(res.data),
      fail: reject,
    });
  });
}

function decodeUtf8(bytes) {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("utf-8").decode(bytes);
  }
  let output = "";
  let index = 0;
  while (index < bytes.length) {
    const first = bytes[index++];
    if (first < 0x80) {
      output += String.fromCharCode(first);
    } else if (first < 0xe0) {
      const second = bytes[index++];
      output += String.fromCharCode(((first & 0x1f) << 6) | (second & 0x3f));
    } else if (first < 0xf0) {
      const second = bytes[index++];
      const third = bytes[index++];
      output += String.fromCharCode(((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f));
    } else {
      const second = bytes[index++];
      const third = bytes[index++];
      const fourth = bytes[index++];
      let codePoint = ((first & 0x07) << 18) | ((second & 0x3f) << 12) | ((third & 0x3f) << 6) | (fourth & 0x3f);
      codePoint -= 0x10000;
      output += String.fromCharCode(0xd800 + (codePoint >> 10), 0xdc00 + (codePoint & 0x3ff));
    }
  }
  return output;
}

function parseGLB(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error("不是有效的 GLB 文件");
  }
  if (view.getUint32(4, true) !== 2) {
    throw new Error("仅支持 GLB 2.0");
  }

  let offset = 12;
  let json = null;
  let binary = null;
  while (offset + 8 <= view.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + length;
    if (end > view.byteLength) throw new Error("GLB 数据块长度异常");
    if (type === JSON_CHUNK) {
      const text = decodeUtf8(new Uint8Array(arrayBuffer, start, length)).replace(/[\u0000\s]+$/, "");
      json = JSON.parse(text);
    } else if (type === BIN_CHUNK) {
      binary = arrayBuffer.slice(start, end);
    }
    offset = end;
  }

  if (!json || !binary) throw new Error("GLB 缺少 JSON 或 BIN 数据块");
  if (json.extensionsRequired && json.extensionsRequired.length) {
    throw new Error(`模型包含暂不支持的扩展：${json.extensionsRequired.join(", ")}`);
  }
  return { json, binary };
}

function sliceBuffer(buffer, start, length) {
  return buffer.slice(start, start + length);
}

function createAccessor(json, binary, accessorIndex, THREE) {
  const accessor = json.accessors[accessorIndex];
  if (!accessor || accessor.bufferView === undefined) {
    throw new Error(`Accessor ${accessorIndex} 缺少 bufferView`);
  }
  const bufferView = json.bufferViews[accessor.bufferView];
  const component = COMPONENTS[accessor.componentType];
  const itemSize = TYPE_SIZE[accessor.type];
  if (!bufferView || !component || !itemSize) {
    throw new Error(`Accessor ${accessorIndex} 使用了不支持的数据格式`);
  }

  const viewOffset = Number(bufferView.byteOffset || 0);
  const accessorOffset = Number(accessor.byteOffset || 0);
  const byteOffset = viewOffset + accessorOffset;
  const packedStride = component.bytes * itemSize;
  const byteStride = Number(bufferView.byteStride || packedStride);
  let values;

  if (byteStride === packedStride && byteOffset % component.bytes === 0) {
    values = new component.ArrayType(binary, byteOffset, accessor.count * itemSize);
  } else {
    values = new component.ArrayType(accessor.count * itemSize);
    const dataView = new DataView(binary);
    for (let row = 0; row < accessor.count; row += 1) {
      for (let column = 0; column < itemSize; column += 1) {
        const sourceOffset = byteOffset + row * byteStride + column * component.bytes;
        values[row * itemSize + column] = dataView[component.getter](sourceOffset, true);
      }
    }
  }

  return new THREE.BufferAttribute(values, itemSize, !!accessor.normalized);
}

function writeImageFile(bytes, index, mimeType, assetKey) {
  const extension = mimeType === "image/jpeg" ? "jpg" : "png";
  const safeKey = String(assetKey || "model").replace(/[^a-zA-Z0-9_-]/g, "-");
  const filePath = `${wx.env.USER_DATA_PATH}/ar-${safeKey}-texture-${index}.${extension}`;
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath,
      data: bytes,
      success: () => resolve(filePath),
      fail: reject,
    });
  });
}

function createCanvasImage(canvas, filePath) {
  return new Promise((resolve, reject) => {
    const image = canvas.createImage();
    image.onload = () => resolve(image);
    image.onerror = (event) => reject(new Error(`纹理加载失败：${filePath} ${event && event.errMsg ? event.errMsg : ""}`));
    image.src = filePath;
  });
}

async function createTextures(json, binary, THREE, canvas, onProgress, assetKey) {
  const imageDefs = json.images || [];
  const images = [];
  for (let index = 0; index < imageDefs.length; index += 1) {
    const definition = imageDefs[index];
    if (definition.bufferView === undefined) {
      throw new Error("当前加载器仅支持 GLB 内嵌纹理");
    }
    const view = json.bufferViews[definition.bufferView];
    const bytes = sliceBuffer(binary, Number(view.byteOffset || 0), Number(view.byteLength || 0));
    const path = await writeImageFile(bytes, index, definition.mimeType || "image/png", assetKey);
    images[index] = await createCanvasImage(canvas, path);
    if (onProgress) onProgress(15 + Math.round(((index + 1) / Math.max(1, imageDefs.length)) * 40));
  }

  return (json.textures || []).map((definition) => {
    const texture = new THREE.Texture(images[definition.source]);
    texture.flipY = false;
    texture.needsUpdate = true;
    const sampler = (json.samplers || [])[definition.sampler] || {};
    if (sampler.wrapS === 33071) texture.wrapS = THREE.ClampToEdgeWrapping;
    if (sampler.wrapS === 33648) texture.wrapS = THREE.MirroredRepeatWrapping;
    if (sampler.wrapT === 33071) texture.wrapT = THREE.ClampToEdgeWrapping;
    if (sampler.wrapT === 33648) texture.wrapT = THREE.MirroredRepeatWrapping;
    return texture;
  });
}

function createMaterials(json, textures, THREE) {
  return (json.materials || []).map((definition) => {
    const pbr = definition.pbrMetallicRoughness || {};
    const color = pbr.baseColorFactor || [1, 1, 1, 1];
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color[0], color[1], color[2]),
      opacity: color[3] === undefined ? 1 : color[3],
      transparent: definition.alphaMode === "BLEND" || color[3] < 1,
      alphaTest: definition.alphaMode === "MASK" ? Number(definition.alphaCutoff || 0.5) : 0,
      metalness: pbr.metallicFactor === undefined ? 1 : pbr.metallicFactor,
      roughness: pbr.roughnessFactor === undefined ? 1 : pbr.roughnessFactor,
      side: definition.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    });
    material.name = definition.name || "";
    if (pbr.baseColorTexture) {
      material.map = textures[pbr.baseColorTexture.index];
      if (material.map && THREE.sRGBEncoding !== undefined) material.map.encoding = THREE.sRGBEncoding;
    }
    if (definition.normalTexture) {
      material.normalMap = textures[definition.normalTexture.index];
      const scale = definition.normalTexture.scale === undefined ? 1 : definition.normalTexture.scale;
      material.normalScale = new THREE.Vector2(scale, scale);
    }
    if (definition.emissiveFactor) {
      material.emissive = new THREE.Color(
        definition.emissiveFactor[0],
        definition.emissiveFactor[1],
        definition.emissiveFactor[2]
      );
    }
    material.needsUpdate = true;
    return material;
  });
}

function createMesh(json, binary, meshIndex, materials, THREE) {
  const definition = json.meshes[meshIndex];
  const group = new THREE.Group();
  group.name = definition.name || `mesh-${meshIndex}`;
  (definition.primitives || []).forEach((primitive, primitiveIndex) => {
    if (primitive.mode !== undefined && primitive.mode !== 4) {
      throw new Error("当前加载器只支持三角形网格");
    }
    const geometry = new THREE.BufferGeometry();
    const setAttribute = (name, attribute) => {
      if (typeof geometry.setAttribute === "function") geometry.setAttribute(name, attribute);
      else geometry.addAttribute(name, attribute);
    };
    const attributes = primitive.attributes || {};
    if (attributes.POSITION !== undefined) setAttribute("position", createAccessor(json, binary, attributes.POSITION, THREE));
    if (attributes.NORMAL !== undefined) setAttribute("normal", createAccessor(json, binary, attributes.NORMAL, THREE));
    if (attributes.TEXCOORD_0 !== undefined) setAttribute("uv", createAccessor(json, binary, attributes.TEXCOORD_0, THREE));
    if (primitive.indices !== undefined) geometry.setIndex(createAccessor(json, binary, primitive.indices, THREE));
    if (attributes.NORMAL === undefined) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const material = materials[primitive.material] || new THREE.MeshStandardMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${group.name}-${primitiveIndex}`;
    group.add(mesh);
  });
  return group;
}

function applyNodeTransform(object, definition, THREE) {
  object.name = definition.name || object.name;
  if (definition.matrix) {
    const matrix = new THREE.Matrix4().fromArray(definition.matrix);
    matrix.decompose(object.position, object.quaternion, object.scale);
    return;
  }
  if (definition.translation) object.position.fromArray(definition.translation);
  if (definition.rotation) object.quaternion.fromArray(definition.rotation);
  if (definition.scale) object.scale.fromArray(definition.scale);
}

function createScene(json, binary, materials, THREE) {
  const meshCache = (json.meshes || []).map((_, index) => createMesh(json, binary, index, materials, THREE));
  const nodes = (json.nodes || []).map((definition) => {
    const object = definition.mesh === undefined ? new THREE.Group() : meshCache[definition.mesh].clone(true);
    applyNodeTransform(object, definition, THREE);
    return object;
  });
  (json.nodes || []).forEach((definition, index) => {
    (definition.children || []).forEach((childIndex) => nodes[index].add(nodes[childIndex]));
  });

  const root = new THREE.Group();
  root.name = "GLBScene";
  const sceneIndex = json.scene === undefined ? 0 : json.scene;
  const sceneDefinition = (json.scenes || [])[sceneIndex] || { nodes: [] };
  (sceneDefinition.nodes || []).forEach((nodeIndex) => root.add(nodes[nodeIndex]));
  return root;
}

async function loadGLBScene(filePath, THREE, canvas, onProgress, assetKey) {
  if (!filePath || !THREE || !canvas) throw new Error("GLB 加载参数不完整");
  if (onProgress) onProgress(2);
  const arrayBuffer = await readFile(filePath);
  if (onProgress) onProgress(10);
  const { json, binary } = parseGLB(arrayBuffer);
  const textures = await createTextures(json, binary, THREE, canvas, onProgress, assetKey);
  if (onProgress) onProgress(62);
  const materials = createMaterials(json, textures, THREE);
  const scene = createScene(json, binary, materials, THREE);
  if (onProgress) onProgress(100);
  return { scene, animations: [] };
}

module.exports = { loadGLBScene };

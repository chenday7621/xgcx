/**
 * Lightweight GLB (GL Transmission Format Binary) loader for threejs-miniprogram.
 * Supports: positions, normals, UVs, triangle indices, materials, and basic textures.
 * Based on glTF 2.0 spec: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0
 */

const GLB_MAGIC = 0x46546C67; // 'glTF' in ASCII

/**
 * Load a GLB file from a URL or local path and return a Three.js Group.
 * @param {string} src - URL or local file path
 * @param {object} THREE - Three.js instance from createScopedThreejs
 * @param {function} onProgress - progress callback (0-100)
 * @returns {Promise<object>} - { scene: THREE.Group, animations: [] }
 */
function loadGLB(src, THREE, onProgress) {
  return new Promise((resolve, reject) => {
    if (src.startsWith("http://") || src.startsWith("https://")) {
      wx.request({
        url: src,
        responseType: "arraybuffer",
        success: (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          const buffer = res.data;
          parseGLB(buffer, THREE, onProgress).then(resolve).catch(reject);
        },
        fail: (err) => reject(new Error("Request failed: " + err.errMsg)),
      });
    } else {
      // Local file (temp path from wx.cloud.downloadFile)
      wx.getFileSystemManager().readFile({
        filePath: src,
        success: (res) => {
          // res.data is an ArrayBuffer when encoding is not specified
          const buffer = res.data;
          parseGLB(buffer, THREE, onProgress).then(resolve).catch(reject);
        },
        fail: (err) => reject(new Error("ReadFile failed: " + err.errMsg)),
      });
    }
  });
}

function parseGLB(buffer, THREE, onProgress) {
  // ---------- GLB Header (12 bytes) ----------
  const magic = getUint32(buffer, 0);
  if (magic !== GLB_MAGIC) {
    return Promise.reject(new Error("Not a valid GLB file: magic=" + magic.toString(16)));
  }
  const version = getUint32(buffer, 4);
  const length = getUint32(buffer, 8);

  // ---------- Chunk 1: JSON ----------
  const chunk1Length = getUint32(buffer, 12);
  const chunk1Type = getUint32(buffer, 16);

  if (chunk1Type !== 0x4E4F534A) {
    return Promise.reject(new Error("Expected JSON chunk, got type=" + chunk1Type));
  }

  const jsonBytes = buffer.slice(20, 20 + chunk1Length);
  const jsonText = decodeUTF8(jsonBytes);
  let gltf;
  try {
    gltf = JSON.parse(jsonText);
  } catch (e) {
    return Promise.reject(new Error("Invalid JSON in GLB: " + e.message));
  }

  // ---------- Chunk 2: Binary ----------
  let binaryBuffer = null;
  const binaryStart = 20 + chunk1Length;
  if (binaryStart < length) {
    const chunk2Length = getUint32(buffer, binaryStart);
    const chunk2Type = getUint32(buffer, binaryStart + 4);
    if (chunk2Type === 0x004E4942) {
      binaryBuffer = buffer.slice(binaryStart + 8, binaryStart + 8 + chunk2Length);
    }
  }

  // ---------- Build Three.js scene ----------
  console.info("[GLB] buildScene start, meshes:", gltf.meshes ? gltf.meshes.length : 0, "materials:", gltf.materials ? gltf.materials.length : 0, "textures:", gltf.textures ? gltf.textures.length : 0);

  return buildScene(gltf, binaryBuffer, THREE, onProgress).then(({ scene, animations }) => {
    console.info("[GLB] Scene built, applying textures...");
    // Apply textures after scene is built
    return applyTexturesToScene(scene, gltf, binaryBuffer, THREE).then(() => {
      console.info("[GLB] Texture application complete");
      return { scene, animations };
    }).catch((e) => {
      console.warn("[GLB] Texture application failed:", e);
      return { scene, animations };
    });
  });
}

function buildScene(gltf, binaryBuffer, THREE, onProgress) {
  const scene = new THREE.Group();
  const animations = [];
  const meshMap = {};

  // Default scene
  const defaultScene = gltf.scene !== undefined ? gltf.scenes[gltf.scene || 0] : gltf.scenes[0];
  if (!defaultScene) return Promise.resolve({ scene, animations });

  // Load buffer views into typed arrays
  const bufferViews = gltf.bufferViews || [];
  const buffers = (gltf.buffers || []).map((buf, i) => {
    if (!binaryBuffer) return null;
    if (!buf.byteStride) {
      return binaryBuffer;
    }
    return i === 0 ? binaryBuffer : null;
  });

  // Load accessors
  const accessors = gltf.accessors || [];

  // Process nodes
  const nodes = gltf.nodes || [];
  nodes.forEach((node, ni) => {
    let obj = null;

    if (node.mesh !== undefined) {
      const meshObj = buildMesh(gltf, node.mesh, THREE, buffers, accessors, bufferViews, onProgress);
      obj = meshObj;
    }

    if (node.camera !== undefined) {
      const camDef = gltf.cameras[node.camera];
      if (camDef && camDef.type === "perspective") {
        const p = camDef.perspective;
        obj = new THREE.PerspectiveCamera(
          THREE.MathUtils.radToDeg(p.yfov),
          p.aspectRatio || 1,
          p.znear || 0.01,
          p.zfar || 1000
        );
      }
    }

    if (!obj) {
      obj = new THREE.Object3D();
    }

    // Transform
    if (node.matrix) {
      const m = new THREE.Matrix4();
      m.fromArray(node.matrix);
      obj.matrixAutoUpdate = false;
      obj.matrix.copy(m);
    } else {
      if (node.translation) obj.position.fromArray(node.translation);
      if (node.rotation) obj.quaternion.fromArray(node.rotation);
      if (node.scale) obj.scale.fromArray(node.scale);
    }

    obj.name = node.name || "node_" + ni;
    meshMap[ni] = obj;
  });

  // Build hierarchy
  nodes.forEach((node, ni) => {
    const obj = meshMap[ni];
    if (!obj) return;
    if (node.children) {
      node.children.forEach((ci) => {
        const child = meshMap[ci];
        if (child) obj.add(child);
      });
    }
  });

  // Add root nodes of default scene
  (defaultScene.nodes || []).forEach((ni) => {
    const root = meshMap[ni];
    if (root) scene.add(root);
  });

  // Load animations (simplified)
  const anims = gltf.animations || [];
  anims.forEach((anim) => {
    if (anim.channels && anim.samplers) {
      animations.push({ name: anim.name || "anim", channels: anim.channels, samplers: anim.samplers });
    }
  });

  return Promise.resolve({ scene, animations });
}

function buildMesh(gltf, meshIndex, THREE, buffers, accessors, bufferViews, onProgress) {
  const meshDef = gltf.meshes[meshIndex];
  if (!meshDef) return new THREE.Group();

  const group = new THREE.Group();
  group.name = meshDef.name || "mesh_" + meshIndex;

  const primitives = meshDef.primitives || [];

  primitives.forEach((prim, pi) => {
    const geometry = new THREE.BufferGeometry();

    // Check for vertex colors
    let hasVertexColor = false;

    // Attributes
    const attrs = prim.attributes || {};
    Object.keys(attrs).forEach((attrName) => {
      const accessorIndex = attrs[attrName];
      const accessor = accessors[accessorIndex];
      if (!accessor) return;

      const typedArray = getAccessorData(accessor, buffers, bufferViews);
      if (!typedArray) return;

      // Map attribute names to Three.js format
      const threeAttrName = attrName === "POSITION" ? "position"
        : attrName === "NORMAL" ? "normal"
        : attrName === "TEXCOORD_0" ? "uv"
        : attrName === "COLOR_0" ? "color"
        : attrName;

      if (threeAttrName) {
        geometry.addAttribute(threeAttrName, new THREE.BufferAttribute(typedArray, getCompCount(accessor)));
        if (threeAttrName === "color") {
          hasVertexColor = true;
        }
      }
    });

    console.info("[GLB] primitive[" + pi + "] attributes:", Object.keys(attrs).join(","), "hasVertexColor:", hasVertexColor);

    // Indices
    if (prim.indices !== undefined) {
      const idxAccessor = accessors[prim.indices];
      if (idxAccessor) {
        const idxData = getAccessorData(idxAccessor, buffers, bufferViews);
        if (idxData) {
          geometry.index = new THREE.BufferAttribute(idxData, 1);
        }
      }
    }

    geometry.computeVertexNormals();

    // Material - create without textures first (will be updated async)
    let material;
    const matIndex = prim.material;
    if (matIndex !== undefined && gltf.materials) {
      const matDef = gltf.materials[matIndex];
      material = buildMaterial(matDef, THREE, null);
    }
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color: 0x888888, side: THREE.DoubleSide });
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = (meshDef.name || "mesh_" + meshIndex) + "_prim_" + pi;
    mesh._matDef = gltf.materials ? gltf.materials[matIndex] : null;
    mesh._primIndex = pi;
    group.add(mesh);
  });

  console.info("[GLB] buildMesh done, group children:", group.children.length, "name:", group.name);
  return group;
}

// Load textures from GLB binary data - saves to temp files and loads with TextureLoader
function loadTexturesFromGLB(gltf, buffers, bufferViews, THREE) {
  return new Promise((resolve) => {
    const gltfTextures = gltf.textures || [];
    const gltfImages = gltf.images || [];

    console.info("[GLB] loadTexturesFromGLB: textures:", gltfTextures.length, "images:", gltfImages.length);

    const textures = [];
    let pending = 0;
    let loaded = 0;

    gltfTextures.forEach((texDef, texIdx) => {
      const sourceIdx = texDef.source;
      if (sourceIdx === undefined) {
        textures[texIdx] = null;
        return;
      }

      const imageDef = gltfImages[sourceIdx];
      if (!imageDef) {
        textures[texIdx] = null;
        return;
      }

      let imageData = null;

      // Image data embedded in buffer view
      if (imageDef.bufferView !== undefined) {
        const bv = bufferViews[imageDef.bufferView];
        if (bv !== undefined) {
          const buffer = buffers[bv.buffer];
          if (buffer) {
            const byteOffset = (bv.byteOffset || 0) + (imageDef.byteOffset || 0);
            const byteLength = bv.byteLength;
            try {
              const slice = buffer.slice(byteOffset, byteOffset + byteLength);
              imageData = new Uint8Array(slice);
            } catch (e) {
              console.warn("[GLB] Failed to extract texture data:", e);
            }
          }
        }
      }

      if (!imageData) {
        textures[texIdx] = null;
        return;
      }

      // Determine image format - check magic bytes
      let ext = '.png';
      let mime = 'image/png';
      // Check for JPEG magic bytes (FF D8)
      if (imageData.length >= 2 && imageData[0] === 0xFF && imageData[1] === 0xD8) {
        ext = '.jpg';
        mime = 'image/jpeg';
        console.info("[GLB] Detected JPEG texture:", texIdx);
      } else if (imageData.length >= 4) {
        // Verify PNG header (89 50 4E 47)
        const isPng = imageData[0] === 0x89 && imageData[1] === 0x50 && imageData[2] === 0x4E && imageData[3] === 0x47;
        console.info("[GLB] Texture", texIdx, "is", isPng ? "valid PNG" : "unknown format",
          "header:", imageData[0].toString(16), imageData[1].toString(16), imageData[2].toString(16), imageData[3].toString(16));
      }

      // Save to temp file and load
      pending++;
      const tempPath = wx.env.USER_DATA_PATH + '/tex_' + texIdx + ext;
      const arrayBuffer = imageData.buffer.slice(imageData.byteOffset, imageData.byteOffset + imageData.byteLength);

      wx.getFileSystemManager().writeFile({
        filePath: tempPath,
        data: arrayBuffer,
        success: function() {
          const that = this;
          wx.getFileSystemManager().readFile({
            filePath: tempPath,
            encoding: 'base64',
            success: function(res) {
              var dataUri = 'data:' + mime + ';base64,' + res.data;
              var loader = new THREE.TextureLoader();
              loader.load(dataUri, function(tex) {
                tex.flipY = false;
                tex.generateMipmaps = true;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                if (typeof THREE.sRGBEncoding !== 'undefined') {
                  tex.encoding = THREE.sRGBEncoding;
                }
                tex.needsUpdate = true;
                textures[texIdx] = tex;
                loaded++;
                console.info("[GLB] Texture loaded:", texIdx, "size:", tex.image ? (tex.image.width + "x" + tex.image.height) : "unknown", "(" + loaded + "/" + pending + ")");
                if (loaded >= pending) {
                  resolve(textures);
                }
              }, undefined, function(err) {
                console.warn("[GLB] Texture load error:", texIdx, err);
                textures[texIdx] = null;
                loaded++;
                if (loaded >= pending) {
                  resolve(textures);
                }
              });
            },
            fail: function(err) {
              console.warn("[GLB] Failed to read texture file for base64:", texIdx, err);
              textures[texIdx] = null;
              loaded++;
              if (loaded >= pending) {
                resolve(textures);
              }
            }
          });
        },
        fail: function(err) {
          console.warn("[GLB] Failed to write texture file:", texIdx, err);
          textures[texIdx] = null;
          loaded++;
          if (loaded >= pending) {
            resolve(textures);
          }
        }
      });
    });

    // If no textures to load
    if (pending === 0) {
      resolve(textures);
    }
  });
}

function buildMaterial(matDef, THREE, textures) {
  if (!matDef) return null;

  const pb = matDef.pbrMetallicRoughness || {};
  const extensions = matDef.extensions || {};
  const specGloss = extensions.KHR_materials_pbrSpecularGlossiness || {};

  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
  mat.color = new THREE.Color(1, 1, 1);

  // Check for KHR_materials_pbrSpecularGlossiness first
  const diffuseTex = specGloss.diffuseTexture;
  const specularGlossinessTex = specGloss.specularGlossinessTexture;
  const diffuseFactor = specGloss.diffuseFactor;
  const specularFactor = specGloss.specularFactor;

  if (diffuseTex) {
    const texIndex = diffuseTex.index !== undefined ? diffuseTex.index : diffuseTex;
    console.info("[GLB] Using KHR_materials_pbrSpecularGlossiness diffuseTexture:", texIndex);
    // Ensure color is white so texture colors show through
    mat.color = new THREE.Color(1, 1, 1);
    if (texIndex !== undefined && textures && textures[texIndex]) {
      mat.map = textures[texIndex];
      if (typeof THREE.sRGBEncoding !== 'undefined') {
        mat.map.encoding = THREE.sRGBEncoding;
      }
      mat.map.needsUpdate = true;
      console.info("[GLB] Applied diffuseTexture:", texIndex);
    }

    // Apply diffuse factor if present
    if (diffuseFactor) {
      mat.color = new THREE.Color(diffuseFactor[0], diffuseFactor[1], diffuseFactor[2]);
      mat.opacity = diffuseFactor[3];
      if (diffuseFactor[3] < 1) mat.transparent = true;
    }
  }

  // Apply specular/glossiness if present
  // Note: specGloss textures require special conversion - skip for now to avoid WebGL errors
  if (specularGlossinessTex) {
    const texIndex = specularGlossinessTex.index !== undefined ? specularGlossinessTex.index : specularGlossinessTex;
    console.info("[GLB] specGloss texture found at index:", texIndex, "- using diffuse only");
  }

  // Fallback to standard PBR
  if (!diffuseTex) {
    // PBR base color
    if (pb.baseColorFactor) {
      const c = pb.baseColorFactor;
      mat.color = new THREE.Color(c[0], c[1], c[2]);
      mat.opacity = c[3];
      if (c[3] < 1) mat.transparent = true;
    } else {
      // Default to white so textured models show correct colors
      mat.color = new THREE.Color(1, 1, 1);
    }

    // Base color texture
    const baseColorTex = pb.baseColorTexture;
    if (baseColorTex) {
      const texIndex = baseColorTex.index !== undefined ? baseColorTex.index : baseColorTex;
      // Ensure color is white when texture is applied
      mat.color = new THREE.Color(1, 1, 1);
      if (texIndex !== undefined && textures && textures[texIndex]) {
        mat.map = textures[texIndex];
        if (typeof THREE.sRGBEncoding !== 'undefined') {
          mat.map.encoding = THREE.sRGBEncoding;
        }
        mat.map.needsUpdate = true;
        console.info("[GLB] Applied baseColorTexture:", texIndex);
      }
    }
  }

  mat.metalness = pb.metallicFactor !== undefined ? pb.metallicFactor : 0;
  mat.roughness = pb.roughnessFactor !== undefined ? pb.roughnessFactor : 0.5;

  // Handle normal texture
  if (matDef.normalTexture && textures) {
    const normalIndex = matDef.normalTexture.index;
    if (textures[normalIndex]) {
      mat.normalMap = textures[normalIndex];
      mat.normalMap.needsUpdate = true;
      if (matDef.normalTexture.scale !== undefined) {
        mat.normalScale = new THREE.Vector2(matDef.normalTexture.scale, matDef.normalTexture.scale);
      }
      console.info("[GLB] Applied normalTexture:", normalIndex);
    }
  }

  // Handle emissive texture
  if (matDef.emissiveTexture && textures) {
    const emissiveIndex = matDef.emissiveTexture.index;
    if (textures[emissiveIndex]) {
      mat.emissiveMap = textures[emissiveIndex];
      if (typeof THREE.sRGBEncoding !== 'undefined') {
        mat.emissiveMap.encoding = THREE.sRGBEncoding;
      }
      mat.emissiveMap.needsUpdate = true;
      console.info("[GLB] Applied emissiveTexture:", emissiveIndex);
    }
  }

  // Handle emissive factor
  if (matDef.emissiveFactor) {
    mat.emissive = new THREE.Color(matDef.emissiveFactor[0], matDef.emissiveFactor[1], matDef.emissiveFactor[2]);
  }

  if (matDef.doubleSided) mat.side = THREE.DoubleSide;

  // Handle alpha mode
  if (matDef.alphaMode === 'BLEND') {
    mat.transparent = true;
    mat.opacity = 0.5;
  } else if (matDef.alphaMode === 'MASK') {
    mat.alphaTest = 0.5;
  }

  // Enable vertex colors if present
  if (matDef._hasVertexColors) {
    mat.vertexColors = true;
  } else {
    mat.vertexColors = false;
  }

  console.info("[GLB] material:", matDef.name || "unnamed",
    "color:", mat.color.getHexString(),
    "map:", mat.map ? "yes" : "no",
    "normalMap:", mat.normalMap ? "yes" : "no",
    "emissiveMap:", mat.emissiveMap ? "yes" : "no",
    "metalness:", mat.metalness,
    "roughness:", mat.roughness);

  return mat;
}

// Export a function to apply textures to a loaded scene (call after loadGLB resolves)
function applyTexturesToScene(scene, gltf, binaryBuffer, THREE) {
  return new Promise((resolve) => {
    console.info("[GLB] applyTexturesToScene called");

    const bufferViews = gltf.bufferViews || [];
    const buffers = (gltf.buffers || []).map((buf, i) => {
      if (!binaryBuffer) return null;
      return i === 0 ? binaryBuffer : null;
    });

    // Load textures from GLB
    loadTexturesFromGLB(gltf, buffers, bufferViews, THREE).then((textures) => {
      console.info("[GLB] Textures loaded, applying to materials...");

      // Apply textures to all meshes
      let meshCount = 0;
      scene.traverse((obj) => {
        if (obj.isMesh && obj._matDef !== null) {
          const matDef = obj._matDef;
          // Check if geometry has vertex colors
          const hasVertexColors = obj.geometry && obj.geometry.attributes.color;
          const matDefWithVColors = Object.assign({}, matDef, { _hasVertexColors: hasVertexColors });
          const newMat = buildMaterial(matDefWithVColors, THREE, textures);
          if (newMat) {
            obj.material = newMat;
            meshCount++;
          }
        }
      });

      console.info("[GLB] Textures applied to", meshCount, "meshes");
      resolve();
    });
  });
}

// Export both functions
module.exports = { loadGLB, applyTexturesToScene };

function getAccessorData(accessor, buffers, bufferViews) {
  if (!accessor) return null;
  const bvIndex = accessor.bufferView;
  const bv = bufferViews[bvIndex];
  if (bv === undefined) return null;

  const buffer = buffers[bv.buffer];
  if (!buffer) return null;

  const byteOffset = (bv.byteOffset || 0) + (accessor.byteOffset || 0);
  const byteStride = bv.byteStride;
  const count = accessor.count;
  const compType = accessor.componentType;
  const compCount = getCompCount(accessor);

  if (byteStride && byteStride !== compCount * getCompSize(compType)) {
    // Interleaved — skip for simplicity
  }

  const totalBytes = count * compCount * getCompSize(compType);
  let slice;
  try {
    slice = buffer.slice(byteOffset, byteOffset + totalBytes);
  } catch (e) {
    const view = new Uint8Array(buffer, byteOffset, totalBytes);
    return new Uint8Array(view);
  }

  switch (compType) {
    case 5120: return new Int8Array(slice);
    case 5121: return new Uint8Array(slice);
    case 5122: return new Int16Array(slice);
    case 5123: return new Uint16Array(slice);
    case 5125: return new Uint32Array(slice);
    case 5126: return new Float32Array(slice);
    default:   return new Uint8Array(slice);
  }
}

function getCompCount(accessor) {
  const t = accessor.type;
  if (t === "SCALAR") return 1;
  if (t === "VEC2")   return 2;
  if (t === "VEC3")   return 3;
  if (t === "VEC4")   return 4;
  if (t === "MAT2")   return 4;
  if (t === "MAT3")   return 9;
  if (t === "MAT4")   return 16;
  return 3;
}

function getCompSize(compType) {
  if (compType === 5120 || compType === 5121) return 1;
  if (compType === 5122 || compType === 5123) return 2;
  if (compType === 5125) return 4;
  if (compType === 5126) return 4;
  return 1;
}

function getUint32(buffer, offset) {
  const view = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer || buffer);
  return view.getUint32(offset, true);
}

function decodeUTF8(buffer) {
  const arr = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let result = "";
  let i = 0;
  while (i < arr.length) {
    const c = arr[i++];
    if (c < 0x80) {
      result += String.fromCharCode(c);
    } else if (c < 0xE0) {
      result += String.fromCharCode(((c & 0x1F) << 6) | (arr[i++] & 0x3F));
    } else if (c < 0xF0) {
      result += String.fromCharCode(((c & 0x0F) << 12) | ((arr[i++] & 0x3F) << 6) | (arr[i++] & 0x3F));
    } else {
      const cp = ((c & 0x07) << 18) | ((arr[i++] & 0x3F) << 12) | ((arr[i++] & 0x3F) << 6) | (arr[i++] & 0x3F);
      if (cp > 0xFFFF) {
        result += String.fromCharCode(0xD800 + ((cp - 0x10000) >> 10));
        result += String.fromCharCode(0xDC00 + ((cp - 0x10000) & 0x3FF));
      } else {
        result += String.fromCharCode(cp);
      }
    }
  }
  return result;
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64Encode(str) {
  let result = '';
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i);
  }
  const len = bytes.length;
  let i = 0;
  while (i < len) {
    const b1 = bytes[i++];
    const b2 = i < len ? bytes[i++] : NaN;
    const b3 = i < len ? bytes[i++] : NaN;
    result += B64_CHARS[b1 >> 2];
    result += B64_CHARS[((b1 & 3) << 4) | (b2 >> 4)];
    result += isNaN(b2) ? '=' : B64_CHARS[((b2 & 15) << 2) | (b3 >> 6)];
    result += isNaN(b3) ? '=' : B64_CHARS[b3 & 63];
  }
  return result;
}

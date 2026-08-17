const app = getApp();
const { loadGLBScene } = require("../../lib/gltf-runtime-loader.js");

const MODEL_TARGET_SIZE = 1.1;
const MODEL_MIN_SCALE = 0.02;
const MODEL_MAX_SCALE = 10;
const FALLBACK_NEAR_SCALE = 1.6;
const FALLBACK_FAR_SCALE = 0.75;
const MODEL_FILE_ID = "cloud://cloud1-d9gd58pgib59d7259.636c-cloud1-d9gd58pgib59d7259-1420321518/daji.glb";

Page({
  data: {
    hasCameraAuth: false,
    cameraPosition: "back",
    arSupported: false,
    isScanning: false,
    planeDetected: false,
    projectionReady: false,
    scanProgress: 0,
    scanHint: "请授权摄像头后开始AR扫描",
    scanStatusText: "待启动",
    heroes: [
      {
        id: "hero-daji",
        name: "妲己",
        title: "女仆咖啡",
        effect: "妲己3D模型",
        intro: "王者荣耀英雄妲己的AR实景投影模型。",
        modelFileId: MODEL_FILE_ID,
      },
    ],
    heroIndex: 0,
    selectedHero: null,
    modelLoading: false,
    modelReady: false,
    modelError: "",
    heroVisible: false,
    heroPlaced: false,
    arEnabled: false,
    scanHistory: [],
  },

  onLoad() {
    this.scanTimer = null;
    this.scanProgressTimer = null;
    this.scanSafetyTimer = null;
    this.modelLoadTimer = null;
    this.vkSession = null;
    this.vkRafId = null;
    this.renderRafId = null;
    this.canvasReady = false;
    this.glReady = false;
    this.planeAnchors = [];
    this.modelTempPath = "";
    this._deviceMotionListening = false;
    this._deviceMotionHandler = null;
    this._fallbackYaw = 0;
    this._fallbackPitch = 0;
    this._targetYaw = 0;
    this._targetPitch = 0;
    this._placedBaseScale = 1;
    this.setData({ selectedHero: this.getHeroByIndex(0) });
    this.loadScanHistory();
    this.checkPermissionAndInit();
  },

  onReady() {
    if (this.data.hasCameraAuth) {
      setTimeout(() => this.initCanvas(), 300);
    }
  },

  onUnload() {
    this.stopAR();
    this.clearModelLoadTimer();
    this.clearScanSafetyTimeout();
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/index/index" });
  },

  checkPermissionAndInit() {
    wx.getSetting({
      success: (res) => {
        const hasAuth = !!res.authSetting["scope.camera"];
        this.setData({ hasCameraAuth: hasAuth });
        if (hasAuth) {
          this.initARCapability();
          setTimeout(() => this.initCanvas(), 300);
        }
      },
    });
  },

  requestCameraPermission() {
    wx.authorize({
      scope: "scope.camera",
      success: () => {
        this.setData({
          hasCameraAuth: true,
          scanHint: "摄像头授权成功，正在初始化AR引擎",
          scanStatusText: "已授权",
        });
        this.initARCapability();
        setTimeout(() => this.initCanvas(), 250);
      },
      fail: () => {
        wx.showModal({
          title: "需要摄像头权限",
          content: "请在设置中打开摄像头权限后再进行AR扫描。",
          confirmText: "去设置",
          success: (modalRes) => {
            if (!modalRes.confirm) return;
            wx.openSetting({
              success: (settingRes) => {
                const hasAuth = !!settingRes.authSetting["scope.camera"];
                this.setData({ hasCameraAuth: hasAuth });
                if (hasAuth) {
                  this.initARCapability();
                  setTimeout(() => this.initCanvas(), 250);
                }
              },
            });
          },
        });
      },
    });
  },

  initARCapability() {
    const supported = typeof wx.createVKSession === "function";
    this.setData({
      arSupported: supported,
      scanHint: supported
        ? "点击开始扫描，移动手机识别地面或桌面"
        : "当前设备不支持原生AR平面识别，将使用兼容投影模式",
    });
  },

  initCanvas() {
    if (!this.data.hasCameraAuth || this.canvasReady) return;
    const systemInfo = wx.getSystemInfoSync();
    const isSimulator = /wechatdevtools/i.test(`${systemInfo.platform || ""} ${systemInfo.model || ""}`);
    const dpr = Number(systemInfo.pixelRatio || 2);
    const queryCanvas = () => {
      wx.createSelectorQuery()
        .select("#ar-canvas")
        .fields({ node: true, size: true })
        .exec((result) => {
          if (this.canvasReady) return;
          const canvasInfo = result && result[0];
          if (!canvasInfo || !canvasInfo.node) {
            if (isSimulator) {
              this.setData({
                scanHint: "开发者工具不支持完整WebGL AR，请使用真机测试",
                modelError: "请在真机上测试AR功能",
              });
              return;
            }
            setTimeout(() => {
              if (!this.canvasReady) queryCanvas();
            }, 450);
            return;
          }

          this.canvas = canvasInfo.node;
          this.canvasCssWidth = Math.max(2, Number(canvasInfo.width || 300));
          this.canvasCssHeight = Math.max(2, Number(canvasInfo.height || 400));
          this.canvasWidth = Math.floor(this.canvasCssWidth * dpr);
          this.canvasHeight = Math.floor(this.canvasCssHeight * dpr);
          this.canvas.width = this.canvasWidth;
          this.canvas.height = this.canvasHeight;
          this.canvasReady = true;
          this.initThreeJS(dpr);
        });
    };
    queryCanvas();
  },

  initThreeJS(dpr) {
    try {
      const threeAdapter = require("../../lib/threejs-miniprogram.js");
      const createScopedThreejs = threeAdapter.createScopedThreejs ||
        (threeAdapter.default && threeAdapter.default.createScopedThreejs);
      if (typeof createScopedThreejs !== "function") {
        throw new Error("Three.js 小程序适配器不可用");
      }
      const THREE = createScopedThreejs(this.canvas);
      this.THREE = THREE;
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(dpr || 2);
      this.renderer.setSize(this.canvasCssWidth, this.canvasCssHeight, false);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.autoClear = false;
      if (THREE.sRGBEncoding !== undefined) this.renderer.outputEncoding = THREE.sRGBEncoding;

      this.scene = new THREE.Scene();
      this.scene.background = null;
      this.camera = new THREE.PerspectiveCamera(55, this.canvasCssWidth / this.canvasCssHeight, 0.01, 200);
      this.camera.position.set(0, 1.6, 3);
      this.camera.lookAt(0, 0, 0);
      this.camera.rotation.order = "YXZ";
      this.clock = new THREE.Clock();

      const hemisphere = new THREE.HemisphereLight(0xffffff, 0x555566, 1.5);
      hemisphere.position.set(0, 2, 0);
      this.scene.add(hemisphere);
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
      keyLight.position.set(1, 3, 2);
      this.scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xaacfff, 0.65);
      fillLight.position.set(-2, 1, -1);
      this.scene.add(fillLight);
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));

      this.glReady = true;
      this.startDeviceMotionFallback();
      this.startRenderLoop();
      this.setData({ scanHint: "AR渲染引擎就绪，正在准备妲己模型", modelError: "" });
      this.ensureSelectedHeroModel();
    } catch (error) {
      console.error("[AR] Three.js init failed", error);
      this.setData({
        modelError: `WebGL渲染引擎初始化失败：${error.message || error}`,
        scanHint: "渲染引擎初始化失败，请在支持AR的真机上测试",
      });
    }
  },

  startRenderLoop() {
    if (this.renderRafId || !this.canvas) return;
    const loop = () => {
      this.renderRafId = this.canvas.requestAnimationFrame(loop);
      this.renderFrame();
    };
    this.renderRafId = this.canvas.requestAnimationFrame(loop);
  },

  stopRenderLoop() {
    if (this.renderRafId && this.canvas) {
      this.canvas.cancelAnimationFrame(this.renderRafId);
      this.renderRafId = null;
    }
  },

  renderFrame() {
    if (!this.glReady || !this.renderer || !this.scene || !this.camera) return;
    const delta = this.clock ? this.clock.getDelta() : 0.016;
    if (this.data.heroPlaced && !this.vkSession) this.updateFallbackPseudoAR(delta);

    if (this.vkSession && this.vkFrame && this.vkFrame.camera) {
      try {
        const vkCamera = this.vkFrame.camera;
        this.camera.matrixAutoUpdate = false;
        this.camera.matrixWorldInverse.fromArray(vkCamera.viewMatrix);
        this.camera.matrixWorld.getInverse(this.camera.matrixWorldInverse);
        const projection = vkCamera.getProjectionMatrix(0.01, 200);
        if (projection) {
          this.camera.projectionMatrix.fromArray(projection);
          this.camera.projectionMatrixInverse.getInverse(this.camera.projectionMatrix);
        }
      } catch (error) {
        console.warn("[AR] update camera matrix failed", error);
      }
    }

    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, false, false);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
  },

  startDeviceMotionFallback() {
    if (this._deviceMotionListening || typeof wx.startDeviceMotionListening !== "function") return;
    this._deviceMotionHandler = (event) => {
      if (!event) return;
      const alpha = Number(event.alpha || 0) * Math.PI / 180;
      const beta = Number(event.beta || 0) * Math.PI / 180;
      this._targetYaw = alpha;
      this._targetPitch = Math.max(-1.1, Math.min(0.35, -beta));
    };
    wx.startDeviceMotionListening({
      interval: "game",
      success: () => {
        this._deviceMotionListening = true;
        wx.onDeviceMotionChange(this._deviceMotionHandler);
      },
      fail: (error) => console.warn("[AR] device motion unavailable", error),
    });
  },

  stopDeviceMotionFallback() {
    if (!this._deviceMotionListening) return;
    if (typeof wx.offDeviceMotionChange === "function" && this._deviceMotionHandler) {
      wx.offDeviceMotionChange(this._deviceMotionHandler);
    }
    wx.stopDeviceMotionListening({
      complete: () => {
        this._deviceMotionListening = false;
        this._deviceMotionHandler = null;
      },
    });
  },

  updateFallbackPseudoAR(delta) {
    if (!this.camera || !this.arModel || !this.THREE) return;
    this.camera.matrixAutoUpdate = true;
    const blend = Math.min(1, Number(delta || 0.016) * 7);
    this._fallbackYaw += (this._targetYaw - this._fallbackYaw) * blend;
    this._fallbackPitch += (this._targetPitch - this._fallbackPitch) * blend;
    this.camera.rotation.set(this._fallbackPitch, this._fallbackYaw, 0);
    const forward = new this.THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    if (Math.abs(forward.y) < 0.01) return;
    const hitDistance = -this.camera.position.y / forward.y;
    if (hitDistance <= 0) return;
    const hitPoint = this.camera.position.clone().add(forward.clone().multiplyScalar(hitDistance));
    const distance = this.camera.position.distanceTo(hitPoint);
    const ratio = Math.max(0, Math.min(1, (distance - 1) / 4));
    const factor = FALLBACK_NEAR_SCALE + (FALLBACK_FAR_SCALE - FALLBACK_NEAR_SCALE) * ratio;
    const targetScale = this._placedBaseScale * factor;
    const currentScale = this.arModel.scale.x;
    const nextScale = currentScale + (targetScale - currentScale) * blend;
    this.arModel.scale.setScalar(nextScale);
  },

  startScan() {
    if (!this.data.hasCameraAuth) {
      this.requestCameraPermission();
      return;
    }
    if (!this.glReady) {
      wx.showToast({ title: "AR引擎初始化中", icon: "none" });
      this.initCanvas();
      return;
    }
    if (this.data.isScanning) return;
    this.planeAnchors = [];
    if (this.arModel) this.arModel.visible = false;
    this.setData({
      isScanning: true,
      planeDetected: false,
      projectionReady: false,
      heroVisible: false,
      heroPlaced: false,
      arEnabled: false,
      scanProgress: 0,
      scanStatusText: "扫描中",
      scanHint: "请缓慢移动摄像头，让系统识别地面或桌面",
    });
    this.startScanProgress();
    this.startScanSafetyTimeout();
    this.startEnvironmentScan();
  },

  stopScan() {
    this.stopScanProgress();
    this.stopVKSession();
    this.clearScanSafetyTimeout();
    this.setData({ isScanning: false, scanStatusText: "已停止", scanHint: "扫描已停止，可重新开始AR扫描" });
  },

  toggleScan() {
    if (this.data.isScanning) this.stopScan();
    else this.startScan();
  },

  startScanProgress() {
    this.stopScanProgress();
    this.scanProgressTimer = setInterval(() => {
      if (!this.data.isScanning) return;
      this.setData({ scanProgress: Math.min(95, this.data.scanProgress + 5) });
    }, 300);
  },

  stopScanProgress() {
    if (this.scanProgressTimer) clearInterval(this.scanProgressTimer);
    this.scanProgressTimer = null;
  },

  startScanSafetyTimeout() {
    this.clearScanSafetyTimeout();
    this.scanSafetyTimer = setTimeout(() => {
      if (this.data.isScanning && !this.data.planeDetected) this.onPlaneDetected("timeout");
    }, 15000);
  },

  clearScanSafetyTimeout() {
    if (this.scanSafetyTimer) clearTimeout(this.scanSafetyTimer);
    this.scanSafetyTimer = null;
  },

  startEnvironmentScan() {
    if (this.data.arSupported && this.data.cameraPosition === "back") this.startVKSession();
    else this.startFallbackScan();
  },

  startVKSession() {
    try {
      this.stopVKSession();
      this.vkSession = wx.createVKSession({ track: { plane: { mode: 3 } }, version: "v2" });
      this.vkSession.start((error) => {
        if (error) {
          console.error("[AR] VKSession start failed", error);
          this.startFallbackScan();
          return;
        }
        this.vkSession.on("addAnchors", (anchors = []) => {
          anchors.forEach((anchor) => {
            if ((anchor.type === 0 || anchor.type === 1) && !this.planeAnchors.some((item) => item.id === anchor.id)) {
              this.planeAnchors.push(anchor);
            }
          });
          if (anchors.length) this.onPlaneDetected("plane");
        });
        this.vkSession.on("updateAnchors", (anchors = []) => {
          anchors.forEach((anchor) => {
            const index = this.planeAnchors.findIndex((item) => item.id === anchor.id);
            if (index >= 0) this.planeAnchors[index] = anchor;
          });
        });
        this.vkSession.on("removeAnchors", (anchors = []) => {
          this.planeAnchors = this.planeAnchors.filter((item) => !anchors.some((anchor) => anchor.id === item.id));
        });
        this.vkRafId = this.canvas.requestAnimationFrame(this.vkFrameLoop.bind(this));
      });
    } catch (error) {
      console.error("[AR] create VKSession failed", error);
      this.startFallbackScan();
    }
  },

  vkFrameLoop() {
    if (!this.vkSession) return;
    if (this.canvas) this.vkRafId = this.canvas.requestAnimationFrame(this.vkFrameLoop.bind(this));
    if (!this.glReady) return;
    try {
      const width = Math.max(2, Math.min(this.canvasWidth || 0, 640));
      const height = Math.max(2, Math.min(this.canvasHeight || 0, 640));
      const frame = this.vkSession.getVKFrame(width, height);
      if (frame) this.vkFrame = frame;
    } catch (error) {
      console.warn("[AR] getVKFrame failed", error);
    }
  },

  stopVKSession() {
    if (this.vkRafId && this.canvas) this.canvas.cancelAnimationFrame(this.vkRafId);
    this.vkRafId = null;
    this.vkFrame = null;
    if (this.vkSession) {
      try {
        this.vkSession.stop();
      } catch (error) {
        console.warn("[AR] stop VKSession failed", error);
      }
    }
    this.vkSession = null;
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = null;
  },

  startFallbackScan() {
    this.stopVKSession();
    this.scanTimer = setTimeout(() => {
      if (this.data.isScanning) this.onPlaneDetected("fallback");
    }, 2200);
  },

  onPlaneDetected(reason) {
    if (!this.data.isScanning || this.data.planeDetected) return;
    this.stopScanProgress();
    this.clearScanSafetyTimeout();
    const compatible = reason === "timeout" || reason === "fallback";
    this.setData({
      isScanning: false,
      planeDetected: true,
      projectionReady: true,
      arEnabled: true,
      scanProgress: 100,
      scanStatusText: compatible ? "兼容识别" : "识别完成",
      scanHint: this.data.modelReady
        ? compatible
          ? "已进入兼容模式，点击显示英雄进行投影"
          : "平面识别成功，点击显示英雄进行空间投影"
        : "平面已识别，妲己模型仍在加载中",
    });
    if (!this.data.modelReady && !this.data.modelLoading) this.ensureSelectedHeroModel();
    // 原生AR模式必须保持VKSession运行，供相机矩阵和Hit Test持续使用。
  },

  getHeroByIndex() {
    return this.data.heroes[0];
  },

  ensureSelectedHeroModel() {
    if (this.arModel || this.data.modelLoading) return Promise.resolve(!!this.arModel);
    if (!this.glReady) return Promise.resolve(false);
    const hero = this.data.selectedHero || this.getHeroByIndex(0);
    this.setData({ modelLoading: true, modelReady: false, modelError: "", scanHint: "正在从云存储下载妲己模型..." });
    this.startModelLoadTimer();

    const obtainPath = this.modelTempPath
      ? Promise.resolve(this.modelTempPath)
      : wx.cloud.downloadFile({ fileID: hero.modelFileId }).then((result) => {
          if (!result || !result.tempFilePath) throw new Error("云存储返回的模型路径为空");
          this.modelTempPath = result.tempFilePath;
          return result.tempFilePath;
        });

    return obtainPath
      .then((filePath) => this.loadModelFromPath(filePath))
      .catch((error) => {
        console.error("[AR] model download/load failed", error);
        this.clearModelLoadTimer();
        this.setData({
          modelLoading: false,
          modelReady: false,
          modelError: `妲己模型加载失败：${error.message || error}`,
          scanHint: "模型加载失败，请检查云存储文件权限",
        });
        return false;
      });
  },

  loadModelFromPath(filePath) {
    return loadGLBScene(filePath, this.THREE, this.canvas, (progress) => {
      this.setData({ scanHint: `妲己模型加载中 ${progress}%` });
    }).then(({ scene }) => {
      if (this.arModel && this.scene) this.scene.remove(this.arModel);
      const THREE = this.THREE;
      const root = scene;
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(maxDimension) || maxDimension <= 0.0001) throw new Error("模型尺寸数据无效");
      const scale = Math.max(MODEL_MIN_SCALE, Math.min(MODEL_MAX_SCALE, MODEL_TARGET_SIZE / maxDimension));
      root.scale.setScalar(scale);
      const alignedBox = new THREE.Box3().setFromObject(root);
      const center = alignedBox.getCenter(new THREE.Vector3());
      root.position.x -= center.x;
      root.position.z -= center.z;
      root.position.y -= alignedBox.min.y;
      root.visible = false;
      this.scene.add(root);
      this.arModel = root;
      this._placedBaseScale = root.scale.x || scale;
      this.clearModelLoadTimer();
      this.setData({
        modelLoading: false,
        modelReady: true,
        modelError: "",
        scanHint: this.data.projectionReady ? "妲己模型已就绪，点击显示英雄进行投影" : "妲己模型已就绪，请开始扫描",
      });
      return true;
    });
  },

  startModelLoadTimer() {
    this.clearModelLoadTimer();
    this.modelLoadTimer = setTimeout(() => {
      if (!this.data.modelReady) {
        this.setData({ modelLoading: false, modelError: "模型加载超时，请重新进入页面", scanHint: "妲己模型加载超时" });
      }
    }, 45000);
  },

  clearModelLoadTimer() {
    if (this.modelLoadTimer) clearTimeout(this.modelLoadTimer);
    this.modelLoadTimer = null;
  },

  placeHeroByTap(event) {
    if (!this.data.projectionReady || !this.data.modelReady) return;
    const touch = (event.changedTouches && event.changedTouches[0]) || (event.touches && event.touches[0]) || event.detail || {};
    const pageX = Number(touch.x !== undefined ? touch.x : touch.clientX || 0);
    const pageY = Number(touch.y !== undefined ? touch.y : touch.clientY || 0);
    wx.createSelectorQuery()
      .select("#ar-canvas")
      .boundingClientRect((rect) => {
        if (!rect) return;
        const nx = Math.max(0, Math.min(1, (pageX - rect.left) / Math.max(1, rect.width)));
        const ny = Math.max(0, Math.min(1, (pageY - rect.top) / Math.max(1, rect.height)));
        this.placeModelAtScreen(nx, ny);
      })
      .exec();
  },

  placeModelAtScreen(nx, ny) {
    if (!this.arModel) {
      wx.showToast({ title: this.data.modelLoading ? "模型加载中" : "模型未就绪", icon: "none" });
      return;
    }
    let placed = false;
    const applyPosition = (x, y, z) => {
      this.arModel.matrixAutoUpdate = true;
      this.arModel.position.set(x, y, z);
      this.arModel.rotation.set(0, 0, 0);
      this.arModel.scale.setScalar(this._placedBaseScale);
      this.arModel.visible = true;
      placed = true;
    };
    const placeInFront = () => {
      if (!this.camera || !this.THREE) {
        applyPosition(0, 0.35, 1.2);
        return;
      }
      this.camera.matrixAutoUpdate = true;
      const forward = new this.THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
      const target = this.camera.position.clone().add(forward.multiplyScalar(1.6));
      target.y = Math.max(0.1, this.camera.position.y - 0.8);
      applyPosition(target.x, target.y, target.z);
    };

    if (this.planeAnchors.length > 0) {
      const anchor = this.planeAnchors[0];
      if (anchor && anchor.transform) {
        const transform = anchor.transform;
        applyPosition(transform[12], transform[13], transform[14]);
      }
    }
    if (!placed && this.vkSession) {
      try {
        const hits = this.vkSession.hitTest(nx, ny);
        if (hits && hits.length && hits[0].transform) {
          const transform = hits[0].transform;
          const hasTranslation = Math.abs(transform[12]) + Math.abs(transform[13]) + Math.abs(transform[14]) > 0.001;
          if (hasTranslation) applyPosition(transform[12], transform[13], transform[14]);
        }
      } catch (error) {
        console.warn("[AR] hitTest failed", error);
      }
    }
    if (!placed) placeInFront();

    const firstPlacement = !this.data.heroPlaced;
    this.setData({
      heroPlaced: true,
      heroVisible: true,
      scanStatusText: placed ? "空间投影" : "兼容投影",
      scanHint: "妲己已完成AR投影，点击画面可重新定位",
    });
    if (firstPlacement) this.saveToHistory(this.buildHistoryEntry());
  },

  buildHistoryEntry() {
    return {
      id: Date.now(),
      name: "妲己投影",
      description: "女仆咖啡 · AR实景",
      playerAvatar: "🦊",
      team: "王者荣耀",
      bond: "AR互动",
      spirit: "探索",
      scenic: "当前环境",
      time: new Date().toLocaleTimeString(),
    };
  },

  toggleCameraPosition() {
    const nextPosition = this.data.cameraPosition === "back" ? "front" : "back";
    if (this.data.isScanning || this.vkSession) this.stopScan();
    this.setData({
      cameraPosition: nextPosition,
      scanHint: nextPosition === "back" ? "已切换后置镜头，可开始空间扫描" : "前置镜头使用兼容投影模式",
    });
  },

  toggleHeroProjection() {
    if (!this.data.projectionReady) {
      wx.showToast({ title: "请先完成扫描", icon: "none" });
      return;
    }
    if (!this.data.modelReady) {
      wx.showToast({ title: this.data.modelLoading ? "模型加载中" : "模型未就绪", icon: "none" });
      this.ensureSelectedHeroModel();
      return;
    }
    if (!this.data.heroPlaced) {
      this.placeModelAtScreen(0.5, 0.62);
      return;
    }
    const visible = !this.data.heroVisible;
    if (this.arModel) this.arModel.visible = visible;
    this.setData({ heroVisible: visible, scanHint: visible ? "妲己投影已显示" : "妲己投影已隐藏" });
  },

  onHeroChange() {
    this.setData({ heroIndex: 0, selectedHero: this.getHeroByIndex(0) });
  },

  saveToHistory(target) {
    const history = [target, ...this.data.scanHistory].slice(0, 10);
    this.setData({ scanHistory: history });
    wx.setStorageSync("arScanHistory", history);
  },

  loadScanHistory() {
    this.setData({ scanHistory: wx.getStorageSync("arScanHistory") || [] });
  },

  onHistoryTap() {
    if (!this.data.modelReady) {
      wx.showToast({ title: "模型准备中", icon: "none" });
      this.ensureSelectedHeroModel();
      return;
    }
    this.setData({ projectionReady: true, planeDetected: true, arEnabled: true, scanProgress: 100, scanStatusText: "历史回放" });
    this.placeModelAtScreen(0.5, 0.62);
  },

  askAI() {
    const question = "请介绍英雄妲己（女仆咖啡）的背景、技能风格和玩法建议";
    app.safeNavigateTo(`/pages/chat/chat?prefill=${encodeURIComponent(question)}`).catch((error) => {
      console.error("navigate askAI failed", error);
    });
  },

  viewFullKG() {
    wx.showModal({
      title: "妲己 · 英雄档案",
      content: `称号：女仆咖啡\n特性：妲己3D模型\n简介：王者荣耀英雄妲己的AR实景投影模型。\n3D模型：${this.data.modelReady ? "已加载" : this.data.modelError ? "加载失败" : "加载中"}\nAR状态：${this.data.heroPlaced ? "已投影" : "待投影"}`,
      confirmText: "生成玩法建议",
      success: (result) => {
        if (!result.confirm) return;
        app.safeNavigateTo(`/pages/chat/chat?prefill=${encodeURIComponent("根据英雄妲己给我一套适合新手的出装、连招和对局思路")}`).catch((error) => {
          console.error("navigate to chat failed", error);
        });
      },
    });
  },

  stopAR() {
    this.stopRenderLoop();
    this.stopVKSession();
    this.stopScanProgress();
    this.stopDeviceMotionFallback();
    if (this.arModel && this.scene) this.scene.remove(this.arModel);
    this.arModel = null;
    if (this.renderer && typeof this.renderer.dispose === "function") this.renderer.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.glReady = false;
  },
});

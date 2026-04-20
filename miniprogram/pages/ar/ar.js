const app = getApp();

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
        id: "hero-niumo",
        name: "牛魔",
        title: "测试模型",
        effect: "Owl.glb",
        intro: "云端测试模型：首次使用会从云存储下载到本地后加载。",
        // 需要把模型文件上传到微信云存储后，将 fileID 填到这里
        // 示例：cloud://<env-id>.<random>/<path>/niumo.glb
        modelFileId: "",
        modelUrl: "",
        modelType: "gltf",
      },
      {
        id: "hero-test",
        name: "测试机器人",
        title: "RobotExpressive",
        effect: "示例模型",
        intro: "用于验证3D模型加载链路，后续可替换为更多英雄模型。",
        modelUrl: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/RobotExpressive/glTF-Binary/RobotExpressive.glb",
        modelType: "gltf",
      },
    ],
    heroIndex: 0,
    selectedHero: null,
    modelLoading: false,
    modelReady: false,
    modelError: "",
    heroVisible: false,
    heroPosition: {
      xPercent: 50,
      yPercent: 62,
    },
    arEnabled: false,
    scanHistory: [],
  },

  onLoad() {
    this.scanTimer = null;
    this.scanProgressTimer = null;
    this.scanSafetyTimer = null;
    // init default hero
    this.setData({ selectedHero: this.getHeroByIndex(0) });
    this.ensureSelectedHeroModel();
    this.checkPermissionAndInit();
    this.loadScanHistory();
  },

  onUnload() {
    this.stopScanProgress();
    this.stopVKSession();
    this.clearScanSafetyTimeout();
  },

  checkPermissionAndInit() {
    wx.getSetting({
      success: (res) => {
        const hasAuth = !!res.authSetting["scope.camera"];
        this.setData({ hasCameraAuth: hasAuth });
        if (hasAuth) {
          this.initARCapability();
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
          scanHint: "摄像头授权成功，可开始AR扫描",
          scanStatusText: "已授权",
        });
        this.initARCapability();
      },
      fail: () => {
        wx.showModal({
          title: "需要摄像头权限",
          content: "请在设置中打开摄像头权限后再进行AR扫描。",
          confirmText: "去设置",
          success: (res) => {
            if (res.confirm) {
              wx.openSetting({
                success: (settingRes) => {
                  const hasAuth = !!settingRes.authSetting["scope.camera"];
                  this.setData({ hasCameraAuth: hasAuth });
                  if (hasAuth) {
                    this.initARCapability();
                  }
                },
              });
            }
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
        ? "移动手机扫描地面或桌面，识别可投影区域"
        : "当前设备不支持原生AR平面识别，将使用兼容扫描模式",
    });
  },

  startScan() {
    if (!this.data.hasCameraAuth) {
      this.requestCameraPermission();
      return;
    }
    if (this.data.isScanning) return;

    this.setData({
      isScanning: true,
      planeDetected: false,
      heroVisible: false,
      projectionReady: false,
      scanProgress: 0,
      scanStatusText: "扫描中",
      scanHint: "请缓慢移动摄像头，让系统识别平面",
      modelLoading: false,
      modelReady: false,
      modelError: "",
    });

    this.startScanProgress();
    this.startScanSafetyTimeout();
    this.startEnvironmentScan();
  },

  stopScan() {
    this.stopScanProgress();
    this.stopVKSession();
    this.clearScanSafetyTimeout();
    this.setData({
      isScanning: false,
      scanStatusText: "已停止",
      scanHint: "扫描已停止，可重新开始AR扫描",
    });
  },

  toggleScan() {
    if (this.data.isScanning) {
      this.stopScan();
      return;
    }
    this.startScan();
  },

  startScanProgress() {
    this.stopScanProgress();
    this.scanProgressTimer = setInterval(() => {
      if (!this.data.isScanning) return;
      const nextProgress = Math.min(95, this.data.scanProgress + 7);
      this.setData({ scanProgress: nextProgress });
    }, 350);
  },

  stopScanProgress() {
    if (this.scanProgressTimer) {
      clearInterval(this.scanProgressTimer);
      this.scanProgressTimer = null;
    }
  },

  startScanSafetyTimeout() {
    this.clearScanSafetyTimeout();
    this.scanSafetyTimer = setTimeout(() => {
      if (!this.data.isScanning || this.data.planeDetected) return;
      // Some devices never return plane anchors; force-complete to avoid frozen UI.
      this.onPlaneDetected("timeout");
    }, 9000);
  },

  clearScanSafetyTimeout() {
    if (this.scanSafetyTimer) {
      clearTimeout(this.scanSafetyTimer);
      this.scanSafetyTimer = null;
    }
  },

  startEnvironmentScan() {
    if (this.data.arSupported) {
      this.startVKSession();
      return;
    }
    this.startFallbackScan();
  },

  startVKSession() {
    try {
      this.stopVKSession();
      this.vkSession = wx.createVKSession({
        track: {
          plane: {
            mode: 1,
          },
        },
      });
      this.vkSession.start((err) => {
        if (err) {
          this.startFallbackScan();
          return;
        }
        this.vkSession.on("addAnchors", (anchors = []) => {
          if (anchors.length > 0) {
            this.onPlaneDetected();
          }
        });
      });
    } catch (error) {
      this.startFallbackScan();
    }
  },

  stopVKSession() {
    if (this.vkSession) {
      try {
        this.vkSession.stop();
      } catch (error) {
        // ignore stop error in downgrade cases
      }
      this.vkSession = null;
    }
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
  },

  startFallbackScan() {
    this.stopVKSession();
    this.scanTimer = setTimeout(() => {
      if (this.data.isScanning) {
        this.onPlaneDetected();
      }
    }, 2200);
  },

  onPlaneDetected(reason = "plane") {
    if (!this.data.isScanning || this.data.planeDetected) return;
    const hero = this.getDesignatedHero();
    const isTimeoutComplete = reason === "timeout";
    this.setData({
      planeDetected: true,
      projectionReady: true,
      heroVisible: true,
      selectedHero: hero,
      scanProgress: 100,
      scanStatusText: "扫描完成",
      scanHint: isTimeoutComplete
        ? "已完成兼容投影。若需更准定位，请继续缓慢移动手机后重试。"
        : "平面识别成功，英雄已完成投影。点击画面可移动投影点。",
      arEnabled: true,
      modelLoading: true,
      modelReady: false,
      modelError: "",
    });

    this.ensureSelectedHeroModel();
    this.saveToHistory({
      id: Date.now(),
      name: `${hero.name}投影`,
      description: `${hero.title} · ${hero.effect}`,
      playerAvatar: "🛡️",
      team: "王者荣耀",
      bond: "AR实景互动",
      spirit: "探索与沉浸",
      scenic: "当前环境",
      time: new Date().toLocaleTimeString(),
    });
    this.stopScanProgress();
    this.clearScanSafetyTimeout();
    this.stopVKSession();
  },

  getDesignatedHero() {
    return this.getHeroByIndex(this.data.heroIndex || 0);
  },

  getHeroByIndex(index) {
    const list = this.data.heroes || [];
    const safeIndex = Math.max(0, Math.min(list.length - 1, Number(index) || 0));
    return list[safeIndex] || {
      id: "hero-niumo",
      name: "牛魔",
      title: "测试模型",
      effect: "Owl.glb",
      intro: "云端测试模型：首次使用会从云存储下载到本地后加载。",
      modelFileId: "",
      modelUrl: "",
      modelType: "gltf",
    };
  },

  ensureSelectedHeroModel() {
    const hero = this.data.selectedHero;
    if (!hero) return Promise.resolve(false);

    // Already has a usable URL/path
    if (hero.modelUrl) return Promise.resolve(true);

    // Cloud file download flow (preferred for large models)
    if (hero.modelFileId) {
      this.setData({
        modelLoading: this.data.heroVisible && this.data.projectionReady,
        modelReady: false,
        modelError: "",
        scanHint: `正在下载${hero.name}模型...`,
      });
      return wx.cloud
        .downloadFile({
          fileID: hero.modelFileId,
        })
        .then((res) => {
          const tempFilePath = res && res.tempFilePath;
          if (!tempFilePath) {
            throw new Error("downloadFile returned empty tempFilePath");
          }
          this.setData({
            selectedHero: { ...hero, modelUrl: tempFilePath },
            modelLoading: false,
            modelReady: false,
            modelError: "",
            scanHint: `${hero.name}模型已下载，正在加载...`,
          });
          return true;
        })
        .catch((err) => {
          console.error("download model failed", err);
          this.setData({
            modelLoading: false,
            modelReady: false,
            modelError: "模型下载失败：请先将 glb 上传到云存储并填写 modelFileId",
            scanHint: "模型下载失败，已切换到简化投影显示",
          });
          return false;
        });
    }

    // No modelUrl and no cloud fileID
    this.setData({
      modelLoading: false,
      modelReady: false,
      modelError: "未配置模型来源：请填写 modelFileId 或 modelUrl",
    });
    return Promise.resolve(false);
  },

  placeHeroByTap(e) {
    if (!this.data.projectionReady) return;
    const { x = 0, y = 0 } = e.detail || {};
    const { windowWidth = 1, windowHeight = 1 } = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const xPercent = Math.max(12, Math.min(88, (x / windowWidth) * 100));
    const yPercent = Math.max(32, Math.min(82, (y / windowHeight) * 100));
    this.setData({
      heroVisible: true,
      heroPosition: { xPercent, yPercent },
      scanHint: "投影点已更新，可继续点击场景调整英雄位置",
    });
  },

  toggleCameraPosition() {
    this.setData({
      cameraPosition: this.data.cameraPosition === "back" ? "front" : "back",
    });
  },

  toggleHeroProjection() {
    if (!this.data.projectionReady) {
      wx.showToast({
        title: "请先完成扫描",
        icon: "none",
      });
      return;
    }
    const nextVisible = !this.data.heroVisible;
    this.setData({
      heroVisible: nextVisible,
      modelLoading:
        nextVisible &&
        !!(this.data.selectedHero && this.data.selectedHero.modelUrl) &&
        !this.data.modelError,
      modelReady: nextVisible ? false : this.data.modelReady,
    });
  },

  onModelLoad() {
    this.setData({
      modelLoading: false,
      modelReady: true,
      modelError: "",
      scanHint: "3D英雄模型加载成功，可点击画面调整投影位置",
    });
  },

  onModelError() {
    this.setData({
      modelLoading: false,
      modelReady: false,
      modelError: "3D模型加载失败，请检查模型链接与downloadFile合法域名配置",
      scanHint: "模型加载失败，已切换到简化投影显示",
    });
  },

  onHeroChange(e) {
    const idx = Number((e.detail && e.detail.value) || 0);
    const hero = this.getHeroByIndex(idx);
    this.setData({
      heroIndex: idx,
      selectedHero: hero,
      modelLoading: this.data.projectionReady && this.data.heroVisible,
      modelReady: false,
      modelError: "",
      scanHint: this.data.projectionReady
        ? `已切换英雄：${hero.name}，正在加载3D模型...`
        : `已选择英雄：${hero.name}，开始扫描后可投影`,
    });
    this.ensureSelectedHeroModel();
  },

  saveToHistory(target) {
    const history = [target, ...this.data.scanHistory].slice(0, 10);
    this.setData({ scanHistory: history });
    wx.setStorageSync("arScanHistory", history);
  },

  loadScanHistory() {
    this.setData({ scanHistory: wx.getStorageSync("arScanHistory") || [] });
  },

  onHistoryTap(e) {
    const historyTarget = e.currentTarget.dataset.target;
    this.setData({
      selectedHero: this.getDesignatedHero(),
      heroVisible: true,
      projectionReady: true,
      planeDetected: true,
      arEnabled: true,
      isScanning: false,
      scanHint: `已恢复历史记录：${historyTarget.name}`,
      scanStatusText: "历史回放",
    });
  },

  askAI() {
    const target = this.data.selectedHero;
    if (!target) return;
    app
      .safeNavigateTo(`/pages/chat/chat?prefill=${encodeURIComponent(`请介绍英雄${target.name}（${target.title}）的背景、技能风格和玩法建议`)}`)
      .catch((err) => {
        console.error("navigate askAI failed", err);
      });
  },

  viewFullKG() {
    const t = this.data.selectedHero;
    if (!t) return;
    wx.showLoading({
      title: "正在打开英雄详情",
      mask: true,
    });
    setTimeout(() => {
      wx.hideLoading();
      wx.showModal({
        title: `${t.name} · 英雄档案`,
        content: `称号: ${t.title}\n特性: ${t.effect}\n简介: ${t.intro}\n3D模型: ${this.data.modelReady ? "已加载" : this.data.modelError ? "失败" : "加载中"}\n状态: AR投影已启用`,
        confirmText: "生成玩法建议",
        success: (res) => {
          if (res.confirm) {
            app
              .safeNavigateTo(
                `/pages/chat/chat?prefill=${encodeURIComponent(`根据英雄${t.name}给我一套适合新手的出装、连招和对局思路`)}`
              )
              .catch((err) => {
                console.error("navigate to chat failed", err);
              });
          }
        },
      });
    }, 150);
  },
});

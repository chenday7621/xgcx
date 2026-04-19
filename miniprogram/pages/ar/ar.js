const app = getApp();

Page({
  data: {
    isScanning: false,
    hasCameraAuth: false,
    cameraPosition: "back",
    flashMode: "off",
    recognizedTarget: null,
    scanHint: "正在扫描电竞IP标识...",
    arEnabled: false,
    scanHistory: [],
  },

  onLoad() {
    this.checkPermission();
    this.loadScanHistory();
  },

  checkPermission() {
    wx.getSetting({
      success: (res) => this.setData({ hasCameraAuth: !!res.authSetting["scope.camera"] }),
    });
  },

  toggleScan() {
    if (!this.data.hasCameraAuth) {
      wx.showModal({
        title: "需要摄像头权限",
        content: "请先在设置中授权摄像头权限",
        success: (res) => {
          if (res.confirm) wx.openSetting();
        },
      });
      return;
    }
    if (this.data.isScanning) {
      this.setData({ isScanning: false });
      return;
    }
    this.setData({ isScanning: true, recognizedTarget: null });
    setTimeout(() => this.recognizeTarget(), 1500);
  },

  recognizeTarget() {
    if (!this.data.isScanning) return;
    const targets = [
      { id: 1, name: "EDG冠军奖杯", description: "2021年LPL夏季赛冠军奖杯", playerAvatar: "🏆", team: "EDG", bond: "Meiko与Scout多年默契配合", spirit: "团结拼搏，永不言弃", scenic: "上海电竞中心", time: new Date().toLocaleTimeString() },
      { id: 2, name: "AG超玩会主场", description: "成都AG超玩会主场场馆", playerAvatar: "⚡", team: "AG超玩会", bond: "一诺与Cat黄金搭档", spirit: "心怀荣耀，勇往直前", scenic: "成都电竞中心", time: new Date().toLocaleTimeString() },
    ];
    const target = targets[Math.floor(Math.random() * targets.length)];
    this.setData({ recognizedTarget: target, arEnabled: true, scanHint: `已识别: ${target.name}` });
    this.saveToHistory(target);
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
    this.setData({ recognizedTarget: e.currentTarget.dataset.target, arEnabled: true, isScanning: false });
  },

  askAI() {
    const target = this.data.recognizedTarget;
    if (!target) return;
    app
      .safeNavigateTo(`/pages/chat/chat?prefill=${encodeURIComponent(`请告诉我${target.name}的${target.bond}故事和${target.spirit}精神`)}`)
      .catch((err) => {
        console.error("navigate askAI failed", err);
      });
  },

  viewFullKG() {
    const t = this.data.recognizedTarget;
    if (!t) return;
    wx.showModal({
      title: "知识图谱",
      content: `战队: ${t.team}\n羁绊: ${t.bond}\n精神: ${t.spirit}\n景点: ${t.scenic}`,
      confirmText: "生成文旅路线",
      success: (res) => {
        if (res.confirm) {
          app.safeNavigateTo("/pages/journey/journey").catch((err) => {
            console.error("navigate to journey failed", err);
          });
        }
      },
    });
  },
});

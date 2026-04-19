const app = getApp();

Page({
  data: {
    userInfo: { avatarUrl: "", nickname: "" },
    currentEmotion: { emoji: "🎮", name: "专业" },
    userStats: [
      { id: 1, value: 0, label: "打卡次数" },
      { id: 2, value: 0, label: "数字藏品" },
      { id: 3, value: 0, label: "生成路线" },
      { id: 4, value: 0, label: "对话次数" },
    ],
  },

  onShow() {
    this.loadUserData();
    this.calculateStats();
    this.updateEmotionDisplay();
  },

  loadUserData() {
    const userInfo = wx.getStorageSync("userInfo") || {};
    this.setData({ userInfo: { avatarUrl: userInfo.avatarUrl || "", nickname: userInfo.nickname || "" } });
  },

  calculateStats() {
    const checkins = wx.getStorageSync("checkins") || [];
    const collectibles = wx.getStorageSync("collectibles") || [];
    const routes = wx.getStorageSync("myRoutes") || [];
    const chatHistory = wx.getStorageSync("chatHistory") || [];
    this.setData({
      userStats: [
        { id: 1, value: checkins.length, label: "打卡次数" },
        { id: 2, value: collectibles.length, label: "数字藏品" },
        { id: 3, value: routes.length, label: "生成路线" },
        { id: 4, value: chatHistory.length, label: "对话次数" },
      ],
    });
  },

  updateEmotionDisplay() {
    this.setData({ currentEmotion: app.getEmotionStyle(app.globalData.emotion || "neutral") });
  },

  goJourney() {
    app.safeNavigateTo("/pages/journey/journey").catch((err) => {
      console.error("navigate to journey failed", err);
    });
  },

  goChat() {
    app.safeNavigateTo("/pages/chat/chat").catch((err) => {
      console.error("navigate to chat failed", err);
    });
  },
});

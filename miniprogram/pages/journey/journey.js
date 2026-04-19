const app = getApp();

Page({
  data: {
    preferenceOptions: {
      teams: [{ id: 1, name: "EDG" }, { id: 2, name: "AG超玩会" }, { id: 3, name: "狼队" }, { id: 4, name: "TES" }],
      styles: [{ id: "passionate", name: "热血" }, { id: "warm", name: "温情" }, { id: "inspirational", name: "励志" }],
      cities: [{ id: 1, name: "上海" }, { id: 2, name: "成都" }, { id: 3, name: "北京" }],
    },
    selectedTeams: [],
    selectedStyles: [],
    selectedCities: [],
    isGenerating: false,
    currentRoute: null,
    myRoutes: [],
  },

  onLoad() {
    this.loadUserData();
    const prefs = app.globalData.userPreferences || {};
    this.setData({
      selectedTeams: prefs.favoriteTeams || [],
      selectedStyles: prefs.preferredStyle ? [prefs.preferredStyle] : [],
      selectedCities: prefs.cities || [],
    });
  },

  onShow() {
    this.loadUserData();
  },

  loadUserData() {
    this.setData({ myRoutes: wx.getStorageSync("myRoutes") || [] });
  },

  togglePreference(e) {
    const { type, id } = e.currentTarget.dataset;
    const key = `selected${type.charAt(0).toUpperCase() + type.slice(1)}s`;
    const current = [...this.data[key]];
    const idx = current.indexOf(id);
    if (idx > -1) current.splice(idx, 1);
    else current.push(id);
    this.setData({ [key]: current });
  },

  async generateRoute() {
    if (this.data.selectedTeams.length === 0) {
      wx.showToast({ title: "请至少选择一个战队", icon: "none" });
      return;
    }
    this.setData({ isGenerating: true });
    const teamId = this.data.selectedTeams[0];
    const team = this.data.preferenceOptions.teams.find((t) => t.id === teamId)?.name || "EDG";
    const city = this.data.preferenceOptions.cities.find((c) => c.id === this.data.selectedCities[0])?.name || "上海";
    const route = {
      id: Date.now(),
      title: `${team}专属文旅路线`,
      description: `${city} · 5个电竞打卡点`,
      nodes: [
        { id: 1, name: `${city}电竞中心`, description: "参观职业赛场并完成打卡" },
        { id: 2, name: `${team}战队展馆`, description: "了解战队历史和荣誉" },
        { id: 3, name: "选手应援墙", description: "留言支持喜欢的选手" },
      ],
    };
    const myRoutes = [route, ...this.data.myRoutes].slice(0, 10);
    wx.setStorageSync("myRoutes", myRoutes);
    this.setData({ isGenerating: false, currentRoute: route, myRoutes });
  },

  viewRoute(e) {
    this.setData({ currentRoute: e.currentTarget.dataset.route });
  },

  openAR() {
    app.safeNavigateTo("/pages/ar/ar").catch((err) => {
      console.error("navigate to ar failed", err);
    });
  },
});

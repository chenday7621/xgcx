const app = getApp();

Page({
  data: {
    teams: [
      { id: "1", name: "EDG", image: "/imgs/home/team-edg.png", background: "/imgs/home/bg-edg.jpg", bonds: "Meiko&Scout", spirit: "团结拼搏", theme: "edg", selected: false },
      { id: "2", name: "AG超玩会", image: "/imgs/home/team-ag.png", background: "/imgs/home/bg-ag.jpg", bonds: "一诺&Cat", spirit: "永不言弃", theme: "ag", selected: false },
      { id: "3", name: "狼队", image: "/imgs/home/team-wolves.png", background: "/imgs/home/bg-wolves.png", bonds: "Fly&胖皇", spirit: "坚韧不拔", theme: "wolves", selected: false },
      { id: "4", name: "TES", image: "/imgs/home/team-tes.png", background: "/imgs/home/bg-tes.png", bonds: "knight&JackeyLove", spirit: "无畏前行", theme: "tes", selected: false },
    ],
    cities: [
      { id: "1", name: "上海", image: "/imgs/route/city-shanghai.png", selected: false },
      { id: "2", name: "成都", image: "/imgs/route/city-chengdu.png", selected: false },
      { id: "3", name: "北京", image: "/imgs/route/city-beijing.png", selected: false },
    ],
    isGenerating: false,
    currentRoute: null,
    myRoutes: [],
    teamsIndex: -1,
    cityIndex: -1,
  },

  onLoad() {
    this.loadMyRoutes();
    this.loadUserPreferences();
  },

  onShow() {
    this.loadMyRoutes();
  },

  loadMyRoutes() {
    const routes = wx.getStorageSync("myRoutes") || [];
    this.setData({ myRoutes: routes });
  },

  loadUserPreferences() {
    const prefs = app.globalData.userPreferences || {};

    const favoriteTeams = Array.isArray(prefs.favoriteTeams) ? prefs.favoriteTeams : [];
    const citiesPref = Array.isArray(prefs.cities) ? prefs.cities : [];

    const teams = this.data.teams.map((t) => ({
      ...t,
      selected: favoriteTeams.includes(t.id),
    }));

    const cities = this.data.cities.map((c) => ({
      ...c,
      selected: citiesPref.includes(c.id),
    }));

    this.setData({ teams, cities }, () => {
      this.updateSelectionIndex();
    });
  },

  updateSelectionIndex() {
    const teamsIndex = this.data.teams.findIndex((t) => t.selected);
    const cityIndex = this.data.cities.findIndex((c) => c.selected);
    this.setData({ teamsIndex, cityIndex });
  },

  selectTeam(e) {
    const id = e.currentTarget.dataset.id;
    const teams = this.data.teams.map((t) => ({
      ...t,
      selected: t.id === id,
    }));
    this.setData({ teams }, () => {
      this.updateSelectionIndex();
    });
  },

  selectCity(e) {
    const id = e.currentTarget.dataset.id;
    const cities = this.data.cities.map((c) => ({
      ...c,
      selected: c.id === id,
    }));
    this.setData({ cities }, () => {
      this.updateSelectionIndex();
    });
  },

  async generateRoute() {
    const selectedTeams = this.data.teams.filter((t) => t.selected);
    const selectedCities = this.data.cities.filter((c) => c.selected);

    if (selectedTeams.length === 0) {
      wx.showToast({ title: "请先选择一个战队", icon: "none" });
      return;
    }

    if (selectedCities.length === 0) {
      wx.showToast({ title: "请先选择一个城市", icon: "none" });
      return;
    }

    this.setData({ isGenerating: true });

    const team = selectedTeams[0].name;
    const city = selectedCities[0].name;

    const route = {
      id: Date.now(),
      title: `${team}专属文旅路线`,
      city,
      team,
      description: `${city} · 5个电竞打卡点`,
      nodes: [
        { id: 1, name: `${city}电竞中心`, description: "参观职业赛场并完成打卡" },
        { id: 2, name: `${team}战队展馆`, description: "了解战队历史和荣誉" },
        { id: 3, name: "选手应援墙", description: "留言支持喜欢的选手" },
        { id: 4, name: "电竞主题餐厅", description: "品尝赛事主题美食" },
        { id: 5, name: "周边商店", description: "购买正版周边纪念品" },
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

  goBack() {
    wx.navigateBack();
  },
});

const app = getApp();

Page({
  data: {
    particles: [],
    welcomeEmoji: "🎮",
    welcomeTitle: "欢迎来到电竞世界",
    welcomeMessage: "今天想了解什么电竞故事呢？",
    suggestions: [
      { id: 1, text: "EDG选手的羁绊故事" },
      { id: 2, text: "KPL总决赛夺冠时刻" },
      { id: 3, text: "电竞精神是什么" },
      { id: 4, text: "成都AG主场有什么" },
    ],
    hotTeams: [
      { id: 1, name: "EDG", color: "linear-gradient(135deg, #ff4444, #ff8833)", logoText: "EDG", bonds: "Meiko&Scout", spirit: "团结拼搏" },
      { id: 2, name: "AG超玩会", color: "linear-gradient(135deg, #00ccff, #9966ff)", logoText: "AG", bonds: "一诺&Cat", spirit: "永不言弃" },
      { id: 3, name: "狼队", color: "linear-gradient(135deg, #ffd700, #ffaa00)", logoText: "狼", bonds: "Fly&胖皇", spirit: "坚韧不拔" },
      { id: 4, name: "TES", color: "linear-gradient(135deg, #66ff66, #00ccff)", logoText: "TES", bonds: "knight&JackeyLove", spirit: "无畏前行" },
    ],
  },

  onLoad() {
    this.generateParticles();
    this.updateWelcomeByTime();
  },

  onShow() {
    const emotion = app.globalData.emotion;
    if (emotion && emotion !== "neutral") this.updateWelcomeByEmotion(emotion);
  },

  generateParticles() {
    const particles = [];
    for (let i = 0; i < 20; i += 1) {
      particles.push({
        id: i,
        top: Math.random() * 100,
        left: Math.random() * 100,
        color: ["#ff4444", "#ffd700", "#00ccff", "#9966ff"][Math.floor(Math.random() * 4)],
      });
    }
    this.setData({ particles });
  },

  updateWelcomeByTime() {
    const hour = new Date().getHours();
    let emoji = "🔥";
    let title = "下午好，召唤师";
    let message = "今天有比赛，来聊聊赛况吧！";

    if (hour < 6) {
      emoji = "🌙";
      title = "深夜时光";
      message = "想了解哪个选手的励志故事？";
    } else if (hour < 12) {
      emoji = "☀️";
      title = "早安，召唤师";
      message = "新的一天，为你喜欢的战队加油！";
    } else if (hour >= 18) {
      emoji = "🌆";
      title = "晚上好";
      message = "今晚有精彩对决，想了解什么？";
    }
    this.setData({ welcomeEmoji: emoji, welcomeTitle: title, welcomeMessage: message });
  },

  updateWelcomeByEmotion(emotion) {
    const style = app.getEmotionStyle(emotion);
    this.setData({
      welcomeEmoji: style.emoji,
      welcomeTitle: `检测到${style.name}模式`,
      welcomeMessage: "我会用更贴合你状态的方式和你聊电竞。",
    });
  },

  onSuggestionTap(e) {
    const message = e.currentTarget.dataset.message;
    wx.navigateTo({ url: `/pages/chat/chat?prefill=${encodeURIComponent(message)}` });
  },

  onEntryTap(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.path });
  },

  onTeamTap(e) {
    const team = e.currentTarget.dataset.team;
    wx.navigateTo({ url: `/pages/chat/chat?team=${team}` });
  },
});

App({
  globalData: {
    env: "cloud1-9gev7gnfc5c48e53",
    emotion: "neutral",
    userPreferences: {
      favoriteTeams: [],
      favoritePlayers: [],
      preferredStyle: "passionate",
      cities: [],
    },
    knowledgeGraphCache: {},
    journeyRecords: [],
    digitalCollectibles: [],
  },

  onLaunch: function () {
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
    }
    this.loadUserData();
    this.initEmotionModule();
  },

  loadUserData: function () {
    try {
      const userPrefs = wx.getStorageSync("userPreferences");
      if (userPrefs) this.globalData.userPreferences = userPrefs;

      const journeyRecords = wx.getStorageSync("journeyRecords");
      if (journeyRecords) this.globalData.journeyRecords = journeyRecords;

      const digitalCollectibles = wx.getStorageSync("digitalCollectibles");
      if (digitalCollectibles) this.globalData.digitalCollectibles = digitalCollectibles;
    } catch (e) {
      console.error("加载用户数据失败", e);
    }
  },

  initEmotionModule: function () {
    this.emotionKeywords = {
      passionate: ["冠军", "胜利", "热血", "加油", "战斗", "拼搏", "夺冠", "支持", "必胜", "厉害"],
      nostalgic: ["回忆", "当年", "以前", "曾经", "怀念", "老将", "经典", "巅峰", "情怀"],
      curious: ["是什么", "怎么", "为什么", "哪里", "哪个", "多少", "如何", "介绍一下", "讲讲", "想了解"],
      confused: ["迷茫", "不懂", "怎么选", "哪个好", "该怎么办", "求助", "纠结", "不知道", "犹豫"],
    };
  },

  recognizeEmotion: function (message) {
    const lowerMessage = (message || "").toLowerCase();
    let maxScore = 0;
    let detectedEmotion = "neutral";

    Object.entries(this.emotionKeywords).forEach(([emotion, keywords]) => {
      let score = 0;
      keywords.forEach((keyword) => {
        if (lowerMessage.includes(keyword)) score += 1;
      });
      if (score > maxScore) {
        maxScore = score;
        detectedEmotion = emotion;
      }
    });

    this.globalData.emotion = detectedEmotion;
    return detectedEmotion;
  },

  getEmotionStyle: function (emotion) {
    const styles = {
      passionate: { name: "热血", color: "#ff4444", emoji: "🔥", style: "激情热血，充满战斗意志" },
      nostalgic: { name: "温情", color: "#ffaa00", emoji: "💫", style: "温暖回忆，传递电竞情怀" },
      curious: { name: "励志", color: "#00ccff", emoji: "⭐", style: "知识讲解，传递赛事精神" },
      confused: { name: "鼓励", color: "#66ff66", emoji: "🤝", style: "耐心引导，给予支持鼓励" },
      neutral: { name: "专业", color: "#ffffff", emoji: "🎮", style: "专业解答，传递电竞知识" },
    };
    return styles[emotion] || styles.neutral;
  },
});

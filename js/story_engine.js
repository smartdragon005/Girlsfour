/**
 * 故事引擎 - 小舒的故事/剧本杀核心逻辑
 * 
 * 功能：
 * 1. 管理故事进度
 * 2. 跟踪线索收集
 * 3. 管理嫌疑人状态
 * 4. 判断是否处于故事模式
 * 5. 生成故事摘要（注入到 system prompt）
 */

// ========== 故事引擎主类 ==========
class StoryEngine {
  constructor() {
    this.storage = new StoryStorage();
    this.currentStory = null;
    this.storyData = null;
    this.isActiveFlag = false;
    this.listeners = [];
  }

  /**
   * 初始化：加载存档，检查是否有进行中的故事
   */
  async init() {
    await this.storage.init();
    const saved = this.storage.getCurrentStory();
    if (saved && saved.storyId) {
      this.currentStory = saved.storyId;
      this.storyData = saved;
      this.isActiveFlag = true;
    }
    this.emit('init', { isActive: this.isActiveFlag, story: this.storyData });
  }

  /**
   * 判断是否处于故事模式
   */
  isActive() {
    return this.isActiveFlag && this.currentStory !== null;
  }

  /**
   * 开始新故事
   */
  async startStory(storyId, storyConfig) {
    this.currentStory = storyId;
    this.storyData = {
      storyId: storyId,
      title: storyConfig.title || '未知故事',
      genre: storyConfig.genre || '悬疑',
      currentChapter: 0,
      progress: 'intro',  // intro / investigating / reasoning / concluded
      completedEvents: [],
      discoveredClues: [],
      suspects: storyConfig.suspects || [],
      npcCameos: {},
      lastSummary: '',
      startedAt: Date.now(),
      lastUpdated: Date.now()
    };
    this.isActiveFlag = true;
    await this.storage.saveStory(this.storyData);
    this.emit('story_started', this.storyData);
    return this.storyData;
  }

  /**
   * 继续故事（从存档恢复）
   */
  async resumeStory() {
    const saved = this.storage.getCurrentStory();
    if (!saved) return null;
    this.currentStory = saved.storyId;
    this.storyData = saved;
    this.isActiveFlag = true;
    this.emit('story_resumed', this.storyData);
    return this.storyData;
  }

  /**
   * 结束故事
   */
  async endStory() {
    if (!this.isActiveFlag) return;
    this.isActiveFlag = false;
    this.storage.clearCurrentStory();
    this.emit('story_ended', this.storyData);
    this.currentStory = null;
    this.storyData = null;
  }

  /**
   * 添加线索
   */
  addClue(clue) {
    if (!this.isActive()) return;
    clue.id = clue.id || 'c_' + Date.now();
    clue.discoveredAt = Date.now();
    this.storyData.discoveredClues.push(clue);
    this.storyData.lastUpdated = Date.now();
    this.storage.updateStory(this.storyData);
    this.emit('clue_added', clue);
    return clue;
  }

  /**
   * 更新嫌疑人状态
   */
  updateSuspect(suspectName, updates) {
    if (!this.isActive()) return;
    const suspect = this.storyData.suspects.find(s => s.name === suspectName);
    if (suspect) {
      Object.assign(suspect, updates);
      this.storyData.lastUpdated = Date.now();
      this.storage.updateStory(this.storyData);
      this.emit('suspect_updated', suspect);
    }
    return suspect;
  }

  /**
   * 添加 NPC 客串记录
   */
  addNpcCameo(npcName, info) {
    if (!this.isActive()) return;
    this.storyData.npcCameos[npcName] = {
      appeared: true,
      ...info,
      appearedAt: Date.now()
    };
    this.storyData.lastUpdated = Date.now();
    this.storage.updateStory(this.storyData);
    this.emit('npc_cameo', { npc: npcName, info });
  }

  /**
   * 推进剧情到下一章
   */
  advanceChapter() {
    if (!this.isActive()) return;
    this.storyData.currentChapter++;
    this.storyData.lastUpdated = Date.now();
    this.storage.updateStory(this.storyData);
    this.emit('chapter_advanced', this.storyData.currentChapter);
  }

  /**
   * 设置进度状态
   */
  setProgress(progress) {
    if (!this.isActive()) return;
    this.storyData.progress = progress;
    this.storyData.lastUpdated = Date.now();
    this.storage.updateStory(this.storyData);
    this.emit('progress_updated', progress);
  }

  /**
   * 设置最后总结
   */
  setLastSummary(summary) {
    if (!this.isActive()) return;
    this.storyData.lastSummary = summary;
    this.storyData.lastUpdated = Date.now();
    this.storage.updateStory(this.storyData);
  }

  /**
   * 获取当前故事状态（供外部调用）
   */
  getState() {
    if (!this.isActive()) return null;
    return {
      storyId: this.storyData.storyId,
      title: this.storyData.title,
      currentChapter: this.storyData.currentChapter,
      progress: this.storyData.progress,
      clueCount: this.storyData.discoveredClues.length,
      suspectCount: this.storyData.suspects.length,
      lastSummary: this.storyData.lastSummary,
      startedAt: this.storyData.startedAt
    };
  }

  /**
   * 生成注入到 system prompt 的故事摘要
   * 这是关键方法：让 AI 知道当前故事进度
   * @param {string} userText - 当前用户消息（用于检测话题相关性）
   */
  generatePromptContext(userText) {
    if (!this.isActive()) return '';

    const data = this.storyData;
    const context = {
      story_context: {
        active: true,
        title: data.title,
        progress: this.getProgressText(data.progress),
        current_chapter: data.currentChapter,
        discovered_clues: data.discoveredClues.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description,
          source: c.source
        })),
        suspects: data.suspects.map(s => ({
          name: s.name,
          status: s.status,
          role: s.role || '嫌疑人',
          alibi: s.alibi || null
        })),
        npc_cameos: Object.entries(data.npcCameos).map(([name, info]) => ({
          name: name,
          appeared: info.appeared,
          knowledge_level: info.knowledge_level || 'low'
        })),
        last_summary: data.lastSummary || '（刚开始）'
      }
    };

    // 格式化为 AI 易于理解的文本
    let text = '\n\n【当前故事进度】\n';
    text += `故事：${data.title}\n`;
    text += `进度：${this.getProgressText(data.progress)}（第${data.currentChapter + 1}章）\n`;
    text += `上次总结：${data.lastSummary || '刚开始'}\n\n`;

    if (data.discoveredClues.length > 0) {
      text += `【已发现线索】(${data.discoveredClues.length}条)\n`;
      data.discoveredClues.forEach((c, i) => {
        text += `${i + 1}. ${c.name}：${c.description}（来源：${c.source || '调查'}）\n`;
      });
      text += '\n';
    }

    if (data.suspects.length > 0) {
      text += `【嫌疑人状态】\n`;
      data.suspects.forEach(s => {
        const statusText = {
          suspect: '嫌疑',
          cleared: '已排除',
          confirmed: '已确认',
          witness: '证人'
        }[s.status] || s.status;
        text += `- ${s.name}：${statusText}（${s.role || '嫌疑人'}）`;
        if (s.alibi) {
          text += `，不在场证明：${s.alibi.location}(${s.alibi.time_range || ''})`;
        }
        text += '\n';
      });
      text += '\n';
    }

    // NPC 客串边界提示
    if (Object.keys(data.npcCameos).length > 0) {
      text += `【NPC客串记录】(重要！这些人只知道边缘信息，不知道案件真相)\n`;
      text += `⚠️ 甜小朵、白洁、小雅的客串是纯客串，她们不知道案件真相，只能提供边缘性信息\n`;
      Object.entries(data.npcCameos).forEach(([name, info]) => {
        text += `- ${name}：已出现，信息级别=${info.knowledge_level || 'low'}\n`;
      });
      text += '\n';
    }

    text += `【⚠️ 最重要规则 - 必须严格遵守】\n`;
    text += `1. 用户正在听你讲述一起案件，你的主要职责是把故事讲下去\n`;
    text += `2. 如果用户问地点/生活相关问题（咖啡馆、餐厅、公园等），先正常回答，然后自然引出："不过你说的那个地方，附近最近发生了一件怪事"或者"话说回来，我们之前说到的那件事..."\n`;
    text += `3. 如果用户闲聊无关话题（天气、心情等），先回应，然后用"不过话说回来，我们之前说的那件事..."引导回来\n`;
    text += `4. 不要让话题偏离案件超过1轮对话\n`;
    text += `5. 只有当用户明确说"退出"、"不听了"、"结束"、"没意思"时，才停止讲述\n\n`;
    
    text += `【操作建议】\n`;
    text += `- 用户可能会问：地点、美食、天气、新闻等\n`;
    text += `- 对于地点类问题：先回答，然后自然提到该地点附近的怪事/案件\n`;
    text += `- 对于闲聊类问题：先回应，然后用"话说回来"引导回案件\n`;
    text += `- 根据当前进度推进剧情，适时提供新线索\n`;

    // 话题相关性检测
    if (userText && !this.isStoryRelated(userText)) {
      // 检测是否为地点/生活类问题
      const isLocationQuery = this.isLocationQuery(userText);
      text += '\n【⚠️ 当前用户消息偏离了故事话题！】\n';
      if (isLocationQuery) {
        text += '用户问了地点/生活相关问题，你必须：\n';
        text += '1. 先正常回答（推荐地点、给出建议）\n';
        text += '2. 然后自然引出："不过你说的那个地方，附近最近发生了一件怪事"或"话说回来，我们这个案子..."\n';
        text += '3. 以地点为由头，把话题拉回故事\n';
      } else {
        text += '用户问了与案件无关的问题，你必须：\n';
        text += '1. 先简短回应用户（1-2句话）\n';
        text += '2. 然后加上："不过话说回来，我们这个案子还没破呢"\n';
      }
      text += '4. 绝对不能让话题跑偏超过一轮对话\n';
      text += this.getRedirectPrompt(userText) + '\n';
    }

    return text;
  }
  
  /**
   * 检测用户是否明确要退出故事
   */
  checkExitIntent(userText) {
    const exitKeywords = [
      '退出', '不听了', '结束', '没意思', '不想听了', 
      '不继续了', '就这样吧', '算了', '不要了', '终止', 
      'quit', 'exit', 'end', 'stop'
    ];
    const lower = userText.toLowerCase().trim();
    return exitKeywords.some(k => lower.includes(k));
  }

  /**
   * 检测话题是否与故事相关
   * 返回 true 表示相关，false 表示偏离
   */
  isStoryRelated(userText) {
    if (!this.storyData) return true;
    
    const text = userText.toLowerCase();
    
    // 强故事相关关键词（直接与案件/推理相关）
    const strongKeywords = [
      '故事', '案件', '调查', '嫌疑人', '线索', '证据', '推理', '破案',
      '继续', '然后', '接着', '剧情', '发生', '事情', '情况', '发现',
      '问', '询问', '问话', '调查一下', '查看', '检查', '搜', '找',
      '动机', '手法', '时间', '地点', '不在场', '证明', '嫌疑',
      '星湖', '樱花', '命案', '死亡', '被杀', '凶手', '真凶',
      '剧本杀', '侦探', '推理', '悬疑', '案件', '犯罪', '杀人'
    ];
    
    // 舒心市相关关键词（故事背景）
    const cityKeywords = [
      '舒心市', '舒心', '市里', '城里', '本地', '当地',
      '新闻', '八卦', '有趣', '可怕', '离奇', '诡异', '怪事',
      '听说', '传闻', '传言', '消息', '最近', '最近有什么',
      '咖啡馆', '餐厅', '酒店', '公园', '街道', '街区'
    ];
    
    // 检查故事中的专有名词
    if (this.storyData.suspects) {
      this.storyData.suspects.forEach(s => {
        if (s.name && text.includes(s.name.toLowerCase())) return true;
      });
    }
    
    // 检查已知线索
    if (this.storyData.discoveredClues) {
      this.storyData.discoveredClues.forEach(c => {
        if (c.name && text.includes(c.name.toLowerCase())) return true;
      });
    }
    
    // 检查强故事关键词
    if (strongKeywords.some(k => text.includes(k.toLowerCase()))) return true;
    
    // 检查舒心市相关关键词（中等相关性，需要结合上下文）
    if (cityKeywords.some(k => text.includes(k.toLowerCase()))) {
      // 如果用户提到舒心市的新闻/八卦/有趣的事等，可能与案件相关
      const newsPatterns = ['新闻', '八卦', '有趣', '可怕', '离奇', '诡异', '怪事', '听说', '传闻', '传言'];
      if (newsPatterns.some(p => text.includes(p))) {
        return true;  // 关于舒心市的新闻八卦，可能是案件相关
      }
      // 用户只是问舒心市的咖啡馆/餐厅等，算偏离，需要引导
    }
    
    return false;
  }

  /**
   * 检测是否为地点/生活服务类问题
   */
  isLocationQuery(userText) {
    const text = userText.toLowerCase();
    
    // 地点/生活服务关键词
    const locationKeywords = [
      '咖啡馆', '咖啡', '餐厅', '饭店', '吃', '美食', '好吃',
      '酒店', '旅馆', '宾馆', '民宿', '住',
      '公园', '广场', '花园', '景点', '好玩',
      '街', '路', '道', '巷', '区', '位置', '在哪', '哪里',
      '附近', '周边', '周围', '怎么走', '怎么去', '路线',
      '商场', '超市', '商店', '书店', '影院', '电影院',
      '酒吧', 'KTV', '健身', '运动', '游泳馆',
      '医院', '诊所', '药店', '银行', '邮局'
    ];
    
    return locationKeywords.some(k => text.includes(k));
  }

  /**
   * 获取引导回故事的提示
   */
  getRedirectPrompt(userText) {
    if (!this.storyData) return '';
    
    const data = this.storyData;
    const suggestions = [];
    const isLocation = userText && this.isLocationQuery(userText);
    
    if (isLocation) {
      // 地点类问题：以地点为由头引出故事
      if (data.progress === 'intro') {
        suggestions.push('先回答地点问题，然后说："不过你说的那个地方，附近最近发生了一件怪事"');
      } else if (data.progress === 'investigating') {
        const locations = ['星湖公园', '樱花大道', '市中心广场', '老城区'];
        const loc = locations[Math.floor(Math.random() * locations.length)];
        suggestions.push(`先回答地点问题，然后说："你说的那个地方离${loc}很近吧？那里就是案发现场" `);
      } else {
        suggestions.push('先回答地点问题，然后说："不过话说回来，我们这个案子的现场就在那附近"');
      }
    } else {
      // 非地点类问题：用"话说回来"引导
      if (data.progress === 'intro') {
        suggestions.push('简短回应，然后说："不过话说回来，我们这个故事才刚开始呢"');
      } else if (data.progress === 'investigating') {
        if (data.suspects && data.suspects.length > 0) {
          const name = data.suspects[0].name;
          suggestions.push(`简短回应，然后说："话说回来，${name}的嫌疑还没排除呢"`);
        } else {
          suggestions.push('简短回应，然后说："不过话说回来，我们的案子还没破呢"');
        }
      } else {
        suggestions.push('简短回应，然后说："不过话说回来，我们这个案子还没破呢"');
      }
    }
    
    // 随机选一个建议
    if (suggestions.length > 0) {
      return suggestions[Math.floor(Math.random() * suggestions.length)];
    }
    
    return isLocation 
      ? '先回答地点问题，然后说："不过你说的那个地方，附近最近发生了一件怪事"'
      : '简短回应，然后说："不过话说回来，我们这个案子还没破呢"';
  }

  /**
   * 获取进度文字描述
   */
  getProgressText(progress) {
    const map = {
      intro: '刚开始讲',
      investigating: '调查中',
      reasoning: '推理中',
      concluded: '已讲完'
    };
    return map[progress] || progress;
  }

  /**
   * 事件监听
   */
  on(event, callback) {
    this.listeners.push({ event, callback });
  }

  emit(event, data) {
    this.listeners
      .filter(l => l.event === event)
      .forEach(l => {
        try { l.callback(data); } catch (e) { console.error(e); }
      });
  }
}

// ========== 故事存档类 ==========
class StoryStorage {
  constructor() {
    this.STORAGE_KEY = 'xiaoshu_story_state';
    this.currentStory = null;
  }

  async init() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        this.currentStory = JSON.parse(raw);
      }
    } catch (e) {
      console.error('[StoryStorage] 初始化失败:', e);
      this.currentStory = null;
    }
  }

  getCurrentStory() {
    return this.currentStory;
  }

  async saveStory(storyData) {
    try {
      this.currentStory = storyData;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(storyData));
    } catch (e) {
      console.error('[StoryStorage] 保存失败:', e);
      throw e;
    }
  }

  async updateStory(storyData) {
    return this.saveStory(storyData);
  }

  clearCurrentStory() {
    this.currentStory = null;
    localStorage.removeItem(this.STORAGE_KEY);
  }

  // 获取所有历史存档（用于未来扩展：多故事选择）
  getAllStories() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY + '_all');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  archiveStory(storyData) {
    const all = this.getAllStories();
    all.push({
      ...storyData,
      archivedAt: Date.now()
    });
    localStorage.setItem(this.STORAGE_KEY + '_all', JSON.stringify(all));
  }
}

// ========== 导出到全局 ==========
window.StoryEngine = StoryEngine;
window.StoryStorage = StoryStorage;
window.storyEngine = new StoryEngine();

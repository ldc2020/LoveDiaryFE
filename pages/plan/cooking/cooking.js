/**
 * 烹饪计划页面 - 智能菜谱生成和管理
 * @description 提供AI智能菜谱生成功能，支持菜谱管理、图片上传和详情展示
 * @author Love Diary Team
 * @date 2024
 */

// 引入数据管理器
const DataManager = require('../../../utils/dataManager.js');
const app = getApp();

// 配置常量
const COLLECTION_NAME = 'ld_cooking_plans';
const CACHE_PREFIX = 'cooking_plans';
const PAGE_SIZE = 20;
const CLEANUP_INTERVAL = 2; // 2天
const RETENTION_PERIOD = 30; // 30天

Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 用户信息
    userInfo: null,
    coupleId: '',
    
    // 菜谱列表数据
    recipeList: [],
    loading: false,
    hasMore: true,
    
    // 智能添加菜谱相关
    showAddModal: false,
    inputText: '',
    isGenerating: false,
    inputPlaceholder: '输入菜名自动生成菜谱，或输入完整菜谱进行整理\n例如："宫保鸡丁" 或 "麻婆豆腐\n材料：豆腐500g，肉末100g..."',
    
    // 菜谱详情弹窗
    showDetailModal: false,
    currentRecipe: null,
    
    // 编辑模式
    isEditing: false,
    editRecipe: null,
    
    // 图片上传
    showImageUpload: false,
    uploadingImage: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('烹饪计划页面开始加载');
    
    // 检查绑定状态
    const coupleId = wx.getStorageSync('coupleId');
    const bindStatus = wx.getStorageSync('bindStatus');
    
    if (!coupleId || bindStatus !== 'bound') {
      console.warn('用户未绑定，跳转到绑定页面');
      wx.reLaunch({
        url: '/pages/bind/bind'
      });
      return;
    }
    
    this.setData({ coupleId });
    
    // 初始化用户信息
    this.initUserInfo();
    
    // 初始化数据管理器
    this.initDataManager();
    
    // 加载菜谱数据
    this.loadRecipeData();
  },

  /**
   * 初始化用户信息
   */
  initUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ userInfo });
    }
  },

  /**
   * 初始化数据管理器
   */
  initDataManager() {
    this.dataManager = new DataManager({
      collectionName: COLLECTION_NAME,
      cachePrefix: CACHE_PREFIX,
      pageSize: PAGE_SIZE,
      cleanupInterval: CLEANUP_INTERVAL,
      retentionPeriod: RETENTION_PERIOD,
      hasImages: true, // 支持图片缓存
      timestampField: 'createTime',
      sortField: 'createTime',
      sortOrder: 'desc'
    });
    
    console.log('数据管理器初始化完成');
  },

  /**
   * 加载菜谱数据
   * @param {boolean} isRefresh - 是否为刷新操作
   * @param {boolean} isLoadMore - 是否为加载更多操作
   */
  async loadRecipeData(isRefresh = false, isLoadMore = false) {
    if (this.data.loading) return;
    
    this.setData({ loading: true });
    
    try {
      const data = await this.dataManager.getData(isRefresh, isLoadMore);
      
      if (isLoadMore) {
        // 懒加载：追加数据
        this.setData({
          recipeList: [...this.data.recipeList, ...data],
          hasMore: this.dataManager.hasMore,
          loading: false
        });
      } else {
        // 首次加载或刷新：替换数据
        this.setData({
          recipeList: data,
          hasMore: this.dataManager.hasMore,
          loading: false
        });
      }
      
      console.log(`菜谱数据加载完成，共${this.data.recipeList.length}条记录`);
    } catch (error) {
      console.error('加载菜谱数据失败:', error);
      this.setData({ loading: false });
      
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    }
  },

  /**
   * 下拉刷新
   */
  async onPullDownRefresh() {
    console.log('开始下拉刷新菜谱数据');
    await this.loadRecipeData(true, false);
    wx.stopPullDownRefresh();
  },

  /**
   * 上拉加载更多
   */
  async onReachBottom() {
    if (!this.data.hasMore || this.data.loading) return;
    
    console.log('开始加载更多菜谱数据');
    await this.loadRecipeData(false, true);
  },

  /**
   * 显示智能添加菜谱弹窗
   */
  showAddRecipeModal() {
    this.setData({
      showAddModal: true,
      inputText: '',
      isGenerating: false
    });
  },

  /**
   * 隐藏添加菜谱弹窗
   */
  hideAddModal() {
    this.setData({
      showAddModal: false,
      inputText: '',
      isGenerating: false
    });
  },

  /**
   * 输入文本变化处理
   */
  onInputChange(e) {
    this.setData({
      inputText: e.detail.value
    });
  },

  /**
   * 智能生成菜谱
   */
  async generateRecipe() {
    const inputText = this.data.inputText.trim();
    
    if (!inputText) {
      wx.showToast({
        title: '请输入菜名或菜谱',
        icon: 'none'
      });
      return;
    }
    
    this.setData({ isGenerating: true });
    
    try {
      let recipeData;
      
      // 判断输入类型：简单菜名 vs 完整菜谱
      if (this.isSimpleDishName(inputText)) {
        // 生成完整菜谱
        recipeData = await this.generateFullRecipe(inputText);
      } else {
        // 整理现有菜谱
        recipeData = await this.formatExistingRecipe(inputText);
      }
      
      // 保存到数据库
      await this.saveRecipe(recipeData);
      
      // 关闭弹窗并刷新列表
      this.hideAddModal();
      await this.loadRecipeData(true, false);
      
      wx.showToast({
        title: '菜谱添加成功',
        icon: 'success'
      });
      
    } catch (error) {
      console.error('生成菜谱失败:', error);
      wx.showToast({
        title: '生成失败，请重试',
        icon: 'error'
      });
    } finally {
      this.setData({ isGenerating: false });
    }
  },

  /**
   * 判断是否为简单菜名
   * @param {string} text - 输入文本
   * @returns {boolean} 是否为简单菜名
   */
  isSimpleDishName(text) {
    // 简单判断：少于20字且不包含换行符、冒号等
    return text.length <= 20 && 
           !text.includes('\n') && 
           !text.includes('：') && 
           !text.includes(':') && 
           !text.includes('材料') && 
           !text.includes('做法');
  },

  /**
   * 生成完整菜谱（基于菜名）
   * @param {string} dishName - 菜名
   * @returns {Object} 菜谱数据
   */
  async generateFullRecipe(dishName) {
    console.log('开始AI生成完整菜谱:', dishName);
    
    try {
      // 创建AI模型
      const model = wx.cloud.extend.AI.createModel("deepseek");
      
      // 构建AI提示词
      const prompt = `请为"${dishName}"生成一个详细的菜谱，要求：
1. 包含详细的食材清单（名称和用量）
2. 包含详细的制作步骤
3. 估算烹饪时间
4. 评估难度等级（简单/中等/困难）
5. 添加适合的标签
6. 用JSON格式返回，格式如下：
{
  "dishName": "菜名",
  "description": "菜品描述",
  "ingredients": [{"name": "食材名", "amount": "用量", "emoji": "🥘"}],
  "steps": ["步骤1", "步骤2"],
  "cookingTime": 30,
  "difficulty": "简单",
  "tags": ["家常菜"]
}`;
      
      // 调用AI生成菜谱
      const res = await model.generateText({
        model: "deepseek-v3-0324",
        messages: [{ role: "user", content: prompt }]
      });
      
      console.log('AI生成菜谱响应:', res);
      
      // 解析AI返回的JSON
      let aiRecipe;
      try {
        // 提取JSON部分（去除可能的markdown格式）
        const jsonMatch = res.choices[0].message.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiRecipe = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('AI返回格式不正确');
        }
      } catch (parseError) {
        console.warn('AI返回JSON解析失败，使用默认模板:', parseError);
        aiRecipe = this.generateDefaultRecipe(dishName);
      }
      
      // 确保数据完整性并添加emoji
      return {
        dishName: aiRecipe.dishName || dishName,
        description: aiRecipe.description || `美味的${dishName}，值得一试 😋`,
        ingredients: this.processIngredients(aiRecipe.ingredients || []),
        steps: aiRecipe.steps || ['按照传统做法制作即可'],
        cookingTime: aiRecipe.cookingTime || 30,
        servings: 2, // 默认2人份
        difficulty: aiRecipe.difficulty || '简单',
        tags: aiRecipe.tags || ['家常菜'],
        emoji: this.getDishEmoji(dishName)
      };
      
    } catch (error) {
      console.error('AI生成菜谱失败:', error);
      // 降级到默认模板
      return this.generateDefaultRecipe(dishName);
    }
  },

  /**
   * 整理现有菜谱
   * @param {string} recipeText - 菜谱文本
   * @returns {Object} 整理后的菜谱数据
   */
  async formatExistingRecipe(recipeText) {
    console.log('开始AI整理现有菜谱');
    
    try {
      // 创建AI模型
      const model = wx.cloud.extend.AI.createModel("deepseek");
      
      // 构建AI提示词
      const prompt = `请整理以下菜谱文本，提取并规范化信息：

${recipeText}

要求：
1. 识别菜名
2. 整理食材清单（名称和用量）
3. 整理制作步骤
4. 估算烹饪时间
5. 评估难度等级
6. 添加合适的标签
7. 用JSON格式返回，格式如下：
{
  "dishName": "菜名",
  "description": "菜品描述",
  "ingredients": [{"name": "食材名", "amount": "用量", "emoji": "🥘"}],
  "steps": ["步骤1", "步骤2"],
  "cookingTime": 30,
  "difficulty": "简单",
  "tags": ["自制菜谱"]
}`;
      
      // 调用AI整理菜谱
      const res = await model.generateText({
        model: "deepseek-v3-0324",
        messages: [{ role: "user", content: prompt }]
      });
      
      console.log('AI整理菜谱响应:', res);
      
      // 解析AI返回的JSON
      let aiRecipe;
      try {
        // 提取JSON部分（去除可能的markdown格式）
        const jsonMatch = res.choices[0].message.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiRecipe = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('AI返回格式不正确');
        }
      } catch (parseError) {
        console.warn('AI返回JSON解析失败，使用传统解析:', parseError);
        // 降级到传统解析方法
        return this.fallbackParseRecipe(recipeText);
      }
      
      // 确保数据完整性并添加emoji
      const dishName = aiRecipe.dishName || this.extractDishName(recipeText);
      return {
        dishName: dishName,
        description: aiRecipe.description || `美味的${dishName}，精心制作 🍽️`,
        ingredients: this.processIngredients(aiRecipe.ingredients || []),
        steps: aiRecipe.steps || ['按照传统做法制作即可'],
        cookingTime: aiRecipe.cookingTime || 30,
        servings: 2,
        difficulty: aiRecipe.difficulty || '中等',
        tags: aiRecipe.tags || ['自制菜谱'],
        emoji: this.getDishEmoji(dishName)
      };
      
    } catch (error) {
      console.error('AI整理菜谱失败:', error);
      // 降级到传统解析方法
      return this.fallbackParseRecipe(recipeText);
    }
  },

  /**
   * 处理食材列表，确保格式正确并添加emoji
   * @param {Array} ingredients - 原始食材列表
   * @returns {Array} 处理后的食材列表
   */
  processIngredients(ingredients) {
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return [{ name: '主料', amount: '适量', emoji: '🥘' }];
    }
    
    return ingredients.map(ingredient => {
      if (typeof ingredient === 'string') {
        // 如果是字符串，尝试解析
        const parts = ingredient.split(/[：:]/);
        return {
          name: parts[0]?.trim() || '未知食材',
          amount: parts[1]?.trim() || '适量',
          emoji: this.getIngredientEmoji(parts[0]?.trim() || '')
        };
      } else if (typeof ingredient === 'object') {
        // 如果是对象，确保格式正确
        return {
          name: ingredient.name || '未知食材',
          amount: ingredient.amount || '适量',
          emoji: ingredient.emoji || this.getIngredientEmoji(ingredient.name || '')
        };
      }
      
      return { name: '未知食材', amount: '适量', emoji: '🥘' };
    });
  },
  
  /**
   * 从文本中提取菜名
   * @param {string} text - 菜谱文本
   * @returns {string} 菜名
   */
  extractDishName(text) {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length > 0) {
      // 取第一行作为菜名，去除可能的标点符号
      return lines[0].trim().replace(/[：:，,。.！!？?]/g, '');
    }
    return '未命名菜谱';
  },
  
  /**
   * 传统解析方法（降级方案）
   * @param {string} recipeText - 菜谱文本
   * @returns {Object} 解析后的菜谱数据
   */
  fallbackParseRecipe(recipeText) {
    console.log('使用传统方法解析菜谱');
    
    const dishName = this.extractDishName(recipeText);
    const ingredients = this.parseIngredients(recipeText);
    const steps = this.parseSteps(recipeText);
    const cookingTime = this.parseCookingTime(recipeText);
    
    return {
      dishName: dishName,
      description: `美味的${dishName}，精心制作 🍽️`,
      ingredients: ingredients,
      steps: steps,
      cookingTime: cookingTime,
      servings: 2,
      difficulty: '中等',
      tags: ['自制菜谱'],
      emoji: this.getDishEmoji(dishName)
    };
  },

  /**
   * 生成默认菜谱
   * @param {string} dishName - 菜名
   * @returns {Object} 默认菜谱
   */
  generateDefaultRecipe(dishName) {
    return {
      description: `美味的${dishName}，值得一试 😋`,
      ingredients: [
        { name: '主料', amount: '适量', emoji: '🥘' },
        { name: '调料', amount: '适量', emoji: '🧂' }
      ],
      steps: [
        '准备所需食材',
        '按照传统做法制作',
        '调味装盘即可享用'
      ],
      cookingTime: 30,
      difficulty: '中等',
      tags: ['家常菜'],
      emoji: '🍽️'
    };
  },

  /**
   * 解析食材列表
   * @param {string} text - 菜谱文本
   * @returns {Array} 食材列表
   */
  parseIngredients(text) {
    const ingredients = [];
    const lines = text.split('\n');
    
    let inIngredientSection = false;
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.includes('材料') || trimmedLine.includes('食材')) {
        inIngredientSection = true;
        continue;
      }
      if (trimmedLine.includes('做法') || trimmedLine.includes('步骤')) {
        inIngredientSection = false;
        continue;
      }
      
      if (inIngredientSection && trimmedLine) {
        const parts = trimmedLine.split(/[：:]/); 
        if (parts.length >= 2) {
          ingredients.push({
            name: parts[0].trim(),
            amount: parts[1].trim(),
            emoji: this.getIngredientEmoji(parts[0].trim())
          });
        }
      }
    }
    
    return ingredients.length > 0 ? ingredients : [
      { name: '主料', amount: '适量', emoji: '🥘' }
    ];
  },

  /**
   * 解析制作步骤
   * @param {string} text - 菜谱文本
   * @returns {Array} 步骤列表
   */
  parseSteps(text) {
    const steps = [];
    const lines = text.split('\n');
    
    let inStepSection = false;
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.includes('做法') || trimmedLine.includes('步骤')) {
        inStepSection = true;
        continue;
      }
      
      if (inStepSection && trimmedLine) {
        // 移除步骤编号
        const cleanStep = trimmedLine.replace(/^\d+[.、]\s*/, '');
        if (cleanStep) {
          steps.push(cleanStep);
        }
      }
    }
    
    return steps.length > 0 ? steps : ['按照传统做法制作即可'];
  },

  /**
   * 解析烹饪时间
   * @param {string} text - 菜谱文本
   * @returns {number} 烹饪时间（分钟）
   */
  parseCookingTime(text) {
    const timeMatch = text.match(/(\d+)\s*分钟/);
    return timeMatch ? parseInt(timeMatch[1]) : 30;
  },

  /**
   * 获取菜品emoji
   * @param {string} dishName - 菜名
   * @returns {string} emoji
   */
  getDishEmoji(dishName) {
    const emojiMap = {
      '鸡': '🐔', '鸭': '🦆', '鱼': '🐟', '虾': '🦐', '蟹': '🦀',
      '牛': '🐄', '猪': '🐷', '羊': '🐑',
      '豆腐': '🧈', '蛋': '🥚', '面': '🍜', '饭': '🍚',
      '汤': '🍲', '粥': '🥣', '饺子': '🥟', '包子': '🥟'
    };
    
    for (const [key, emoji] of Object.entries(emojiMap)) {
      if (dishName.includes(key)) {
        return emoji;
      }
    }
    
    return '🍽️';
  },

  /**
   * 获取食材emoji
   * @param {string} ingredient - 食材名
   * @returns {string} emoji
   */
  getIngredientEmoji(ingredient) {
    const emojiMap = {
      '鸡': '🐔', '鸭': '🦆', '牛': '🐄', '猪': '🐷', '鱼': '🐟', '虾': '🦐', '蟹': '🦀',
      '豆腐': '🧈', '蛋': '🥚', '米': '🌾', '面': '🌾',
      '葱': '🧅', '蒜': '🧄', '姜': '🫚', '辣椒': '🌶️',
      '土豆': '🥔', '萝卜': '🥕', '白菜': '🥬', '菠菜': '🥬',
      '番茄': '🍅', '生菜': '🥬', '洋葱': '🧅',
      '油': '🫒', '盐': '🧂', '糖': '🍯', '醋': '🍶',
      '酱油': '🍶', '料酒': '🍶'
    };
    
    for (const [key, emoji] of Object.entries(emojiMap)) {
      if (ingredient.includes(key)) {
        return emoji;
      }
    }
    
    return '🥘';
  },

  /**
   * 保存菜谱到数据库
   * @param {Object} recipeData - 菜谱数据
   */
  async saveRecipe(recipeData) {
    const db = wx.cloud.database();
    
    const recipeDoc = {
      ...recipeData,
      coupleId: this.data.coupleId,
      creatorId: this.data.userInfo?.openid || '',
      creatorName: this.data.userInfo?.nickName || '未知用户',
      createTime: new Date(),
      updateTime: new Date(),
      status: 'active',
      localPath: '', // 成品图片
      likes: 0,
      comments: []
    };
    
    const result = await db.collection(COLLECTION_NAME).add({
      data: recipeDoc
    });
    
    console.log('菜谱保存成功:', result._id);
    
    // 更新计划统计数据
    await this.updatePlanCountInCloud('cooking', 1);
    
    return result._id;
  },

  /**
   * 更新云端计划统计数据
   * @param {string} type - 计划类型
   * @param {number} change - 变化量（+1表示增加，-1表示减少）
   */
  async updatePlanCountInCloud(type, change) {
    console.log(`更新云端${type}计划统计:`, change);
    
    try {
      const coupleId = wx.getStorageSync('coupleId');
      if (!coupleId) return;
      
      const db = wx.cloud.database();
      const collection = db.collection('ld_plans_count');
      
      // 查找现有记录
      const existingRecord = await collection
        .where({
          coupleId: coupleId,
          planType: type
        })
        .get();
      
      const now = new Date();
      
      if (existingRecord.data.length > 0) {
        // 更新现有记录
        const record = existingRecord.data[0];
        const oldCount = record.count || 0;
        const newCount = Math.max(0, oldCount + change); // 确保计数不会小于0
        
        console.log(`更新现有记录: ${type}, 原数量: ${oldCount}, 变化: ${change}, 新数量: ${newCount}`);
        
        await collection.doc(record._id).update({
          data: {
            count: newCount,
            updateTime: now
          }
        });
        
        console.log(`云端${type}计划统计更新成功: ${oldCount} -> ${newCount}`);
      } else {
        // 创建新记录
        const newCount = Math.max(0, change); // 确保初始计数不会小于0
        
        console.log(`创建新记录: ${type}, 初始数量: ${newCount}`);
        
        await collection.add({
          data: {
            coupleId: coupleId,
            planType: type,
            count: newCount,
            createTime: now,
            updateTime: now
          }
        });
        
        console.log(`云端${type}计划统计创建成功: ${newCount}`);
      }
      
    } catch (error) {
      console.error(`更新云端${type}计划统计失败:`, error);
    }
  },

  /**
   * 点击菜谱卡片
   * @param {Object} e - 事件对象
   */
  onRecipeCardTap(e) {
    const recipe = e.currentTarget.dataset.recipe;
    this.setData({
      showDetailModal: true,
      currentRecipe: recipe,
      isEditing: false
    });
  },

  /**
   * 关闭详情弹窗
   */
  hideDetailModal() {
    this.setData({
      showDetailModal: false,
      currentRecipe: null,
      isEditing: false,
      editRecipe: null
    });
  },

  /**
   * 开始编辑菜谱
   */
  startEditRecipe() {
    this.setData({
      isEditing: true,
      editRecipe: JSON.parse(JSON.stringify(this.data.currentRecipe))
    });
  },

  /**
   * 取消编辑
   */
  cancelEdit() {
    this.setData({
      isEditing: false,
      editRecipe: null
    });
  },

  /**
   * 保存编辑
   */
  async saveEdit() {
    if (!this.data.editRecipe) return;
    
    try {
      const db = wx.cloud.database();
      
      // 过滤掉系统字段，避免_openid等字段导致的错误
      const { _id, _openid, createTime, ...updateData } = this.data.editRecipe;
      
      await db.collection(COLLECTION_NAME).doc(_id).update({
        data: {
          ...updateData,
          updateTime: new Date()
        }
      });
      
      // 更新本地数据
      const updatedRecipe = {
        ...this.data.editRecipe,
        updateTime: new Date()
      };
      
      const updatedList = this.data.recipeList.map(item => 
        item._id === _id ? updatedRecipe : item
      );
      
      this.setData({
        recipeList: updatedList,
        currentRecipe: updatedRecipe,
        isEditing: false,
        editRecipe: null
      });
      
      // 清除缓存，确保数据一致性
      await this.dataManager.manualCacheCleanup();
      
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });
      
    } catch (error) {
      console.error('保存编辑失败:', error);
      wx.showToast({
        title: '保存失败',
        icon: 'error'
      });
    }
  },

  /**
   * 删除菜谱 - 使用DataManager完整删除逻辑
   * 包括：云端数据、云端图片、本地图片文件、图片缓存映射
   */
  async deleteRecipe() {
    const recipe = this.data.currentRecipe;
    if (!recipe) return;
    
    const result = await new Promise((resolve) => {
      wx.showModal({
        title: '确认删除',
        content: `确定要删除菜谱"${recipe.dishName}"吗？`,
        success: resolve
      });
    });
    
    if (!result.confirm) return;
    
    try {
      console.log('开始删除菜谱:', recipe._id, recipe);
      
      // 使用DataManager的完整删除逻辑
      // 这将自动处理：云端数据删除、云端图片删除、本地图片文件删除、图片缓存映射删除
      await this.dataManager.deleteData(recipe._id, recipe);
      
      console.log('菜谱删除成功:', recipe._id);
      
      // 更新本地显示数据
      const updatedList = this.data.recipeList.filter(item => item._id !== recipe._id);
      this.setData({
        recipeList: updatedList
      });
      
      this.hideDetailModal();
      
      // 更新计划统计数据
      await this.updatePlanCountInCloud('cooking', -1);
      
      wx.showToast({
        title: '删除成功',
        icon: 'success'
      });
      
    } catch (error) {
      console.error('删除菜谱失败:', error);
      wx.showToast({
        title: '删除失败',
        icon: 'error'
      });
    }
  },

  /**
   * 上传成品图片
   */
  async uploadFinishedImage() {
    try {
      this.setData({ uploadingImage: true });
      
      // 检查当前菜谱
      if (!this.data.currentRecipe || !this.data.currentRecipe._id) {
        wx.showToast({
          title: '请先选择菜谱',
          icon: 'none'
        });
        return;
      }
      
      // 选择图片
      const chooseResult = await new Promise((resolve, reject) => {
        wx.chooseImage({
          count: 1,
          sizeType: ['compressed'], // 使用压缩图
          sourceType: ['album', 'camera'],
          success: resolve,
          fail: reject
        });
      });
      
      const tempFilePath = chooseResult.tempFilePaths[0];
      
      // 使用dataManager的完整图片处理流程
      const result = await this.dataManager.uploadImageWithFullProcess(
        tempFilePath, 
        this.data.currentRecipe._id,
        
        (imageUrl) => {
          // 本地数据更新回调 - 更新currentRecipe和recipeList中对应的项目
          const updateData = {
            [`currentRecipe.imageLocalPath`]: imageUrl
          };
          
          // 同时更新recipeList中对应的项目，确保卡片也能立即显示图片
          const updatedList = this.data.recipeList.map(item => 
            item._id === this.data.currentRecipe._id 
              ? { ...item, imageLocalPath: imageUrl } 
              : item
          );
          updateData.recipeList = updatedList;
          
          this.setData(updateData);
        }
      );
      
      wx.showToast({
        title: '上传成功',
        icon: 'success'
      });
      
      console.log('图片上传完整流程完成:', result);
      
    } catch (error) {
      console.error('上传图片失败:', error);
      wx.showToast({
        title: '上传失败',
        icon: 'error'
      });
    } finally {
      this.setData({ uploadingImage: false });
    }
  },

  /**
   * 编辑表单输入处理
   */
  onEditInputChange(e) {
    const { field } = e.currentTarget.dataset;
    let value = e.detail.value;
    
    // 处理选择器的值
    if (field === 'difficulty') {
      if (typeof value === 'number') {
        const difficulties = ['简单', '中等', '困难'];
        value = difficulties[value] || '简单';
      } else if (e.type === 'change') {
        const difficulties = ['简单', '中等', '困难'];
        value = difficulties[parseInt(value)] || '简单';
      }
    }
    
    this.setData({
      [`editRecipe.${field}`]: value
    });
  },
  
  /**
   * 添加食材
   */
  addIngredient() {
    const ingredients = [...this.data.editRecipe.ingredients];
    ingredients.push({
      name: '',
      amount: '',
      emoji: '🥘'
    });
    
    this.setData({
      'editRecipe.ingredients': ingredients
    });
  },
  
  /**
   * 删除食材
   */
  removeIngredient(e) {
    const index = e.currentTarget.dataset.index;
    const ingredients = [...this.data.editRecipe.ingredients];
    ingredients.splice(index, 1);
    
    this.setData({
      'editRecipe.ingredients': ingredients
    });
  },
  
  /**
   * 编辑食材
   * @description 使用精确路径更新，避免重新渲染整个数组导致焦点丢失
   */
  onIngredientChange(e) {
    const { index, field } = e.currentTarget.dataset;
    const value = e.detail.value;
    
    // 使用精确的数据路径更新，避免重新渲染整个数组
    const updateData = {};
    updateData[`editRecipe.ingredients[${index}].${field}`] = value;
    
    // 如果是名称变化，自动更新emoji
    if (field === 'name') {
      const emoji = this.getIngredientEmoji(value);
      updateData[`editRecipe.ingredients[${index}].emoji`] = emoji;
    }
    
    this.setData(updateData);
  },
  
  /**
   * 添加制作步骤
   */
  addStep() {
    const steps = [...this.data.editRecipe.steps];
    steps.push('');
    
    this.setData({
      'editRecipe.steps': steps
    });
  },
  
  /**
   * 删除制作步骤
   */
  removeStep(e) {
    const index = e.currentTarget.dataset.index;
    const steps = [...this.data.editRecipe.steps];
    steps.splice(index, 1);
    
    this.setData({
      'editRecipe.steps': steps
    });
  },
  
  /**
   * 编辑制作步骤
   * @description 使用精确路径更新，避免重新渲染整个数组导致焦点丢失
   */
  onStepChange(e) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    
    // 使用精确的数据路径更新，避免重新渲染整个数组
    this.setData({
      [`editRecipe.steps[${index}]`]: value
    });
  },

  /**
   * 阻止事件冒泡
   * @description 防止弹窗内容点击时关闭弹窗
   */
  stopPropagation() {
    // 阻止事件冒泡，防止触发遮罩层的点击事件
    // 这个方法专门用于弹窗内容区域，确保点击弹窗内容不会关闭弹窗
  },

  /**
   * 页面分享
   */
  onShareAppMessage() {
    return {
      title: '我们的烹饪计划',
      path: '/pages/plan/cooking/cooking'
    };
  }
});
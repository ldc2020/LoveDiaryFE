/**
 * 情侣计划页面 - 智能识别和管理各种情侣计划
 * @description 提供智能文本识别功能，自动将用户输入归类到不同的计划类型
 * @author Love Diary Team
 * @date 2024
 */

// 日志记录 - 微信小程序环境使用console替代winston
const app = getApp();
const CompressUtil = require('../../utils/compressUtil');
const StorageManager = require('../../utils/storageManager.js');
const LoadingManager = require('../../utils/loadingManager.js');

// 定义常量 - plan页面只显示计划数量，不需要分页和云端更新
// 数据由各个具体计划页面维护和更新
const SMART_CLEANUP_INTERVAL = 2 * 24 * 60 * 60 * 1000; // 2天清理一次
const DATA_RETENTION_PERIOD = 30 * 24 * 60 * 60 * 1000; // 保留30天数据

Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 智能输入相关
    inputText: '', // 用户输入的文本
    showInputModal: false, // 是否显示输入弹窗
    isAnalyzing: false, // 是否正在分析文本
    
    // 计划统计数据
    planCounts: {
      movie: 0,
      cooking: 0,
      exercise: 0,
      travel: 0,
      memo: 0,
      shop: 0
    }, // 各类计划的数量统计
    
    // 加载状态 - 简化为只需要loading状态
    loading: false,
    pageLoaded: false, // 页面是否已加载，避免onShow重复调用数据库
    
    // 当前选中的计划类型
    currentPlanType: '',
    
    // 显示状态
    activeTab: 'all', // 当前激活的标签页
    showDetailModal: false, // 是否显示详情弹窗
    currentPlanDetail: null, // 当前查看的计划详情
    
    // 用户信息
    userInfo: null,
    coupleId: '',
    showEditDetailModal: false,
    editDetail: null,

    // 计划数量统计 - 只需要显示数量
    planCounts: {
      movie: 0,
      cooking: 0,
      exercise: 0,
      travel: 0,
      memo: 0,
      shop: 0
    },

    showManualAddModal: false,
    movieName: '',
    movieInfo: null,
    isSearching: false,
    isAdding: false
  },

  /**
   * 生命周期函数--监听页面加载
   * @description 初始化页面数据，检查绑定状态，加载已有计划
   */
  onLoad(options) {
    console.log('情侣计划页面开始加载');
    
    // 检查绑定状态
    const coupleId = StorageManager.getStorage('coupleId');
    const bindStatus = StorageManager.getStorage('bindStatus');
    
    if (!coupleId || bindStatus !== 'bound') {
      console.warn('用户未绑定，跳转到绑定页面');
      LoadingManager.navigateTo('/pages/bind/bind', true);
      return;
    }
    
    this.setData({ coupleId });
    
    // 初始化用户信息
    this.initUserInfo();
    
    // 标记页面已加载，避免onShow重复调用
    this.setData({ pageLoaded: true });
    
    // 加载计划数量统计
    this.loadPlanCountsFromCloud();
  },

  /**
   * 初始化用户信息
   * @description 从本地存储获取用户信息
   */
  initUserInfo() {
    const userInfo = StorageManager.getStorage('userInfo');
    if (userInfo) {
      this.setData({ userInfo });
      console.log('用户信息初始化完成', { userId: userInfo.openid });
    }
  },

  /**
   * 从云端加载计划数量统计
   * @description 从云端数据库ld_plans_count表中读取各类计划的数量统计信息
   */
  async loadPlanCountsFromCloud() {
    console.log('从云端加载计划数量统计');
    
    try {
      this.setData({ loading: true });
      
      const db = wx.cloud.database();
      const coupleId = this.data.coupleId;
      
      if (!coupleId) {
        console.error('coupleId不存在，无法加载统计数据');
        return;
      }
      
      // 查询计划统计表
      const result = await db.collection('ld_plans_count')
        .where({
          coupleId: coupleId
        })
        .get();
      
      console.log('云端统计数据查询结果:', result);
      
      // 初始化计划数量
      const planCounts = {
        movie: 0,
        cooking: 0,
        exercise: 0,
        travel: 0,
        memo: 0,
        shop: 0
      };
      
      // 处理查询结果
      if (result.data && result.data.length > 0) {
        result.data.forEach(item => {
          if (planCounts.hasOwnProperty(item.planType)) {
            planCounts[item.planType] = item.count || 0;
          }
        });
      }
      
      // 更新页面数据
      this.setData({
        planCounts
      });
      
      console.log('计划数量统计加载完成', planCounts);
      
    } catch (error) {
      console.error('从云端加载计划数量失败:', error);
      LoadingManager.showToast('加载统计失败', 'none');
      
      // 设置默认值
      this.setData({
        planCounts: {
          movie: 0,
          cooking: 0,
          exercise: 0,
          travel: 0,
          memo: 0,
          shop: 0
        }
      });
    } finally {
      this.setData({ loading: false });
    }
  },





  /**
   * 格式化时间
   * @param {Date|number|string} date 日期对象或时间戳
   * @returns {string} 格式化后的时间字符串
   */
  formatTime(date) {
    if (!date) return '';
    
    // 统一转换为Date对象
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) return '';
    
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const hour = String(dateObj.getHours()).padStart(2, '0');
    const minute = String(dateObj.getMinutes()).padStart(2, '0');
    
    const now = new Date();
    const diff = now - dateObj;
    const oneDay = 24 * 60 * 60 * 1000;
    
    // 今天的显示时分
    if (diff < oneDay && dateObj.getDate() === now.getDate()) {
      return `今天 ${hour}:${minute}`;
    }
    
    // 昨天的显示"昨天"
    if (diff < 2 * oneDay && dateObj.getDate() === now.getDate() - 1) {
      return `昨天 ${hour}:${minute}`;
    }
    
    // 一周内显示星期几
    if (diff < 7 * oneDay) {
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return `${weekdays[dateObj.getDay()]} ${hour}:${minute}`;
    }
    
    // 其他显示完整日期
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },




  /**
   * 提取计划数据
   * @param {string} text 用户输入的文本
   * @param {string} planType 计划类型
   * @returns {Promise<Object>} 提取的数据
   */
  async extractPlanData(text, planType) {
    const baseData = {
      content: text.trim(),
      createTime: new Date(),
      status: 'pending'
    };

    let extractedData = {};
    
    switch (planType) {
      case 'movie':
        extractedData = {
          ...baseData,
          ...await this.extractMovieInfo(text)
        };
        break;
        
      case 'cooking':
        extractedData = {
          ...baseData,
          ...await this.extractCookingInfo(text)
        };
        break;
        
      case 'exercise':
        extractedData = {
          ...baseData,
          ...await this.extractExerciseInfo(text)
        };
        break;
        
      case 'travel':
        extractedData = {
          ...baseData,
          ...await this.extractTravelInfo(text)
        };
        break;
        
      case 'shop':
        extractedData = {
          ...baseData,
          ...await this.extractShopInfo(text)
        };
        break;
        
      default:
        extractedData = baseData;
    }

    // 添加通用字段
    extractedData.tags = this.extractTags(text);
    extractedData.priority = this.extractPriority(text);
    extractedData.reminder = this.extractReminder(text);

    return extractedData;
  },

  /**
   * 提取电影相关信息
   * @param {string} text 文本内容
   * @returns {Promise<Object>} 电影信息
   */
  async extractMovieInfo(text) {
    const movieInfo = {
      movieName: '',
      cinema: '',
      showtime: null,
      ticketCount: 2 // 默认2张票
    };

    // 提取电影名称（使用《》或者""包裹的内容）
    const movieNameMatch = text.match(/[《"](.*?)[》"]/);
    if (movieNameMatch) {
      movieInfo.movieName = movieNameMatch[1].trim();
    }

    // 提取影院信息
    const cinemaMatch = text.match(/(在|到|去|at|@)\s*([^,，。\s]+影城|[^,，。\s]+影院|[^,，。\s]+电影院)/);
    if (cinemaMatch) {
      movieInfo.cinema = cinemaMatch[2].trim();
    }

    // 提取时间信息
    const timeMatch = text.match(/(\d{1,2})[点时:：](\d{1,2})?/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const showtime = new Date();
      showtime.setHours(hours, minutes, 0, 0);
      movieInfo.showtime = showtime;
    }

    // 提取票数
    const ticketMatch = text.match(/(\d+)\s*张票/);
    if (ticketMatch) {
      movieInfo.ticketCount = parseInt(ticketMatch[1]);
    }

    return movieInfo;
  },

  /**
   * 提取烹饪相关信息
   * @param {string} text 文本内容
   * @returns {Promise<Object>} 烹饪信息
   */
  async extractCookingInfo(text) {
    return {
      dishName: this.extractDishName(text),
      ingredients: this.extractIngredients(text),
      cookingMethod: this.extractCookingMethod(text),
      servings: this.extractServings(text) || 2,
      estimatedTime: this.extractCookingTime(text)
    };
  },

  /**
   * 提取运动相关信息
   * @param {string} text 文本内容
   * @returns {Promise<Object>} 运动信息
   */
  async extractExerciseInfo(text) {
    return {
      exerciseType: this.extractExerciseType(text),
      targetWeight: this.extractTargetWeight(text),
      duration: this.extractDuration(text),
      intensity: this.extractIntensity(text),
      location: this.extractLocation(text)
    };
  },

  /**
   * 提取旅游相关信息
   * @param {string} text 文本内容
   * @returns {Promise<Object>} 旅游信息
   */
  async extractTravelInfo(text) {
    return {
      destination: this.extractDestination(text),
      startDate: this.extractStartDate(text),
      endDate: this.extractEndDate(text),
      transportation: this.extractTransportation(text),
      accommodation: this.extractAccommodation(text),
      budget: this.extractBudget(text)
    };
  },

  /**
   * 提取探店相关信息
   * @param {string} text 文本内容
   * @returns {Promise<Object>} 探店信息
   */
  async extractShopInfo(text) {
    return {
      shopName: this.extractShopName(text),
      address: this.extractAddress(text),
      cuisine: this.extractCuisine(text),
      budget: this.extractBudget(text),
      visitTime: this.extractVisitTime(text)
    };
  },

  /**
   * 验证计划数据
   * @param {string} planType 计划类型
   * @param {Object} data 计划数据
   * @returns {{isValid: boolean, message: string}} 验证结果
   */
  validatePlanData(planType, data) {
    const result = {
      isValid: true,
      message: ''
    };

    // 通用字段验证
    if (!data.content || data.content.length < 2) {
      result.isValid = false;
      result.message = '计划内容太短，请详细描述';
      return result;
    }

    // 特定类型验证
    switch (planType) {
      case 'movie':
        if (!data.movieName) {
          result.isValid = false;
          result.message = '请输入要看的电影名称';
        }
        break;

      case 'cooking':
        if (!data.dishName) {
          result.isValid = false;
          result.message = '请输入要做的菜品名称';
        }
        break;

      case 'exercise':
        if (!data.exerciseType) {
          result.isValid = false;
          result.message = '请指定运动类型';
        }
        break;

      case 'travel':
        if (!data.destination) {
          result.isValid = false;
          result.message = '请输入旅行目的地';
        }
        break;

      case 'shop':
        if (!data.shopName && !data.address) {
          result.isValid = false;
          result.message = '请输入店铺名称或地址';
        }
        break;
    }

    return result;
  },

  /**
   * 创建计划
   * @param {string} planType 计划类型
   * @param {Object} planData 计划数据
   */
  async createPlanByType(planType, planData) {
    console.log('开始创建计划', { planType, planData });

    const db = wx.cloud.database();
    const { coupleId } = this.data;

    try {
      // 获取伴侣信息
      const partnerInfo = StorageManager.getStorage('partnerInfo');
      
      // 添加通用字段
      const finalData = {
        ...planData,
        coupleId, // 使用coupleId关联情侣双方
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
        creator: this.data.userInfo.openid,
        creatorNickName: this.data.userInfo.nickName, // 添加创建者昵称
        partnerId: StorageManager.getStorage('partnerId'), // 添加伴侣ID
        partnerNickName: partnerInfo?.nickName || '', // 添加伴侣昵称
        status: 'pending',
        // 添加互动相关字段
        likes: [], // 点赞列表
        comments: [], // 评论列表
        completedBy: null, // 由谁完成的
        completedTime: null // 完成时间
      };

      // 处理图片上传（如果有）
      if (planData.images && planData.images.length > 0) {
        finalData.images = await this.uploadAndCompressImages(planData.images);
      }

      // 根据计划类型选择集合
      const collectionName = `ld_${planType}_plans`;
      
      // 创建计划
      const result = await db.collection(collectionName).add({
        data: finalData
      });

      console.log('计划创建成功', { planType, planId: result._id });
      return result._id;

    } catch (error) {
      console.error('创建计划失败', error);
      throw error;
    }
  },

  /**
   * 上传并压缩图片
   * @param {string[]} imagePaths 本地图片路径数组
   * @returns {Promise<string[]>} 云存储图片路径数组
   */
  async uploadAndCompressImages(imagePaths) {
    const compressedImages = [];

    for (const path of imagePaths) {
      try {
        // 压缩图片
        const compressedPath = await this.compressImage(path);
        
        // 上传到云存储
        const cloudPath = `plans/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath,
          filePath: compressedPath
        });

        compressedImages.push(uploadResult.fileID);
      } catch (error) {
        console.error('图片处理失败', error);
      }
    }

    return compressedImages;
  },

  /**
   * 压缩图片
   * @param {string} imagePath 原图路径
   * @returns {Promise<string>} 压缩后的图片路径
   */
  async compressImage(imagePath) {
    try {
      const result = await CompressUtil.compressImage(imagePath);
      return result.tempFilePath;
    } catch (error) {
      console.error('图片压缩失败:', error);
      return imagePath;
    }
  },

  /**
   * 获取计划类型的中文名称
   * @param {string} planType 计划类型
   * @returns {string} 中文名称
   */
  getPlanTypeName(planType) {
    const typeNames = {
      movie: '影视计划',
      cooking: '烹饪计划',
      exercise: '运动打卡',
      travel: '旅游计划',
      shop: '探店计划',
      memo: '临时备忘'
    };
    
    return typeNames[planType] || '未知类型';
  },

  /**
   * 切换标签页
   * @param {Object} e 事件对象
   */
  switchTab(e) {
    const { tab } = e.currentTarget.dataset;
    this.setData({ activeTab: tab });
    console.log('切换标签页', { tab });
  },

  /**
   * 显示计划详情
   * @param {Object} e 事件对象
   */
  showPlanDetail(e) {
    const { plan, type } = e.currentTarget.dataset;
    this.setData({
      showDetailModal: true,
      currentPlanDetail: { ...plan, type }
    });
    console.log('显示计划详情', { planId: plan._id, type });
  },

  /**
   * 隐藏计划详情
   */
  hidePlanDetail() {
    this.setData({
      showDetailModal: false,
      currentPlanDetail: null
    });
  },



  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('情侣计划页面显示');
    
    // 避免与onLoad重复调用数据库查询
    // 只有在页面未加载或者需要刷新数据时才调用
    if (!this.data.pageLoaded) {
      console.log('onShow: 页面未完全加载，开始获取计划统计数据');
      this.loadPlanCountsFromCloud();
    } else {
      console.log('onShow: 页面已加载，跳过重复的数据库查询');
      // 可以在这里添加其他需要在页面显示时执行的逻辑
      // 比如检查是否需要更新数据等
    }
  },



  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    console.log('用户下拉刷新');
    // 重置页面加载标志，确保能正常刷新数据
    this.setData({ pageLoaded: false });
    this.loadPlanCountsFromCloud();
    wx.stopPullDownRefresh();
  },

  /**
   * 阻止事件冒泡
   * @description 用于防止子元素的点击事件触发父元素的点击事件
   * @param {Object} e 事件对象
   */
  stopPropagation(e) {
    // 阻止事件冒泡，防止触发父元素的点击事件
    console.log('阻止事件冒泡');
  },

  /**
   * 显示编辑详情弹窗
   */
  showEditDetailModal() {
    this.setData({ showEditDetailModal: true, editDetail: { ...this.data.currentPlanDetail } });
  },

  /**
   * 隐藏编辑详情弹窗
   */
  hideEditDetailModal() {
    this.setData({ showEditDetailModal: false });
  },

  /**
   * 编辑详情输入变化
   */
  onEditDetailInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      editDetail: { ...this.data.editDetail, [field]: e.detail.value }
    });
  },



  /**
   * 提取标签
   * @param {string} text 文本内容
   * @returns {string[]} 标签数组
   */
  extractTags(text) {
    return []; // 暂时返回空数组
  },

  /**
   * 提取优先级
   * @param {string} text 文本内容
   * @returns {number} 优先级 1-5，默认3
   */
  extractPriority(text) {
    return 3; // 默认优先级
  },

  /**
   * 提取提醒时间
   * @param {string} text 文本内容
   * @returns {Date|null} 提醒时间
   */
  extractReminder(text) {
    return null; // 暂时返回null
  },

  /**
   * 提取菜品名称
   * @param {string} text 文本内容
   * @returns {string} 菜品名称
   */
  extractDishName(text) {
    const firstLine = text.split('\n')[0].trim();
    return firstLine || '未命名菜品';
  },

  /**
   * 提取食材
   * @param {string} text 文本内容
   * @returns {Array<{name: string, amount: string}>} 食材列表
   */
  extractIngredients(text) {
    return [];
  },

  /**
   * 提取烹饪方法
   * @param {string} text 文本内容
   * @returns {string} 烹饪方法
   */
  extractCookingMethod(text) {
    return '未指定';
  },

  /**
   * 提取份量
   * @param {string} text 文本内容
   * @returns {number} 份量（人数）
   */
  extractServings(text) {
    return 2;
  },

  /**
   * 提取预计烹饪时间
   * @param {string} text 文本内容
   * @returns {number} 预计时间（分钟）
   */
  extractCookingTime(text) {
    return 30;
  },

  /**
   * 提取运动类型
   * @param {string} text 文本内容
   * @returns {string} 运动类型
   */
  extractExerciseType(text) {
    return '其他运动';
  },

  /**
   * 提取运动时长
   * @param {string} text 文本内容
   * @returns {number} 时长（分钟）
   */
  extractDuration(text) {
    return 60;
  },

  /**
   * 提取运动强度
   * @param {string} text 文本内容
   * @returns {string} 运动强度
   */
  extractIntensity(text) {
    return 'medium';
  },

  /**
   * 提取运动地点
   * @param {string} text 文本内容
   * @returns {string} 运动地点
   */
  extractLocation(text) {
    return '未指定地点';
  },

  /**
   * 提取目标体重
   * @param {string} text 文本内容
   * @returns {number|null} 目标体重（千克）
   */
  extractTargetWeight(text) {
    return null;
  },

  /**
   * 提取目的地
   * @param {string} text 文本内容
   * @returns {string} 目的地
   */
  extractDestination(text) {
    return '未指定目的地';
  },

  /**
   * 提取出发日期
   * @param {string} text 文本内容
   * @returns {Date|null} 出发日期
   */
  extractStartDate(text) {
    return null;
  },

  /**
   * 提取结束日期
   * @param {string} text 文本内容
   * @returns {Date|null} 结束日期
   */
  extractEndDate(text) {
    return null;
  },

  /**
   * 提取交通方式
   * @param {string} text 文本内容
   * @returns {string} 交通方式
   */
  extractTransportation(text) {
    return '未指定交通方式';
  },

  /**
   * 提取住宿信息
   * @param {string} text 文本内容
   * @returns {string} 住宿信息
   */
  extractAccommodation(text) {
    return '未指定住宿';
  },

  /**
   * 提取预算
   * @param {string} text 文本内容
   * @returns {number|null} 预算金额
   */
  extractBudget(text) {
    return null;
  },

  /**
   * 提取店铺名称
   * @param {string} text 文本内容
   * @returns {string} 店铺名称
   */
  extractShopName(text) {
    const firstLine = text.split('\n')[0].trim();
    return firstLine || '未知店铺';
  },

  /**
   * 提取店铺地址
   * @param {string} text 文本内容
   * @returns {string} 店铺地址
   */
  extractAddress(text) {
    return '未指定地址';
  },

  /**
   * 提取菜系
   * @param {string} text 文本内容
   * @returns {string} 菜系
   */
  extractCuisine(text) {
    return '未指定菜系';
  },

  /**
   * 提取访问时间
   * @param {string} text 文本内容
   * @returns {Date|null} 访问时间
   */
  extractVisitTime(text) {
    return null;
  },

  /**
   * 显示手动添加弹窗
   */
  showManualAdd() {
    this.setData({
      showManualAddModal: true,
      movieName: '',
      movieInfo: null
    });
  },

  /**
   * 隐藏手动添加弹窗
   */
  hideManualAdd() {
    this.setData({
      showManualAddModal: false,
      movieName: '',
      movieInfo: null
    });
  },

  /**
   * 电影名称输入事件处理
   */
  onMovieNameInput(e) {
    this.setData({
      movieName: e.detail.value,
      movieInfo: null
    });
  },



  /**
   * 添加影视计划
   */
  async addMoviePlan() {
    const { movieInfo, userInfo } = this.data;
    if (!movieInfo) {
      LoadingManager.showToast('请先搜索电影信息', 'none');
      return;
    }

    this.setData({ isAdding: true });

    try {
      const db = wx.cloud.database();
      
      // 构建计划数据
      const planData = {
        movieName: movieInfo.title,
        movieInfo: this.formatMovieInfo(movieInfo),
        director: movieInfo.director,
        actors: movieInfo.actors,
        summary: movieInfo.summary,
        status: 'pending',
        watched: false,
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
        creator: userInfo.openid,
        coupleId: this.data.coupleId
      };

      // 添加到数据库
      await db.collection('ld_movie_plans').add({
        data: planData
      });

      // 刷新数据
      this.loadAllPlans(true);

      // 关闭弹窗
      this.hideManualAdd();

      LoadingManager.showToast('添加成功', 'success');

    } catch (error) {
      console.error('添加影视计划失败:', error);
      LoadingManager.showToast('添加失败，请重试', 'error');
    } finally {
      this.setData({ isAdding: false });
    }
  },

  /**
   * 格式化电影信息
   * @param {Object} movieInfo 电影信息对象
   * @returns {string} 格式化后的电影信息
   */
  formatMovieInfo(movieInfo) {
    return `《${movieInfo.title}》\n导演：${movieInfo.director}\n主演：${movieInfo.actors}\n简介：${movieInfo.summary}`;
  },





  /**
   * 导航到计划详情页面
   * @param {Object} e 事件对象
   */
  navigateToPlanDetail(e) {
    const { type } = e.currentTarget.dataset;
    
    // 根据计划类型导航到对应的详情页面
    switch (type) {
      case 'movie':
        wx.navigateTo({
          url: '/pages/plan/movie/movie'
        });
        break;
      case 'cooking':
        LoadingManager.navigateTo('/pages/plan/cooking/cooking');
        break;
      case 'exercise':
        LoadingManager.navigateTo('/pages/plan/exercise/exercise');
        break;
      case 'travel':
        LoadingManager.navigateTo('/pages/plan/travel/travel');
        break;
      case 'shop':
        LoadingManager.navigateTo('/pages/plan/shop/shop');
        break;
      case 'memo':
        LoadingManager.navigateTo('/pages/plan/memo/memo');
        break;
      default:
        console.warn('未知的计划类型:', type);
    }
  },
});
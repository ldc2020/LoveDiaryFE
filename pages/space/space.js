// 云开发已在app.js中初始化，这里不需要重复初始化
//页面刷新：
// 	加载旧数据
//   加载skip条数-pageSize
// 更新新数据
//   查pageSize条数据库中的数据，和当前缓存数中的pageSize条做对比，看是否有新数据

const CompressUtil = require('../../utils/compressUtil');
const ImageHandler = require('../../utils/imageHandler');
const LoadingManager = require('../../utils/loadingManager');
const StorageManager = require('../../utils/storageManager');
  
Page({
  data: {
    moments: [],
    loading: false,
    refreshing: false,
    showPublishModal: false,
    showCommentModal: false,
    publishContent: '',
    selectedImages: [],
    publishing: false,
    commentText: '',
    currentCommentMomentId: '',
    userInfo: null,
    partnerInfo: null, // 情侣信息
    coupleId: null,
    // 分页相关
    pageSize: 10, // 每页加载数量
    hasMore: true, // 是否还有更多数据
    loadingMore: false, // 是否正在加载更多
    // 新的缓存配置 - 基于200M存储限制
    maxStorageSize: 200 * 1024 * 1024, // 200MB总限制
    maxImageCacheSize: 150 * 1024 * 1024, // 150MB图片缓存限制
    maxDataCacheSize: 50 * 1024 * 1024, // 50MB数据缓存限制
    imageCache: new Map(), // 图片缓存映射 {fileID: {localPath, size, lastAccess, downloadTime}}
    cacheStats: {
      totalSize: 0,
      imageCount: 0,
      lastCleanup: 0
    },
    backgroundImage: '', // 背景图片
    isRefreshing: false, // 刷新状态
    currentUserOpenid: null, // 当前用户openid
    partnerId: null // 伴侣ID
  },

  onLoad() {
    // 检查绑定状态
    const coupleId = StorageManager.getStorage('coupleId');
    const bindStatus = StorageManager.getStorage('bindStatus');
    
    if (!coupleId || bindStatus !== 'bound') {
      // 未绑定，跳转到绑定页面
      LoadingManager.navigateTo('/pages/bind/bind', true);
      return;
    }

    // 获取当前用户openid和伴侣ID
    const currentUserOpenid = StorageManager.getStorage('openid');
    const partnerId = StorageManager.getStorage('partnerId');
    
    this.setData({
      coupleId: coupleId,
      currentUserOpenid: currentUserOpenid,
      partnerId: partnerId
    });

    // 加载背景图片
    const cachedBackgroundImage = StorageManager.getStorage('showbackgroundImage');
    if (cachedBackgroundImage) {
      this.setData({ backgroundImage: cachedBackgroundImage });
    }

    // 初始化智能缓存系统
    this.initSmartCacheSystem();
    
    // 获取用户信息
    this.getUserInfo().then(userInfo => {

      this.setData({ userInfo });
    }).catch(error => {
      console.error('获取用户信息失败:', error);
      // 如果获取用户信息失败，跳转到绑定页面
      LoadingManager.navigateTo('/pages/bind/bind', true);
    });

    // 获取情侣信息
    this.getPartnerInfo().then(partnerInfo => {
      this.setData({ partnerInfo });
    }).catch(error => {
      console.error('获取情侣信息失败:', error);
    });
    
    // 获取瞬间列表
    this.getMoments();
  },

  onShow() {
    // 页面显示时只在必要时刷新数据
    // 避免与onLoad重复调用导致下载两次数据
    if (this.data.coupleId && !this.data.moments.length && !this.data.loading) {
      console.log('onShow: 检测到无数据且未在加载中，开始获取数据');
      this.getMoments();
    } else {
      console.log('onShow: 跳过数据获取，原因：', {
        hasCoupleId: !!this.data.coupleId,
        hasMoments: this.data.moments.length > 0,
        isLoading: this.data.loading
      });
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.refreshData();
  },

  /**
   * 刷新数据
   */
  async refreshData() {
    if (this.data.isRefreshing) return;
    
    this.setData({ 
      isRefreshing: true,
      hasMore: true // 重置分页状态
    });
    
    try {
      // 显示刷新前的缓存状态
      const beforeStats = this.getCacheStats();
      console.log('刷新前缓存状态:', {
        已用空间: this.formatFileSize(beforeStats.totalSize),
        图片数量: beforeStats.imageCount,
        使用率: `${beforeStats.usagePercentage}%`
      });
      
      await this.getMoments(true, false);
      
      // 显示刷新后的缓存状态
      const afterStats = this.getCacheStats();
      console.log('刷新后缓存状态:', {
        已用空间: this.formatFileSize(afterStats.totalSize),
        图片数量: afterStats.imageCount,
        使用率: `${afterStats.usagePercentage}%`,
        变化: this.formatFileSize(afterStats.totalSize - beforeStats.totalSize)
      });
      
      LoadingManager.showToast('刷新成功', 'success');
    } catch (error) {
      console.error('刷新失败:', error);
      LoadingManager.showToast('刷新失败', 'none');
    } finally {
      this.setData({ isRefreshing: false });
      wx.stopPullDownRefresh();
    }
  },

  /**
   * 页面触底事件 - 加载更多瞬间
   */
  onReachBottom() {
    console.log('到达底部，开始加载更多');
    this.getMoments(false, true);
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {
    // 阻止事件冒泡，用于模态框等组件
  },

  /**
   * 内容输入处理
   */
  onContentInput(e) {
    this.setData({
      publishContent: e.detail.value
    });
  },

  /**
   * 选择图片
   */
  selectImages() {
    const maxImages = 9;
    const currentCount = this.data.selectedImages.length;
    const remainingCount = maxImages - currentCount;
    
    if (remainingCount <= 0) {
      LoadingManager.showToast('最多只能选择9张图片', 'none');
      return;
    }
    
    wx.chooseMedia({
      count: remainingCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFiles = res.tempFiles.map(file => file.tempFilePath);
        const newImages = [...this.data.selectedImages, ...tempFiles];
        this.setData({
          selectedImages: newImages
        });
      },
      fail: (error) => {
        console.error('选择图片失败:', error);
        LoadingManager.showToast('选择图片失败', 'none');
      }
    });
  },

  /**
   * 根据用户ID获取用户头像
   * @param {string} userId - 用户ID或openid
   * @returns {string} 头像地址
   */
  getUserAvatarByUserId(userId) {
    const { userInfo, partnerInfo, currentUserOpenid, partnerId } = this.data;
    
    // 如果是当前用户
    if (userId === currentUserOpenid) {
      if (userInfo && userInfo.localAvatarPath) {
        // 检查本地文件是否存在
        try {
          const fs = wx.getFileSystemManager();
          fs.accessSync(userInfo.localAvatarPath);
          return userInfo.localAvatarPath;
        } catch (error) {
          // 本地文件不存在，使用云端头像
          return userInfo.cloudAvatarUrl || userInfo.avatarUrl || './images/default-avatar.png';
        }
      }
      return userInfo?.avatarUrl || './images/default-avatar.png';
    }
    
    // 如果是伴侣
    if (userId === partnerId) {
      if (partnerInfo && partnerInfo.avatarUrl && !partnerInfo.avatarUrl.includes('127.0.0.1')) {
        return partnerInfo.avatarUrl;
      }
      return partnerInfo?.cloudAvatarUrl || './images/default-avatar.png';
    }
    
    // 其他用户使用默认头像
    return './images/default-avatar.png';
  },

  /**
   * 根据用户ID获取用户名
   * @param {string} userId - 用户ID或openid
   * @returns {string} 用户名
   */
  getUserNameByUserId(userId) {
    const { userInfo, partnerInfo, currentUserOpenid, partnerId } = this.data;
    
    // 如果是当前用户
    if (userId === currentUserOpenid) {
      return userInfo?.nickName || '我';
    }
    
    // 如果是伴侣
    if (userId === partnerId) {
      return partnerInfo?.nickName || 'TA';
    }
    
    // 其他用户
    return '未知用户';
  },

  /**
   * 获取用户信息
   */
  getUserInfo() {
    return new Promise((resolve, reject) => {
      // 先尝试从缓存获取
      const cachedUserInfo = StorageManager.getStorage('userInfo');
      if (cachedUserInfo) {
        resolve(cachedUserInfo);
        return;
      }
     

      // 如果缓存中没有，则从云数据库获取
      const db = wx.cloud.database();
      const openid = StorageManager.getStorage('openid');
      
      if (!openid) {
        reject(new Error('未找到openid'));
        return;
      }

      db.collection('ld_user_info').where({
        _openid: openid
      }).get().then(res => {
        if (res.data.length > 0) {
          const userInfo = res.data[0];
          StorageManager.setStorage('userInfo', userInfo);
          resolve(userInfo);
        } else {
          reject(new Error('未找到用户信息'));
        }
      }).catch(reject);
    });
  },

  /**
   * 获取情侣ID
   */
  getCoupleId() {
    const cachedCoupleId = StorageManager.getStorage('coupleId');
    if (cachedCoupleId) {
      return cachedCoupleId;
    }
    
    // 如果缓存中没有，可以从用户信息中获取
    const userInfo = this.data.userInfo;
    if (userInfo && userInfo.coupleId) {
      StorageManager.setStorage('coupleId', userInfo.coupleId);
      return userInfo.coupleId;
    }
    
    return null;
  },

  /**
   * 获取情侣信息
   * 优先使用本地缓存，避免覆盖index.js中正确设置的本地头像路径
   */
  getPartnerInfo() {
    return new Promise((resolve, reject) => {
      // 先尝试从缓存获取
      const cachedPartnerInfo = StorageManager.getStorage('partnerInfo');
      if (cachedPartnerInfo) {
        // 检查缓存是否完整（包含本地头像路径）
        if (cachedPartnerInfo.avatarUrl && cachedPartnerInfo.cloudAvatarUrl) {
          resolve(cachedPartnerInfo);
          return;
        }
      }
      
      console.log('获取情侣信息'+partnerId);
      // 如果缓存中没有或不完整，则从云数据库获取
      const db = wx.cloud.database();
      const partnerId = StorageManager.getStorage('partnerId');
      console.log('获取情侣信息：'+partnerId);
      if (!partnerId) {
        reject(new Error('未找到partnerId'));
        return;
      }

      db.collection('ld_user_info').where({
         $or: [
           { userId: partnerId }
         ]
       }).get().then(res => {
        if (res.data.length > 0) {
          // 如果有缓存但不完整，保留已有的本地头像路径
          const existingPartnerInfo = cachedPartnerInfo || {};
          const partnerInfo = {
            nickName: res.data[0].nickName,
            // 保留已有的本地头像路径，如果没有则使用云端地址
            avatarUrl: existingPartnerInfo.avatarUrl || res.data[0].avatarUrl,
            // 更新云端头像URL
            cloudAvatarUrl: res.data[0].avatarUrl
          };
          
          // 只有在缓存不存在或不完整时才更新缓存
          if (!cachedPartnerInfo || !cachedPartnerInfo.avatarUrl || !cachedPartnerInfo.cloudAvatarUrl) {
            StorageManager.setStorage('partnerInfo', partnerInfo);
          }
          
          resolve(partnerInfo);
        } else {
          reject(new Error('未找到情侣信息'));
        }
      }).catch(reject);
    });
  },

  // 移除getBackgroundImage方法，因为背景是全局的，不需要从云端获取

  /**
   * 获取瞬间列表
   * @param {boolean} isRefresh - 是否为刷新操作
   * @param {boolean} isLoadMore - 是否为加载更多操作
   */
  async getMoments(isRefresh = false, isLoadMore = false) {
    // 防止重复调用的保护机制
    if (this.data.loading && !isLoadMore) {
      console.log('getMoments: 已在加载中，跳过重复调用');
      return;
    }
    if (isLoadMore && (this.data.loadingMore || !this.data.hasMore)) {
      console.log('getMoments: 加载更多条件不满足，跳过调用');
      return;
    }
    

    
    if (isLoadMore) {
      this.setData({ loadingMore: true });
    } else {
      this.setData({ loading: true });
    }
    
    try {
      // 如果是刷新或首次加载，先显示缓存的数据
      if (!isLoadMore) {
        const cachedMoments = this.getLocalCachedMoments();
        if (cachedMoments.length > 0) {
          this.setData({
            moments: cachedMoments,
            loading: false
          });
        }
      }
      
      // 从云端获取数据
      const db = wx.cloud.database();
      const coupleId = this.data.coupleId;
      
      if (!coupleId) {
        throw new Error('未找到情侣ID');
      }

      // 计算跳过的数量
      const skip = isLoadMore ? this.data.moments.length : 0;
      console.log('skip:'+skip);
      const result = await db.collection('ld_moments')
        .where({
          coupleId: coupleId
        })
        .orderBy('timestamp', 'desc')
        .skip(skip)
        .limit(this.data.pageSize)
        .get();

      if (result.data) {
        // 检查是否还有更多数据
        const hasMore = result.data.length === this.data.pageSize;
        
        // 为每个瞬间添加用户头像
        const momentsWithAvatars = await this.addUserAvatarsToMoments(result.data);
        
        let momentsWithCachedImages;
        if (isLoadMore) {// 旧数据
          // 加载更多时，直接落盘文件并返回信息
          momentsWithCachedImages = await this.cacheMomentImages(momentsWithAvatars);
          // 合并到现有数据
          const allMoments = [...this.data.moments, ...momentsWithCachedImages];
          this.setData({
            moments: allMoments,
            loadingMore: false,
            hasMore: hasMore
          });
          // 更新本地缓存
          this.updateLocalCache(allMoments);
        } else {// 新数据
          // 首次加载或刷新
          // 获取本地缓存
          const cachedMoments = this.getLocalCachedMoments();
          // 只取前pageSize条缓存数据进行比较,避免比较过多历史数据
          const recentCachedMoments = cachedMoments.slice(0, this.data.pageSize);
          const hasNewData = this.checkForNewMoments(result.data, recentCachedMoments);
          
          if (hasNewData) {
            // 只有在有新数据时才缓存图片和更新本地缓存
            console.log('检测到新数据，开始缓存图片并更新本地缓存');
            // 图片落盘并返回信息供下面的updateLocalCache更新缓存
            momentsWithCachedImages = await this.cacheMomentImages(momentsWithAvatars);
            
            // 刷新时合并新数据和现有数据，保留已加载的图片
            const existingMoments = this.data.moments || [];
            // 创建新数据的ID集合，用于去重
            const newMomentIds = new Set(momentsWithCachedImages.map(m => m._id));
            // 过滤掉已存在的数据，避免重复
            const filteredExistingMoments = existingMoments.filter(m => !newMomentIds.has(m._id));
            // 合并数据：新数据在前，旧数据在后
            const mergedMoments = [...momentsWithCachedImages, ...filteredExistingMoments];
            
            // 更新本地缓存 - 使用合并后的完整数据
            this.updateLocalCache(mergedMoments);
            momentsWithCachedImages = mergedMoments;
          } else {
            // 没有新数据，使用本地缓存的图片路径
            console.log('没有新数据，使用本地缓存的图片路径');
            momentsWithCachedImages = this.applyLocalImageCache(momentsWithAvatars);
            
            // 即使没有新数据，也要保留已加载的图片
            const existingMoments = this.data.moments || [];
            if (existingMoments.length > momentsWithAvatars.length) {
              // 如果现有数据比云端返回的数据多，说明用户已经加载了更多数据
              // 合并云端最新数据和本地已加载的数据
              const cloudMomentIds = new Set(momentsWithAvatars.map(m => m._id));
              const additionalMoments = existingMoments.filter(m => !cloudMomentIds.has(m._id));
              momentsWithCachedImages = [...momentsWithCachedImages, ...additionalMoments];
            }
          }
          
          this.setData({
            moments: momentsWithCachedImages,
            loading: false,
            hasMore: hasMore
          });
        }
      }
    } catch (error) {
      console.error('获取瞬间失败:', error);
      
      if (isLoadMore) {
        // 加载更多失败
        this.setData({
          loadingMore: false
        });
        LoadingManager.showToast('加载更多失败', 'none');
      } else {
        // 如果云端获取失败，使用缓存数据
        const cachedMoments = this.getLocalCachedMoments();
        this.setData({
          moments: cachedMoments,
          loading: false
        });
        
        LoadingManager.showToast('加载失败，显示缓存数据', 'none');
      }
    }
  },

  /**
   * 获取本地缓存的瞬间
   */
  getLocalCachedMoments() {
    try {
      const cacheKey = `coupleMoments_${this.data.coupleId}`;
      const cachedData = StorageManager.getStorage(cacheKey) || [];
      const sortedData = cachedData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return sortedData;
    } catch (error) {
      console.error('获取本地缓存失败:', error);
      return [];
    }
  },

  /**
   * 检查是否有新的moments数据
   * @param {Array} cloudMoments - 云端获取的moments数据
   * @param {Array} cachedMoments - 本地缓存的moments数据
   * @returns {boolean} - 是否有新数据
   */
  checkForNewMoments(cloudMoments, cachedMoments) {
    try {
      // 如果本地没有缓存数据，说明是第一次加载，需要从云端下载图片
      if (!cachedMoments || cachedMoments.length === 0) {
        console.log('checkForNewMoments--本地没有缓存数据，需要从云端下载图片');
        return true;
      }
      
      // 如果云端数据数量与本地缓存不同，说明有新数据
      // 云端数据肯定是不一样的
      // if (cloudMoments.length !== cachedMoments.length) {
      //   console.log('--云端数据数量与本地缓存不同，有新数据');
      //   return true;
      // }
      
      // 比较最新的moment的时间戳（用于新数据更新）
      if (cloudMoments.length > 0 && cachedMoments.length > 0) {
        const latestCloudTimestamp = new Date(cloudMoments[0].timestamp).getTime();
        const latestCachedTimestamp = new Date(cachedMoments[0].timestamp).getTime();
        if (latestCloudTimestamp > latestCachedTimestamp) {
          return true;
        }
      }
      
      // 比较所有moment的ID，确保没有遗漏
      const cloudIds = new Set(cloudMoments.map(moment => moment._id));
      const cachedIds = new Set(cachedMoments.map(moment => moment._id));
      
      // 如果ID集合不同，说明有新数据或数据发生变化
      if (cloudIds.size !== cachedIds.size) {
        console.log('checkForNewMoments--'+cloudIds.size+':'+cachedIds.size);

        return true;
      }
      // 每一条id都对比
      for (let id of cloudIds) {
        if (!cachedIds.has(id)) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('检查新数据时出错:', error);
      // 出错时默认认为有新数据，确保功能正常
      return true;
    }
  },

  /**
   * 为瞬间添加用户头像（动态获取最新用户信息）
   * @param {Array} moments - 瞬间数组
   * @returns {Promise<Array>} - 包含用户头像的瞬间数组
   * 
   * 这个方法会动态地从数据库获取最新的用户信息，然后为每个瞬间添加用户头像。
   * 如果用户信息无法获取，会使用默认头像。
   *
   * 注意：这个方法会发起多次数据库查询，可能会对性能产生一定的影响。
   * 如果性能是一个问题，你可以考虑使用缓存来减少数据库查询次数。
   */
  async addUserAvatarsToMoments(moments) {
    try {
      // 现在渲染层直接从userInfo和partnerInfo获取头像和用户名
      // 此函数主要用于保持数据结构的完整性
      // 不再需要添加userAvatar和userName字段到moments数据中
      return moments;
    } catch (error) {
      console.error('处理瞬间数据失败:', error);
      return moments;
    }
  },

  /**
   * 初始化智能缓存系统
   * 
   * 这个方法会在页面加载时调用，用于初始化智能缓存系统。
   * 它会加载缓存统计信息和图片缓存映射，并设置到data中。
   * 如果需要清理缓存，会在适当的时候调用cleanupCache方法。
   * 
   * 注意：这个方法会在页面加载时调用，所以不要在其他地方调用它。
   */
  async initSmartCacheSystem() {
    try {
      // 加载缓存统计信息
      const cacheStatsKey = `cacheStats_${this.data.coupleId}`;
      const savedStats = StorageManager.getStorage(cacheStatsKey) || {
        totalSize: 0,
        imageCount: 0,
        lastCleanup: 0
      };
      
      // 加载图片缓存映射
      const imageCacheKey = `imageCache_${this.data.coupleId}`;
      const savedImageCache = StorageManager.getStorage(imageCacheKey) || {};
      
      // 详细输出加载的缓存内容用于调试
 
      // 转换为Map对象
      const imageCache = new Map(Object.entries(savedImageCache));
      
      
      this.setData({
        cacheStats: savedStats,
        imageCache: imageCache
      });
      
      // 检查是否需要清理缓存
      // 注意：将清理逻辑延迟执行，避免在数据获取过程中清理缓存导致重复下载
      const now = Date.now();
      if (now - savedStats.lastCleanup > 1 * 24 * 60 * 60 * 1000) {
      // if (now - savedStats.lastCleanup > 0.1 * 60 * 1000) {
        console.log('检测到需要清理缓存，延迟2秒执行以避免与数据获取冲突');
        // 延迟执行清理，避免与getMoments同时执行导致缓存被清空后重复下载
        setTimeout(async () => {
          // console.log('开始定时清理缓存 - 测试模式（0.1分钟间隔）');
          await this.smartCacheCleanup();
        }, 2000);
      }
      
      console.log('智能缓存系统初始化完成:', {
        totalSize: this.formatFileSize(savedStats.totalSize),
        imageCount: savedStats.imageCount
      });
    } catch (error) {
      console.error('初始化缓存系统失败:', error);
    }
  },

  /**
   * 智能图片缓存管理 
   */
  async smartImageCache(fileID) {
    try {
      if (!fileID || typeof fileID !== 'string') {
        console.warn('无效的文件ID:', fileID);
        return fileID;
      }
      
      const imageCache = this.data.imageCache;
      const now = Date.now();
      
      // 检查是否已缓存
      if (imageCache.has(fileID)) {
        const cacheItem = imageCache.get(fileID);
        // 验证缓存文件是否存在
        try {
          const fs = wx.getFileSystemManager();
          await new Promise((resolve, reject) => {
            fs.access({
              path: cacheItem.localPath,
              success: resolve,
              fail: reject
            });
          });
          console.log('图片已缓存,无需下载');
          // 更新对应瞬间的访问时间
          this.updateMomentLastAccess(fileID);
          return cacheItem.localPath;
        } catch (e) {
          // 缓存文件不存在，从缓存中移除
          console.log('缓存文件不存在，重新下载:', fileID);
          imageCache.delete(fileID);
          this.saveCacheData();
        }
      }
      
      // 下载图片
      const downloadResult = await wx.cloud.downloadFile({ fileID });
      if (!downloadResult.tempFilePath) {
        throw new Error('下载失败');
      }
      
      // 获取文件大小
      const fs = wx.getFileSystemManager();
      const fileInfo = await new Promise((resolve, reject) => {
        fs.getFileInfo({
          filePath: downloadResult.tempFilePath,
          success: resolve,
          fail: reject
        });
      });
      
      const fileSize = fileInfo.size;
      
      // 检查是否需要清理空间
      await this.ensureCacheSpace(fileSize);
      
      // 保存文件
      const savedResult = await new Promise((resolve, reject) => {
        fs.saveFile({
          tempFilePath: downloadResult.tempFilePath,
          success: resolve,
          fail: reject
        });
      });
      
      // 添加到缓存
      // 确保localPath格式正确：真机上为wxfile://，开发者工具上为http://store/
      let localPath = savedResult.savedFilePath;
      
      // 如果是错误的127.0.0.1格式，需要修正
      if (localPath && localPath.includes('127.0.0.1') && localPath.includes('__store__')) {
        // 提取文件名部分
        const fileName = localPath.split('/').pop();
        localPath = `http://store/${fileName}`;
        console.log('修正本地路径格式:', savedResult.savedFilePath, '->', localPath);
      }
      
      const cacheItem = {
        localPath: localPath,
        size: fileSize,
        lastAccess: now, // 保留作为降级方案
        downloadTime: now
      };
      
      imageCache.set(fileID, cacheItem);
      
      // 更新对应瞬间的访问时间
      this.updateMomentLastAccess(fileID);
      
      // 更新统计信息
      const cacheStats = this.data.cacheStats;
      cacheStats.totalSize += fileSize;
      cacheStats.imageCount += 1;
      
      this.setData({ imageCache, cacheStats });
      this.saveCacheData();
      
      return savedResult.savedFilePath;
    } catch (error) {
      console.error('智能图片缓存失败:', error);
      // 直接返回云存储的临时链接，避免本地缓存的500错误
      try {
        const result = await wx.cloud.getTempFileURL({
          fileList: [fileID]
        });
        if (result.fileList && result.fileList[0] && result.fileList[0].tempFileURL) {
          console.log('使用临时链接作为降级方案:', result.fileList[0].tempFileURL);
          return result.fileList[0].tempFileURL;
        }
      } catch (e) {
        console.error('获取临时链接失败:', e);
      }
      return fileID;
    }
  },

  /**
   * 确保缓存空间足够
   * 基于瞬间访问时间来清理最久未访问的图片
   * @param {number} requiredSize - 需要的空间大小
   * @returns {Promise<void>}
   */
  async ensureCacheSpace(requiredSize) {
    const { maxImageCacheSize, cacheStats, imageCache } = this.data;
    
    // 如果当前大小加上需要的大小超过限制，则清理缓存
    while (cacheStats.totalSize + requiredSize > maxImageCacheSize && imageCache.size > 0) {
      // 基于瞬间访问时间找到最久未访问的图片
      let oldestFileID = null;
      let oldestTime = Date.now();
      
      try {
        const cacheKey = `coupleMoments_${this.data.coupleId}`;
        const cachedMoments = StorageManager.getStorage(cacheKey) || [];
        
        // 为每个缓存的图片找到对应瞬间的访问时间
        for (const [fileID, cacheItem] of imageCache.entries()) {
          let imageAccessTime = Date.now(); // 默认为当前时间
          
          // 查找包含该图片的瞬间
          for (const moment of cachedMoments) {
            if (moment.images && Array.isArray(moment.images)) {
              const hasTargetImage = moment.images.some(img => {
                const imgFileID = typeof img === 'string' ? img : (img.cloudUrl || img);
                return imgFileID === fileID;
              });
              
              if (hasTargetImage) {
                const momentLastAccess = moment.lastAccess || moment.timestamp || 0;
                imageAccessTime = typeof momentLastAccess === 'string' ? new Date(momentLastAccess).getTime() : momentLastAccess;
                break;
              }
            }
          }
          
          // 找到访问时间最早的图片
          if (imageAccessTime < oldestTime) {
            oldestTime = imageAccessTime;
            oldestFileID = fileID;
          }
        }
      } catch (error) {
        console.error('查找最久未访问图片时发生错误:', error);
        // 降级到使用图片自身的lastAccess时间
        for (const [fileID, cacheItem] of imageCache.entries()) {
          if (cacheItem.lastAccess < oldestTime) {
            oldestTime = cacheItem.lastAccess;
            oldestFileID = fileID;
          }
        }
      }
      
      if (oldestFileID) {
        await this.removeCacheItemOnly(oldestFileID);
      } else {
        break;
      }
    }
  },

  /**
   * 移除缓存项（仅删除缓存和本地文件，不删除瞬间数据）
   * @param {string} fileID - 文件ID
   */
  async removeCacheItemOnly(fileID) {
    const { imageCache, cacheStats } = this.data;
    const cacheItem = imageCache.get(fileID);
    
    // 添加空值检查，避免访问undefined的属性
    if (!cacheItem) {
      console.warn(`缓存项不存在: ${fileID}`);
      return;
    }
    
    console.log(`cacheItem.localPath: ${cacheItem.localPath}`);
    
    // 删除本地文件
    const fs = wx.getFileSystemManager();
    try {
      await new Promise((resolve, reject) => {
        fs.removeSavedFile({
          filePath: cacheItem.localPath,
          success: resolve,
          fail: reject
        });
      });
    } catch (error) {
      console.warn('删除本地文件失败:', error);
    }
    
    // 更新统计信息
    cacheStats.totalSize -= cacheItem.size;
    cacheStats.imageCount -= 1;
    
    // 从缓存中移除

    // 删除操作
    imageCache.delete(fileID);
    
    // 立即更新本地存储中的imageCache
    const imageCacheObj = Object.fromEntries(imageCache.entries());
    StorageManager.setStorage(`imageCache_${this.data.coupleId}`, imageCacheObj);
    
    this.setData({ imageCache, cacheStats });
    console.log(`移除缓存项: ${fileID}, 释放空间: ${this.formatFileSize(cacheItem.size)}`);
  },

  /**
   * 移除缓存项（包含删除瞬间数据，用于用户主动删除）
   * @param {string} fileID - 文件ID
   */
  async removeCacheItem(fileID) {
    // 先删除缓存和本地文件
    await this.removeCacheItemOnly(fileID);
    
    // 从coupleMoments本地存储中删除包含该fileID的瞬间数据
    try {
      const cacheKey = `coupleMoments_${this.data.coupleId}`;
      const cachedMoments = StorageManager.getStorage(cacheKey) || [];
      
      // 过滤掉包含该fileID的瞬间
      const filteredMoments = cachedMoments.filter(moment => {
        if (!moment.images || !Array.isArray(moment.images)) {
          return true; // 保留没有图片的瞬间
        }
        
        // 检查瞬间的图片中是否包含要删除的fileID
        const hasTargetFile = moment.images.some(img => {
          if (typeof img === 'string') {
            return img === fileID;
          } else if (typeof img === 'object' && img.cloudUrl) {
            return img.cloudUrl === fileID;
          }
          return false;
        });
        
        return !hasTargetFile; // 不包含目标fileID的瞬间才保留
      });
      
      // 更新本地存储
      if (filteredMoments.length !== cachedMoments.length) {
        StorageManager.setStorage(cacheKey, filteredMoments);
        console.log(`从coupleMoments中删除了${cachedMoments.length - filteredMoments.length}个包含fileID ${fileID}的瞬间`);
      }
    } catch (error) {
      console.warn('从coupleMoments删除相关瞬间失败:', error);
    }
  },

  /**
   * 智能缓存清理 - 基于瞬间访问时间
   * 清理7天未访问的瞬间及其关联的图片缓存和本地文件
   */
  async smartCacheCleanup() {
    const { cacheStats } = this.data;
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    // const sevenDaysAgo = now - 0.1 * 60 * 1000;
    let cleanedMomentsCount = 0;
    let cleanedImagesCount = 0;
    let cleanedSize = 0;
    
    console.log('开始基于瞬间访问时间的智能缓存清理');
    
    try {
      const cacheKey = `coupleMoments_${this.data.coupleId}`;
      const cachedMoments = StorageManager.getStorage(cacheKey) || [];
      const momentsToKeep = [];
      
      // 遍历所有瞬间，检查访问时间
      for (const moment of cachedMoments) {
        const momentLastAccess = moment.lastAccess || moment.timestamp || 0;
        const lastAccessTime = typeof momentLastAccess === 'string' ? new Date(momentLastAccess).getTime() : momentLastAccess;
        
        if (lastAccessTime < sevenDaysAgo) {
          // 瞬间超过7天未访问，删除其关联的图片缓存和本地文件
          cleanedMomentsCount++;
          
          if (moment.images && Array.isArray(moment.images)) {
            for (const img of moment.images) {
              const fileID = typeof img === 'string' ? img : (img.cloudUrl || img);
              if (fileID && this.data.imageCache.has(fileID)) {
                const cacheItem = this.data.imageCache.get(fileID);
                cleanedSize += cacheItem.size || 0;
                cleanedImagesCount++;
                await this.removeCacheItemOnly(fileID);
              }
            }
          }
        } else {
          // 保留未过期的瞬间
          momentsToKeep.push(moment);
        }
      }
      
      // 更新coupleMoments缓存，只保留未过期的瞬间
      StorageManager.setStorage(cacheKey, momentsToKeep);
      
    } catch (error) {
      console.error('智能清理过程中发生错误:', error);
    }
    
    // 更新清理时间
    cacheStats.lastCleanup = now;
    this.setData({ cacheStats });
    this.saveCacheData();
    
    console.log(`智能清理完成: 清理了${cleanedMomentsCount}个瞬间, ${cleanedImagesCount}个图片文件, 释放${this.formatFileSize(cleanedSize)}空间`);
    
    if (cleanedMomentsCount > 0) {
      console.log(`智能清理完成: 清理了${cleanedMomentsCount}个瞬间, ${cleanedImagesCount}个图片文件, 释放${this.formatFileSize(cleanedSize)}空间`);
    } else {
      console.log('智能清理完成: 没有需要清理的瞬间');
    }
  },

  /**
   * 保存缓存数据到本地存储
   */
  saveCacheData() {
    try {
      const { coupleId, imageCache, cacheStats } = this.data;
      // 将Map转换为普通对象保存
      const imageCacheObj = Object.fromEntries(imageCache.entries());
      
      
      StorageManager.setStorage(`imageCache_${coupleId}`, imageCacheObj);
      StorageManager.setStorage(`cacheStats_${coupleId}`, cacheStats);
    } catch (error) {
      console.error('保存缓存数据失败:', error);
    }
  },

  /**
   * 更新包含指定图片的瞬间的访问时间
   * @param {string} fileID - 图片的云端fileID
   */
  updateMomentLastAccess(fileID) {
    try {
      const cacheKey = `coupleMoments_${this.data.coupleId}`;
      const cachedMoments = StorageManager.getStorage(cacheKey) || [];
      const now = Date.now();
      let updated = false;
      
      // 查找包含该图片的瞬间并更新其访问时间
      const updatedMoments = cachedMoments.map(moment => {
        if (moment.images && Array.isArray(moment.images)) {
          const hasTargetImage = moment.images.some(img => {
            if (typeof img === 'string') {
              return img === fileID;
            } else if (typeof img === 'object' && img.cloudUrl) {
              return img.cloudUrl === fileID;
            }
            return false;
          });
          
          if (hasTargetImage) {
            updated = true;
            return {
              ...moment,
              lastAccess: now // 更新瞬间的访问时间
            };
          }
        }
        return moment;
      });
      
      // 如果有更新，保存到本地存储
      if (updated) {
        StorageManager.setStorage(cacheKey, updatedMoments);
      }
    } catch (error) {
      console.warn('更新瞬间访问时间失败:', error);
    }
  },

  /**
   * 获取缓存的图片路径
   * 同时更新对应瞬间的访问时间
   */
  getCachedImagePath(fileID) {
    const cacheItem = this.data.imageCache.get(fileID);
    // 当删除本地缓存，fileId会变成云端地址
    if (cacheItem) {
      // 更新对应瞬间的访问时间而不是图片的访问时间
      this.updateMomentLastAccess(fileID);
      
      // 检查并修正路径格式
      let localPath = cacheItem.localPath;
      if (localPath && localPath.includes('127.0.0.1') && localPath.includes('__store__')) {
        // 提取文件名部分
        const fileName = localPath.split('/').pop();
        localPath = `http://store/${fileName}`;
        console.log('修正缓存路径格式:', cacheItem.localPath, '->', localPath);
        
        // 更新缓存中的路径
        cacheItem.localPath = localPath;
        this.data.imageCache.set(fileID, cacheItem);
        this.saveCacheData();
      }
      
      return localPath;
    }
    return fileID;
  },

  /**
   * 格式化文件大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  /**
   * 更新本地数据缓存
   */
  updateLocalCache(moments) {
    try {
      const cacheKey = `coupleMoments_${this.data.coupleId}`;
      
      // 获取当前缓存的数据，用于清理超出限制的图片文件
      const currentCacheData = StorageManager.getStorage(cacheKey) || [];
      
      // 智能缓存：保存最新的200条数据，支持用户加载更多内容而不丢失
      // 增加缓存限制以避免用户下拉刷新时丢失已加载的图片
      const cacheData = moments.slice(0, 200).map(moment => ({
        ...moment,
        // 保持图片数据的完整性，包括localPath等重要信息
        images: moment.images ? moment.images.map(img => {
          if (typeof img === 'string') {
            return img;
          } else if (typeof img === 'object') {
            // 保留完整的图片对象结构
            return {
              cloudUrl: img.cloudUrl,
              localPath: img.localPath,
              url: img.url,
              ...img // 保留其他可能的属性
            };
          }
          return img;
        }) : []
      }));
      
      // 清理超过限制的图片文件，防止孤儿文件
      this.cleanupOrphanedImages(cacheData);
      
      StorageManager.setStorage(cacheKey, cacheData);
    } catch (error) {
      console.error('更新本地缓存失败:', error);
    }
  },

  /**
   * 清理孤儿图片文件
   * 孤儿文件定义：本地缓存中存在，但当前数据中不再使用的图片文件
   * @param {Array} currentData - 当前的数据
   */
  async cleanupOrphanedImages(currentData) {
    try {
      const { imageCache } = this.data;
      
      // 收集当前数据中所有正在使用的图片fileID
      const activeImageIds = new Set();
      if (currentData && Array.isArray(currentData)) {
        currentData.forEach(moment => {
          if (moment.images && Array.isArray(moment.images)) {
            moment.images.forEach(img => {
              if (typeof img === 'object' && img.cloudUrl) {
                activeImageIds.add(img.cloudUrl);
              } else if (typeof img === 'string') {
                activeImageIds.add(img);
              }
            });
          }
        });
      }
      
      // 找出缓存中存在但当前数据中不再使用的图片（孤儿文件）
      const orphanedImageIds = [];
      for (const [fileID, cacheItem] of imageCache.entries()) {
        if (!activeImageIds.has(fileID)) {
          orphanedImageIds.push(fileID);
        }
      }
      
      // 清理孤儿图片文件
      if (orphanedImageIds.length > 0) {
        console.log(`发现${orphanedImageIds.length}个孤儿图片文件，开始清理...`);
        
        for (const fileID of orphanedImageIds) {
          await this.removeCacheItemOnly(fileID);
        }
        
        console.log(`孤儿图片文件清理完成，共清理${orphanedImageIds.length}个文件`);
      } 
    } catch (error) {
      console.error('清理孤儿图片文件失败:', error);
    }
  },

  /**
   * 应用本地图片缓存路径（不重新下载）
   */
  applyLocalImageCache(moments) {
    if (!moments || !Array.isArray(moments)) {
      return moments || [];
    }
    
    return moments.map(moment => {
      const updatedMoment = { ...moment };
      
      if (moment.images && Array.isArray(moment.images) && moment.images.length > 0) {
        // 应用本地缓存路径，不重新下载
        const cachedImages = moment.images.map(imageUrl => {
          const cachedPath = this.getCachedImagePath(imageUrl);
          return {
            cloudUrl: imageUrl,  // 云端fileID
            localPath: cachedPath  // 本地缓存路径（如果存在）
          };
        });
        
        updatedMoment.cloudImages = moment.images;
        updatedMoment.images = cachedImages;
      }
      
      return updatedMoment;
    });
  },

  /**
   * 智能批量缓存moment中的图片
   */
  async cacheMomentImages(moments) {
    if (!moments || !Array.isArray(moments)) {
      console.warn('moments参数无效:', moments);
      return moments || [];
    }
    
    const updatedMoments = [];
    
    for (const moment of moments) {
      const updatedMoment = { ...moment };
      
      if (moment.images && Array.isArray(moment.images) && moment.images.length > 0) {
        const cachedImages = [];
        
        // 并发处理图片缓存，提高效率
        const cachePromises = moment.images.map(async (imageUrl) => {
          try {
            // 使用新的智能缓存系统，带超时处理
            const cachedPath = await Promise.race([
              this.smartImageCache(imageUrl),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('图片缓存超时')), 20000)
              )
            ]);
            
            return {
              cloudUrl: imageUrl,  // 云端fileID
              localPath: cachedPath  // 本地缓存路径
            };
          } catch (error) {
            console.error('缓存图片失败:', imageUrl, error);
            // 失败时返回原始URL
            return {
              cloudUrl: imageUrl,
              localPath: imageUrl
            };
          }
        });
        
        // 等待所有图片缓存完成
        const results = await Promise.allSettled(cachePromises);
        
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            cachedImages.push(result.value);
          }
        });
        
        // 保留原始的云端fileID数组用于删除
        updatedMoment.cloudImages = moment.images;
        // 新的图片数据结构包含本地和云端地址
        updatedMoment.images = cachedImages;
      }
      
      updatedMoments.push(updatedMoment);
    }
    
    return updatedMoments;
  },

  /**
   * 智能缓存清理 - 支持选择性清理
   * @param {Object} options - 选项
   * @param {boolean} options.force - 是否强制清理所有缓存
   * @param {boolean} options.showToast - 是否显示清理完成提示
   */
  async clearImageCache(options = {}) {
    const { force = false, showToast = true } = options;
    const { imageCache, cacheStats } = this.data;
    
    let cleanedCount = 0;
    let cleanedSize = 0;
    
    if (force) {
      // 强制清理所有缓存
      for (const [fileID, cacheItem] of imageCache.entries()) {
        cleanedSize += cacheItem.size;
        cleanedCount++;
        await this.removeCacheItemOnly(fileID);
      }
    } else {
      // 智能清理：基于瞬间访问时间清理超过7天未访问的图片
      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      // const sevenDaysAgo = now - 0.1 * 60 * 1000;
      console.log('智能清理：基于瞬间访问时间清理超过7天未访问的图片');
      
      try {
        const cacheKey = `coupleMoments_${this.data.coupleId}`;
        const cachedMoments = StorageManager.getStorage(cacheKey) || [];
        const momentsToKeep = [];
        
        // 遍历所有瞬间，检查访问时间
        for (const moment of cachedMoments) {
          const momentLastAccess = moment.lastAccess || moment.timestamp || 0;
          const lastAccessTime = typeof momentLastAccess === 'string' ? new Date(momentLastAccess).getTime() : momentLastAccess;
          
          if (lastAccessTime < sevenDaysAgo) {
            // 瞬间超过7天未访问，删除其关联的图片缓存和本地文件
            if (moment.images && Array.isArray(moment.images)) {
              for (const img of moment.images) {
                const fileID = typeof img === 'string' ? img : (img.cloudUrl || img);
                if (fileID && imageCache.has(fileID)) {
                  const cacheItem = imageCache.get(fileID);
                  cleanedSize += cacheItem.size || 0;
                  cleanedCount++;
                  await this.removeCacheItemOnly(fileID);
                }
              }
            }
          } else {
            // 保留未过期的瞬间
            momentsToKeep.push(moment);
          }
        }
        
        // 更新coupleMoments缓存，只保留未过期的瞬间
        StorageManager.setStorage(cacheKey, momentsToKeep);
        
      } catch (error) {
        console.error('智能清理过程中发生错误:', error);
      }
    }
    
    // 更新清理时间
    cacheStats.lastCleanup = Date.now();
    this.setData({ cacheStats });
    this.saveCacheData();
    
    if (showToast) {
      LoadingManager.showToast(
        force ? 
          `强制清理完成\n清理${cleanedCount}个文件` : 
          `智能清理完成\n清理${cleanedCount}个文件`,
        'success'
      );
    }
    
    console.log(`缓存清理完成: 清理了${cleanedCount}个文件, 释放${this.formatFileSize(cleanedSize)}空间`);
    
    return {
      cleanedCount,
      cleanedSize: this.formatFileSize(cleanedSize),
      remainingCount: imageCache.size,
      remainingSize: this.formatFileSize(cacheStats.totalSize)
    };
  },

  /**
   * 获取缓存统计信息
   */
  getCacheStats() {
    const { cacheStats, maxImageCacheSize } = this.data;
    
    // 确保数据有效性
    const totalSize = cacheStats?.totalSize || 0;
    const imageCount = cacheStats?.imageCount || 0;
    const maxSize = maxImageCacheSize || 200 * 1024 * 1024; // 默认200MB
    
    const usagePercentage = ((totalSize / maxSize) * 100).toFixed(1);
    
    return {
      totalSize: totalSize, // 返回原始数值，用于计算
      maxSize: maxSize,
      imageCount: imageCount,
      usagePercentage: parseFloat(usagePercentage), // 返回数值，不带%
      formattedTotalSize: this.formatFileSize(totalSize), // 格式化后的大小
      formattedMaxSize: this.formatFileSize(maxSize),
      usagePercent: usagePercentage + '%', // 带%的字符串
      lastCleanup: cacheStats?.lastCleanup ? new Date(cacheStats.lastCleanup).toLocaleString() : '从未清理'
    };
  },



  /**
   * 显示发布模态框
   */
  showPublishModal() {
    this.setData({
      showPublishModal: true,
      publishContent: '',
      selectedImages: []
    });
  },

  /**
   * 隐藏发布模态框
   */
  hidePublishModal() {
    this.setData({
      showPublishModal: false
    });
  },

  /**
   * 输入发布内容
   */
  onPublishInput(e) {
    this.setData({
      publishContent: e.detail.value
    });
  },

  /**
   * 选择图片
   * @deprecated 使用 ImageHandler.chooseImages 替代
   */
  async chooseImages() {
    const maxImages = 9;
    const currentCount = this.data.selectedImages.length;
    const remainingCount = maxImages - currentCount;
    
    if (remainingCount <= 0) {
      LoadingManager.showToast(`最多只能选择${maxImages}张图片`);
      return;
    }
    
    try {
      const tempFilePaths = await ImageHandler.chooseImages({
        count: remainingCount,
        showActionSheet: false // 直接显示选择界面
      });
      
      if (tempFilePaths && tempFilePaths.length > 0) {
        this.setData({
          selectedImages: [...this.data.selectedImages, ...tempFilePaths]
        });
      }
    } catch (error) {
      console.error('选择图片失败:', error);
      LoadingManager.showError('选择图片失败');
    }
  },

  /**
   * 删除选中的图片
   */
  removeImage(e) {
    const index = e.currentTarget.dataset.index;
    const selectedImages = this.data.selectedImages;
    selectedImages.splice(index, 1);
    this.setData({
      selectedImages: selectedImages
    });
  },

  /**
   * 压缩图片（如果超过1MB）
   * @deprecated 使用 ImageHandler.compressImage 替代
   * @param {string} imagePath - 图片路径
   * @returns {Promise<string>} - 压缩后的图片路径
   */
  async compressImageIfNeeded(imagePath) {
    try {
      // 使用统一的图片处理工具
      return await ImageHandler.compressImage(imagePath, 100 * 1024);
    } catch (error) {
      console.error('图片压缩失败:', error);
      // 压缩失败时返回原图片路径
      LoadingManager.showToast('图片压缩失败，使用原图');
      return imagePath;
    }
  },

  /**
   * 图片加载错误处理
   * 当本地缓存路径无效时，自动回退到云端URL
   */
  onImageLoadError(e) {
    const { momentIndex, imageIndex } = e.currentTarget.dataset;
    const moments = this.data.moments;
    
    if (moments[momentIndex] && moments[momentIndex].images[imageIndex]) {
      const image = moments[momentIndex].images[imageIndex];
      
      // 如果当前使用的是localPath且加载失败，回退到云端URL
      if (image.localPath && (image.cloudUrl || image.url)) {
        console.warn('本地图片加载失败，回退到云端URL:', image.localPath);
        
        // 清除失效的localPath，让模板回退到cloudUrl或url
        const updatePath = `moments[${momentIndex}].images[${imageIndex}].localPath`;
        this.setData({
          [updatePath]: null
        });
        
        // 从缓存中移除这个失效的本地路径记录
        const cacheKey = image.cloudUrl || image.url;
        if (cacheKey && this.data.imageCache.has(cacheKey)) {
          this.data.imageCache.delete(cacheKey);
          this.saveCacheData();
        }
      }
    }
  },

  /**
   * 预览图片
   */
  previewImage(e) {
    const current = e.currentTarget.dataset.current;
    const urls = e.currentTarget.dataset.urls;
    
    // 处理图片URL数组，确保格式正确
    const imageUrls = urls.map(img => {
      if (typeof img === 'string') {
        return img;
      } else if (img.cloudUrl) {
        return img.cloudUrl;  // 使用云端地址进行预览
      } else {
        return img.url || img;
      }
    });
    
    wx.previewImage({
      current: current,
      urls: imageUrls
    });
  },

  /**
   * 发布瞬间
   */
  async publishMoment() {
    const content = this.data.publishContent.trim();
    const images = this.data.selectedImages;
    
    // 强制要求用户必须选择图片才能发布
    if (images.length === 0) {
      LoadingManager.showToast('请至少选择一张图片', 'none');
      return;
    }
    
    // 检查是否有内容（可选，但建议有内容描述）
    if (!content) {
      LoadingManager.showModal({
        title: '提示',
        content: '您还没有添加文字描述，确定要发布吗？',
        success: (res) => {
          if (res.confirm) {
            // 用户确认发布，继续执行发布逻辑
            this.executePublish(content, images);
          }
        }
      });
      return;
    }
    
    // 如果有内容，直接执行发布
    this.executePublish(content, images);
  },

  /**
   * 执行发布瞬间的核心逻辑
   * @param {string} content - 发布内容
   * @param {Array} images - 选择的图片数组
   */
  async executePublish(content, images) {
    if (this.data.publishing) return;
    
    this.setData({ publishing: true });
    
    LoadingManager.showLoading('发布中...');
    
    try {
      const db = wx.cloud.database();
      const coupleId = this.data.coupleId;
      
      // 上传图片到云存储
      let uploadedImages = [];
      if (images.length > 0) {
        const uploadPromises = images.map(async (imagePath, index) => {
          // 压缩图片（如果超过1MB）
          const compressedPath = await this.compressImageIfNeeded(imagePath);
          
          const cloudPath = `moments/${coupleId}/${Date.now()}_${index}.jpg`;
          const result = await wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: compressedPath
          });
          return result.fileID;
        });
        
        uploadedImages = await Promise.all(uploadPromises);
      }
      
      // 保存瞬间到数据库，只存储用户openid，用户名和头像在显示时动态获取
      const userInfo = StorageManager.getStorage('userInfo');
      const momentData = {
        _id: Date.now().toString(), // 使用13位时间戳作为_id
        coupleId: this.data.coupleId,
        content: content,
        images: uploadedImages,
        timestamp: new Date(),
        likes: 0, // 修改为数字类型，支持$inc操作
        comments: [],
        _openid: userInfo?.openid
      };
      
      if (!momentData._openid) {
        LoadingManager.showToast('用户信息获取失败', 'error');
        return;
      }
      
      await db.collection('ld_moments').add({
        data: momentData
      });
      
      LoadingManager.hideLoading();
      LoadingManager.showToast('发布成功', 'success');
      
      // 隐藏发布模态框
      this.hidePublishModal();
      
      // 刷新瞬间列表（getMoments会自动处理图片缓存）
      await this.getMoments();
      
      // 不需要清除本地缓存，让智能缓存系统自动管理
      console.log('发布成功，瞬间列表已刷新');
      
    } catch (error) {
      console.error('发布瞬间失败:', error);
      LoadingManager.hideLoading();
      LoadingManager.showToast('发布失败，请重试', 'none');
    } finally {
      this.setData({ publishing: false });
    }
  },

  /**
   * 预览瞬间图片
   */
  previewMomentImage(e) {
    const current = e.currentTarget.dataset.src;
    const urls = e.currentTarget.dataset.urls;
    
    wx.previewImage({
      current: current,
      urls: urls
    });
  },

  /**
   * 点赞批量统计队列 - 用于收集10秒内的点赞操作
   * 格式: { momentId: { count: number, momentIndex: number } }
   */
  likeQueue: {},
  
  /**
   * 点赞批量提交定时器
   */
  likeBatchTimer: null,
  
  /**
   * 点赞 - 优化版本，批量统计减少数据库访问
   */
  async toggleLike(e) {
    const momentId = e.currentTarget.dataset.id;
    let momentIndex = e.currentTarget.dataset.index;
    
    if (!momentId) return;
    
    // 如果没有传递index，则查找对应的索引
    if (momentIndex === undefined) {
      momentIndex = this.data.moments.findIndex(moment => moment._id === momentId);
    }
    
    try {
      // 立即更新本地UI，提升用户体验
      const moments = this.data.moments;
      if (moments[momentIndex]) {
        moments[momentIndex].likes = (moments[momentIndex].likes || 0) + 1;
        moments[momentIndex].showHearts = true;
        this.setData({ moments });
        
        // 2秒后隐藏心形动画
        setTimeout(() => {
          if (moments[momentIndex]) {
            moments[momentIndex].showHearts = false;
            this.setData({ moments });
          }
        }, 2000);
      }
      
      // 添加到批量统计队列
      this.addToLikeQueue(momentId, momentIndex);
      
      // 更新本地缓存
      this.updateLocalCache(moments);
      
    } catch (error) {
      console.error('点赞失败:', error);
      LoadingManager.showToast('点赞失败', 'none');
    }
  },
  
  /**
   * 添加点赞到批量统计队列
   * @param {string} momentId - 动态ID
   * @param {number} momentIndex - 动态在数组中的索引
   */
  addToLikeQueue(momentId, momentIndex) {
    // 初始化或累加点赞数
    if (!this.likeQueue[momentId]) {
      this.likeQueue[momentId] = {
        count: 1,
        momentIndex: momentIndex
      };
    } else {
      this.likeQueue[momentId].count += 1;
    }
    
    console.log(`点赞队列更新: ${momentId} -> ${this.likeQueue[momentId].count}次`);
    
    // 如果没有定时器在运行，启动10秒批量提交定时器
    if (!this.likeBatchTimer) {
      this.likeBatchTimer = setTimeout(() => {
        this.batchSubmitLikes();
      }, 10000); // 10秒后批量提交
      
      console.log('启动点赞批量提交定时器，10秒后执行');
    }
  },
  
  /**
   * 批量提交点赞数据到云端数据库
   * 注意：微信小程序云开发不支持 db.batch()，使用循环逐个更新
   */
  async batchSubmitLikes() {
    if (Object.keys(this.likeQueue).length === 0) {
      console.log('点赞队列为空，跳过批量提交');
      this.likeBatchTimer = null;
      return;
    }
    
    console.log('开始批量提交点赞数据:', this.likeQueue);
    
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      let successCount = 0;
      let failCount = 0;
      
      // 遍历点赞队列，逐个更新每个动态
      for (const [momentId, likeData] of Object.entries(this.likeQueue)) {
        try {
          // 先检查文档的likes字段类型
          const doc = await db.collection('ld_moments').doc(momentId).get();
          const currentLikes = doc.data.likes;
          
          let updateResult;
          if (Array.isArray(currentLikes)) {
            // 如果是数组类型，直接设置为累计数量
            updateResult = await db.collection('ld_moments').doc(momentId).update({
              data: {
                likes: likeData.count
              }
            });
          } else {
            // 如果是数字类型，使用原子操作递增
            updateResult = await db.collection('ld_moments').doc(momentId).update({
              data: {
                likes: _.inc(likeData.count)
              }
            });
          }
          
          if (updateResult.stats.updated > 0) {
            successCount++;
            console.log(`点赞更新成功: ${momentId} +${likeData.count}`);
          } else {
            failCount++;
            console.warn(`点赞更新失败: ${momentId} - 未找到文档或无权限`);
          }
          
        } catch (docError) {
          failCount++;
          console.error(`点赞更新失败 ${momentId}:`, docError);
          
          // 如果获取文档失败，尝试使用默认inc操作
          try {
            const fallbackResult = await db.collection('ld_moments').doc(momentId).update({
              data: {
                likes: _.inc(likeData.count)
              }
            });
            
            if (fallbackResult.stats.updated > 0) {
              successCount++;
              failCount--; // 回退失败计数
              console.log(`点赞更新成功(fallback): ${momentId} +${likeData.count}`);
            }
          } catch (fallbackError) {
            console.error(`点赞fallback更新也失败 ${momentId}:`, fallbackError);
          }
        }
      }
      
      console.log(`批量点赞提交完成: 成功${successCount}个, 失败${failCount}个`);
      
      // 根据成功失败情况显示不同提示
      if (successCount > 0) {
        
      } else {
        // 全部失败，回滚本地UI状态
        this.rollbackLocalLikes();
        LoadingManager.showToast('点赞同步失败', 'none');
      }
      
    } catch (error) {
      console.error('批量点赞提交异常:', error);
      
      // 提交失败时，回滚本地UI状态
      this.rollbackLocalLikes();
      
      LoadingManager.showToast('点赞同步失败', 'none');
    } finally {
      // 清空队列和定时器
      this.likeQueue = {};
      this.likeBatchTimer = null;
      console.log('点赞队列已清空，定时器已重置');
    }
  },
  
  /**
   * 回滚本地点赞状态（当批量提交失败时）
   */
  rollbackLocalLikes() {
    try {
      const moments = this.data.moments;
      
      // 遍历失败的点赞队列，回滚本地状态
      for (const [momentId, likeData] of Object.entries(this.likeQueue)) {
        const moment = moments.find(m => m._id === momentId);
        if (moment) {
          moment.likes = Math.max(0, (moment.likes || 0) - likeData.count);
          console.log(`回滚点赞: ${momentId} -${likeData.count}`);
        }
      }
      
      this.setData({ moments });
      this.updateLocalCache(moments);
      
    } catch (error) {
      console.error('回滚本地点赞状态失败:', error);
    }
  },

  /**
   * 显示评论输入框
   */
  showCommentInput(e) {
    const momentId = e.currentTarget.dataset.id;
    this.setData({
      showCommentModal: true,
      currentCommentMomentId: momentId,
      commentText: ''
    });
  },

  /**
   * 显示评论模态框
   */
  showCommentModal(e) {
    const momentId = e.currentTarget.dataset.id;
    this.setData({
      showCommentModal: true,
      currentCommentMomentId: momentId,
      commentText: ''
    });
  },

  /**
   * 隐藏评论模态框
   */
  hideCommentModal() {
    this.setData({
      showCommentModal: false,
      currentCommentMomentId: '',
      commentText: ''
    });
  },

  /**
   * 输入评论内容
   */
  onCommentInput(e) {
    this.setData({
      commentText: e.detail.value
    });
  },

  /**
   * 提交评论（wxml中调用的方法）
   */
  async submitComment() {
    await this.publishComment();
  },

  /**
   * 发布评论
   */
  async publishComment() {
    const commentText = this.data.commentText.trim();
    const momentId = this.data.currentCommentMomentId;
    
    if (!commentText) {
      LoadingManager.showToast('请输入评论内容', 'none');
      return;
    }
    
    if (!momentId) {
      LoadingManager.showToast('评论失败', 'none');
      return;
    }
    
    LoadingManager.showLoading('发布中...');
    
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 评论只存储内容、时间戳和用户openid，用户名和头像在显示时动态获取
      const userInfo = StorageManager.getStorage('userInfo');
      const comment = {
        content: commentText,
        timestamp: new Date(),
        _openid: userInfo?.openid
      };
      
      if (!comment._openid) {
        LoadingManager.showToast('用户信息获取失败', 'error');
        return;
      }
      
      // 更新数据库中的评论
      await db.collection('ld_moments').doc(momentId).update({
        data: {
          comments: _.push(comment)
        }
      });
      
      LoadingManager.hideLoading();
      LoadingManager.showToast('评论成功', 'success');
      
      // 隐藏评论模态框
      this.hideCommentModal();
      
      // 刷新瞬间列表
      await this.getMoments();
      
    } catch (error) {
      console.error('发布评论失败:', error);
      LoadingManager.hideLoading();
      LoadingManager.showToast('评论失败，请重试', 'none');
    }
  },

  /**
   * 删除瞬间
   */
  async deleteMoment(e) {
    console.log('deleteMoment 函数被调用', e);
    const momentId = e.currentTarget.dataset.id;
    let momentIndex = e.currentTarget.dataset.index;
    
    console.log('momentId:', momentId, 'momentIndex:', momentIndex);
    
    if (!momentId) {
      console.log('momentId 为空，退出函数');
      return;
    }
    
    // 如果没有传递index，则查找对应的索引
    if (momentIndex === undefined) {
      momentIndex = this.data.moments.findIndex(moment => moment._id === momentId);
      console.log('重新查找的 momentIndex:', momentIndex);
    }
    
    console.log('准备显示确认删除对话框');
    const result = await LoadingManager.showModal({
      title: '确认删除',
      content: '确定要删除这条瞬间吗？'
    });
    
    console.log('用户确认结果:', result);
    if (!result) {
      console.log('用户取消删除，退出函数');
      return;
    }
    
    LoadingManager.showLoading('删除中...');
    
    try {
      const db = wx.cloud.database();
      
      // 获取要删除的瞬间数据，用于删除关联的云端图片
      const momentToDelete = this.data.moments[momentIndex];
      console.log('要删除的瞬间数据:', momentToDelete);
      // 删除云端存储的图片
      const cloudImages = momentToDelete.cloudImages || momentToDelete.images;
      if (momentToDelete && cloudImages && cloudImages.length > 0) {
        try {
          // 如果是新格式，使用cloudImages；如果是旧格式，从images中提取cloudUrl
          let fileIDs = [];
          if (momentToDelete.cloudImages) {
            fileIDs = momentToDelete.cloudImages;
          } else if (Array.isArray(momentToDelete.images) && momentToDelete.images[0] && typeof momentToDelete.images[0] === 'object') {
            fileIDs = momentToDelete.images.map(img => img.cloudUrl);
          } else {
            fileIDs = momentToDelete.images;
          }
          
          const deletePromises = fileIDs.map(fileID => {
            return wx.cloud.deleteFile({
              fileList: [fileID]
            });
          });
          await Promise.all(deletePromises);
          console.log('云端图片删除成功');
        } catch (imageDeleteError) {
          console.error('删除云端图片失败:', imageDeleteError);
          // 图片删除失败不阻止瞬间删除，继续执行
        }
      }
      
      // 删除数据库中的瞬间
      await db.collection('ld_moments').doc(momentId).remove();
      
      // 删除相关的本地缓存图片
      if (momentToDelete && (momentToDelete.images || momentToDelete.cloudImages)) {
        try {
          // 获取需要删除的云端fileID列表
          let fileIDs = [];
          if (momentToDelete.cloudImages) {
            fileIDs = momentToDelete.cloudImages;
          } else if (Array.isArray(momentToDelete.images) && momentToDelete.images[0] && typeof momentToDelete.images[0] === 'object') {
            fileIDs = momentToDelete.images.map(img => img.cloudUrl);
          } else if (momentToDelete.images) {
            fileIDs = momentToDelete.images;
          }
          
          // 使用新的智能缓存系统删除缓存项
          const deletePromises = fileIDs.map(async (fileID) => {
            try {
              await this.removeCacheItemOnly(fileID);
            } catch (error) {
              console.warn('删除缓存项失败:', fileID, error);
            }
          });
          
          await Promise.allSettled(deletePromises);
          console.log(`删除了${fileIDs.length}个相关缓存图片`);
        } catch (localCacheError) {
          console.error('清理本地缓存图片失败:', localCacheError);
        }
      }
      
      // 删除本地数据
      const moments = this.data.moments;
      moments.splice(momentIndex, 1);
      this.setData({ moments });
      
      // 更新本地缓存
      this.updateLocalCache(moments);
      
      LoadingManager.hideLoading();
      LoadingManager.showToast('删除成功', 'success');
      
    } catch (error) {
      console.error('删除瞬间失败:', error);
      LoadingManager.hideLoading();
      LoadingManager.showToast('删除失败，请重试', 'none');
    }
  },

  /**
   * 格式化时间
   */
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    
    if (diff < minute) {
      return '刚刚';
    } else if (diff < hour) {
      return Math.floor(diff / minute) + '分钟前';
    } else if (diff < day) {
      return Math.floor(diff / hour) + '小时前';
    } else if (diff < 7 * day) {
      return Math.floor(diff / day) + '天前';
    } else {
      return date.toLocaleDateString();
    }
  },

  /**
   * 手动清理缓存 - 提供给用户的接口
   */
  async manualCacheCleanup() {
    LoadingManager.showModal({
      title: '缓存清理',
      content: '选择清理方式：\n智能清理 - 清理7天未访问的图片\n强制清理 - 清理所有缓存图片',
      confirmText: '智能清理',
      cancelText: '强制清理',
      success: async (res) => {
        LoadingManager.showLoading('清理中...');
        
        try {
          const result = await this.clearImageCache({ 
            force: !res.confirm,
            showToast: false 
          });
          
          LoadingManager.hideLoading();
          LoadingManager.showModal({
            title: '清理完成',
            content: `清理了${result.cleanedCount}个文件\n释放空间：${result.cleanedSize}\n剩余：${result.remainingCount}个文件(${result.remainingSize})`,
            showCancel: false
          });
        } catch (error) {
          LoadingManager.hideLoading();
          LoadingManager.showToast('清理失败', 'error');
        }
      }
    });
  },

  /**
   * 查看缓存状态
   */
  showCacheStatus() {
    const stats = this.getCacheStats();
    
    LoadingManager.showModal({
      title: '缓存状态',
      content: `已用空间：${stats.formattedTotalSize} / ${stats.formattedMaxSize}\n使用率：${stats.usagePercent}\n图片数量：${stats.imageCount}个\n上次清理：${stats.lastCleanup}`,
      confirmText: '清理缓存',
      cancelText: '关闭',
      success: (res) => {
        if (res.confirm) {
          this.manualCacheCleanup();
        }
      }
    });
  },

  /**
   * 预加载关键图片 - 在网络良好时预加载最新的图片
   */
  async preloadRecentImages() {
    try {
      const moments = this.data.moments.slice(0, pageSize); // 只预加载最新5条
      const preloadPromises = [];
      
      moments.forEach(moment => {
        if (moment.images && moment.images.length > 0) {
          moment.images.forEach(img => {
            // fileID 是云存储中图片文件的唯一标识符，用于从云存储中获取图片。
            // 例如: cloud://love-diary-xxxxx.xxxx-xxxx/moments/image_123456.jpg
            const fileID = typeof img === 'string' ? img : img.cloudUrl;
            if (fileID && !this.data.imageCache.has(fileID)) {
              preloadPromises.push(
                this.smartImageCache(fileID).catch(error => {
                  console.warn('预加载图片失败:', fileID, error);
                })
              );
            }
          });
        }
      });
      
      if (preloadPromises.length > 0) {
        console.log(`开始预加载${preloadPromises.length}张图片`);
        await Promise.allSettled(preloadPromises);
        console.log('图片预加载完成');
      }
    } catch (error) {
      console.error('预加载图片失败:', error);
    }
  },


});
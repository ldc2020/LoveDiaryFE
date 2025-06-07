// 云开发已在app.js中初始化，这里不需要重复初始化
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
    isRefreshing: false // 刷新状态
  },

  onLoad() {
    // 检查绑定状态
    const coupleId = wx.getStorageSync('coupleId');
    const bindStatus = wx.getStorageSync('bindStatus');
    
    if (!coupleId || bindStatus !== 'bound') {
      // 未绑定，跳转到绑定页面
      wx.reLaunch({
        url: '/pages/bind/bind'
      });
      return;
    }

    this.setData({
      coupleId: coupleId
    });

    // 加载背景图片
    const cachedBackgroundImage = wx.getStorageSync('showbackgroundImage');
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
      wx.reLaunch({
        url: '/pages/bind/bind'
      });
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
    // 页面显示时刷新数据
    if (this.data.coupleId) {
      this.getMoments();
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
      
      wx.showToast({
        title: '刷新成功',
        icon: 'success',
        duration: 1500
      });
    } catch (error) {
      console.error('刷新失败:', error);
      wx.showToast({
        title: '刷新失败',
        icon: 'none',
        duration: 1500
      });
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
      wx.showToast({
        title: '最多只能选择9张图片',
        icon: 'none'
      });
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
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 获取用户信息
   */
  getUserInfo() {
    return new Promise((resolve, reject) => {
      // 先尝试从缓存获取
      const cachedUserInfo = wx.getStorageSync('userInfo');
      if (cachedUserInfo) {
        resolve(cachedUserInfo);
        return;
      }

      // 如果缓存中没有，则从云数据库获取
      const db = wx.cloud.database();
      const openid = wx.getStorageSync('openid');
      
      if (!openid) {
        reject(new Error('未找到openid'));
        return;
      }

      db.collection('ld_user_info').where({
        _openid: openid
      }).get().then(res => {
        if (res.data.length > 0) {
          const userInfo = res.data[0];
          wx.setStorageSync('userInfo', userInfo);
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
    const cachedCoupleId = wx.getStorageSync('coupleId');
    if (cachedCoupleId) {
      return cachedCoupleId;
    }
    
    // 如果缓存中没有，可以从用户信息中获取
    const userInfo = this.data.userInfo;
    if (userInfo && userInfo.coupleId) {
      wx.setStorageSync('coupleId', userInfo.coupleId);
      return userInfo.coupleId;
    }
    
    return null;
  },

  /**
   * 获取情侣信息
   */
  getPartnerInfo() {
    return new Promise((resolve, reject) => {
      // 先尝试从缓存获取
      const cachedPartnerInfo = wx.getStorageSync('partnerInfo');
      if (cachedPartnerInfo) {
        resolve(cachedPartnerInfo);
        return;
      }
      console.log('获取情侣信息'+partnerId);
      // 如果缓存中没有，则从云数据库获取
      const db = wx.cloud.database();
      const partnerId = wx.getStorageSync('partnerId');
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
          const partnerInfo = {
            nickName: res.data[0].nickName,
            avatarUrl: res.data[0].avatarUrl
          };
          wx.setStorageSync('partnerInfo', partnerInfo);
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
    if (this.data.loading && !isLoadMore) return;
    if (isLoadMore && (this.data.loadingMore || !this.data.hasMore)) return;
    
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
          const hasNewData = this.checkForNewMoments(result.data, cachedMoments);
          
          if (hasNewData) {
            // 只有在有新数据时才缓存图片和更新本地缓存
            console.log('检测到新数据，开始缓存图片并更新本地缓存');
            // 图片落盘并返回信息供下面的updateLocalCache更新缓存
            momentsWithCachedImages = await this.cacheMomentImages(momentsWithAvatars);
            // 更新本地缓存 - 使用缓存后的数据
            this.updateLocalCache(momentsWithCachedImages);
          } else {
            // 没有新数据，使用本地缓存的图片路径
            console.log('没有新数据，使用本地缓存的图片路径');
            momentsWithCachedImages = this.applyLocalImageCache(momentsWithAvatars);
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
        wx.showToast({
          title: '加载更多失败',
          icon: 'none'
        });
      } else {
        // 如果云端获取失败，使用缓存数据
        const cachedMoments = this.getLocalCachedMoments();
        this.setData({
          moments: cachedMoments,
          loading: false
        });
        
        wx.showToast({
          title: '加载失败，显示缓存数据',
          icon: 'none'
        });
      }
    }
  },

  /**
   * 获取本地缓存的瞬间
   */
  getLocalCachedMoments() {
    try {
      const cacheKey = `coupleMoments_${this.data.coupleId}`;
      const cachedData = wx.getStorageSync(cacheKey) || [];
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
        console.log('--本地没有缓存数据，需要从云端下载图片');
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
        return true;
      }
      
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
      // 获取当前用户和情侣的最新信息
      const userInfo = wx.getStorageSync('userInfo');
      const currentOpenid = userInfo?.openid;
      const partnerId = wx.getStorageSync('partnerId');
      
      if (!currentOpenid) {
        console.error('未找到当前用户openid');
        return moments;
      }
      
      // 从数据库获取最新的用户信息
      const db = wx.cloud.database();
      const userInfos = await db.collection('ld_user_info').where({
        openid: db.command.in([currentOpenid, partnerId])
      }).get();
      
      // 创建用户信息映射，使用本地存储的头像信息
      const userMap = {};
      
      // 获取本地存储的用户头像信息
      const localUserInfo = wx.getStorageSync('userInfo');
      const partnerInfo = wx.getStorageSync('partnerInfo');
      
      for (const user of userInfos.data) {
        let avatarUrl = './images/default-avatar.png';
        
        // 如果是当前用户，使用本地存储的头像
        if (user.openid === currentOpenid && localUserInfo?.localAvatarPath) {
          avatarUrl = localUserInfo.localAvatarPath;
        }
        // 如果是伴侣，使用本地存储的伴侣头像
        else if (user.openid === partnerId && partnerInfo?.avatarUrl) {
          avatarUrl = partnerInfo.avatarUrl;
        }
        
        userMap[user.openid] = {
          avatar: avatarUrl,
          name: user.nickName || (user.openid === currentOpenid ? '我' : 'TA')
        };
      }
      
      // 为每个瞬间添加用户信息，并处理评论
      return moments.map(moment => {
        const userInfo = userMap[moment._openid];
        
        // 处理评论，为每个评论添加最新的用户信息
        const commentsWithUserInfo = (moment.comments || []).map(comment => {
          const commentUserInfo = userMap[comment._openid];
          return {
            ...comment,
            userAvatar: commentUserInfo?.avatar || './images/default-avatar.png',
            userName: commentUserInfo?.name || '未知用户'
          };
        });
        
        return {
          ...moment,
          userAvatar: userInfo?.avatar || './images/default-avatar.png',
          userName: userInfo?.name || '未知用户',
          comments: commentsWithUserInfo
        };
      });
    } catch (error) {
      console.error('添加用户头像失败:', error);
      return moments.map(moment => ({
        ...moment,
        userAvatar: './images/default-avatar.png',
        userName: '未知用户'
      }));
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
      const savedStats = wx.getStorageSync(cacheStatsKey) || {
        totalSize: 0,
        imageCount: 0,
        lastCleanup: 0
      };
      
      // 加载图片缓存映射
      const imageCacheKey = `imageCache_${this.data.coupleId}`;
      const savedImageCache = wx.getStorageSync(imageCacheKey) || {};
      
      // 转换为Map对象
      const imageCache = new Map(Object.entries(savedImageCache));
      
      this.setData({
        cacheStats: savedStats,
        imageCache: imageCache
      });
      
      // 检查是否需要清理缓存（每1分钟检查一次 - 测试模式）
      const now = Date.now();
      // if (now - savedStats.lastCleanup > 1 * 24 * 60 * 60 * 1000) {
        if (now - savedStats.lastCleanup > 1 * 60 * 1000) {

        console.log('开始定时清理缓存 - 测试模式（1分钟间隔）');
        await this.smartCacheCleanup();
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
   *  先看是否已经缓存，如果有直接返回
   *  如果没有，看加上这个fileID后是否超过内存大小，
   *  如果超过找到最近最少使用的图片移除(循环移除直到内存够用)
   *  移除完后添加新来的图片到磁盘，并更新缓存
   * 其他逻辑：
   *  1. 当图片被添加到缓存时，更新访问时间和大小。（新数据）
   *  2. 当图片被访问时，更新访问时间。（旧数据）

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
        console.log('图片已缓存,无需下载');
        // 更新访问时间
        cacheItem.lastAccess = now;
        imageCache.set(fileID, cacheItem);
        this.saveCacheData();
        return cacheItem.localPath;
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
      const cacheItem = {
        localPath: savedResult.savedFilePath,
        size: fileSize,
        lastAccess: now,
        downloadTime: now
      };
      
      imageCache.set(fileID, cacheItem);
      
      // 更新统计信息
      const cacheStats = this.data.cacheStats;
      cacheStats.totalSize += fileSize;
      cacheStats.imageCount += 1;
      
      this.setData({ imageCache, cacheStats });
      this.saveCacheData();
      
      return savedResult.savedFilePath;
    } catch (error) {
      console.error('智能图片缓存失败:', error);
      return fileID;
    }
  },

  /**
   * 确保缓存空间足够
   * 逻辑：
   * 1. 如果当前大小加上需要的大小超过限制，则清理缓存
   * 2. 找到最久未访问的图片
   * 3. 清理最久未访问的图片
   * 4. 重复1-3，直到当前大小加上需要的大小小于限制
   * @param {number} requiredSize - 需要的空间大小
   * @returns {Promise<void>}
   */
  async ensureCacheSpace(requiredSize) {
    const { maxImageCacheSize, cacheStats, imageCache } = this.data;
    
    // 如果当前大小加上需要的大小超过限制，则清理缓存
    while (cacheStats.totalSize + requiredSize > maxImageCacheSize && imageCache.size > 0) {
      // 找到最久未访问的图片
      let oldestFileID = null;
      let oldestTime = Date.now();
      
      for (const [fileID, cacheItem] of imageCache.entries()) {
        if (cacheItem.lastAccess < oldestTime) {
          oldestTime = cacheItem.lastAccess;
          oldestFileID = fileID;
        }
      }
      
      if (oldestFileID) {
        await this.removeCacheItem(oldestFileID);
      } else {
        break;
      }
    }
  },

  /**
   * 移除缓存项
   */
  async removeCacheItem(fileID) {
    const { imageCache, cacheStats } = this.data;
    const cacheItem = imageCache.get(fileID);
    console.log(`cacheItem.localPath: `+cacheItem.localPath);
    if (cacheItem) {
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
      imageCache.delete(fileID);
      
      this.setData({ imageCache, cacheStats });
      console.log(`移除缓存项: ${fileID}, 释放空间: ${this.formatFileSize(cacheItem.size)}`);
    }
  },

  /**
   * 智能缓存清理
   */
  async smartCacheCleanup() {
    const { imageCache, cacheStats } = this.data;
    const now = Date.now();
    // const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 1 * 60 * 1000;
    let cleanedCount = 0;
    let cleanedSize = 0;
    
    console.log('开始智能缓存清理，当前缓存项数量:', imageCache.size);
    
    // 清理7天未访问的图片
    for (const [fileID, cacheItem] of imageCache.entries()) {
      if (cacheItem.lastAccess < sevenDaysAgo) {
        cleanedSize += cacheItem.size;
        cleanedCount++;
        await this.removeCacheItem(fileID); 
      }
    }
    
    // 更新清理时间
    cacheStats.lastCleanup = now;
    this.setData({ cacheStats });
    this.saveCacheData();
    
    console.log(`智能清理完成: 清理了${cleanedCount}个文件, 释放${this.formatFileSize(cleanedSize)}空间, 剩余缓存项: ${imageCache.size}`);
    
    if (cleanedCount > 0) {
      console.log(`智能清理完成: 清理了${cleanedCount}个文件, 释放${this.formatFileSize(cleanedSize)}空间`);
    } else {
      console.log('智能清理完成: 没有需要清理的缓存项');
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
      
      wx.setStorageSync(`imageCache_${coupleId}`, imageCacheObj);
      wx.setStorageSync(`cacheStats_${coupleId}`, cacheStats);
    } catch (error) {
      console.error('保存缓存数据失败:', error);
    }
  },

  /**
   * 获取缓存的图片路径
   */
  getCachedImagePath(fileID) {
    const cacheItem = this.data.imageCache.get(fileID);
    // 当删除本地缓存，fileId会变成云端地址
    if (cacheItem) {
      // 更新访问时间
      cacheItem.lastAccess = Date.now();
      this.data.imageCache.set(fileID, cacheItem);
      return cacheItem.localPath;
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
      const currentCacheData = wx.getStorageSync(cacheKey) || [];
      
      // 智能缓存：只保存最新的50条数据，减少存储占用
      const cacheData = moments.slice(0, 50).map(moment => ({
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
      this.cleanupOrphanedImages(currentCacheData, cacheData);
      
      wx.setStorageSync(cacheKey, cacheData);
    } catch (error) {
      console.error('更新本地缓存失败:', error);
    }
  },

  /**
   * 清理孤儿图片文件
   * @param {Array} oldCacheData - 旧的缓存数据
   * @param {Array} newCacheData - 新的缓存数据
   */
  async cleanupOrphanedImages(oldCacheData, newCacheData) {
    try {
      // 收集新缓存中所有的图片fileID
      const newImageIds = new Set();
      newCacheData.forEach(moment => {
        if (moment.images && Array.isArray(moment.images)) {
          moment.images.forEach(img => {
            if (typeof img === 'object' && img.cloudUrl) {
              newImageIds.add(img.cloudUrl);
            } else if (typeof img === 'string') {
              newImageIds.add(img);
            }
          });
        }
      });
      
      // 收集旧缓存中被移除的图片fileID
      const orphanedImageIds = [];
      oldCacheData.forEach(moment => {
        if (moment.images && Array.isArray(moment.images)) {
          moment.images.forEach(img => {
            let fileID = null;
            if (typeof img === 'object' && img.cloudUrl) {
              fileID = img.cloudUrl;
            } else if (typeof img === 'string') {
              fileID = img;
            }
            
            // 如果旧缓存中的图片不在新缓存中，标记为孤儿文件
            if (fileID && !newImageIds.has(fileID)) {
              orphanedImageIds.push(fileID);
            }
          });
        }
      });
      
      // 清理孤儿图片文件
      if (orphanedImageIds.length > 0) {
        console.log(`发现${orphanedImageIds.length}个孤儿图片文件，开始清理...`);
        
        for (const fileID of orphanedImageIds) {
          await this.removeCacheItem(fileID);
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
        await this.removeCacheItem(fileID);
      }
    } else {
      // 智能清理：清理超过7天未访问的图片
      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      
      for (const [fileID, cacheItem] of imageCache.entries()) {
        if (cacheItem.lastAccess < sevenDaysAgo) {
          cleanedSize += cacheItem.size;
          cleanedCount++;
          await this.removeCacheItem(fileID);
        }
      }
    }
    
    // 更新清理时间
    cacheStats.lastCleanup = Date.now();
    this.setData({ cacheStats });
    this.saveCacheData();
    
    if (showToast) {
      wx.showToast({
        title: force ? 
          `强制清理完成\n清理${cleanedCount}个文件` : 
          `智能清理完成\n清理${cleanedCount}个文件`,
        icon: 'success',
        duration: 2000
      });
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
   */
  chooseImages() {
    const maxImages = 9;
    const currentCount = this.data.selectedImages.length;
    const remainingCount = maxImages - currentCount;
    
    if (remainingCount <= 0) {
      wx.showToast({
        title: `最多只能选择${maxImages}张图片`,
        icon: 'none'
      });
      return;
    }
    
    wx.chooseMedia({
      count: remainingCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = res.tempFiles.map(file => file.tempFilePath);
        this.setData({
          selectedImages: [...this.data.selectedImages, ...newImages]
        });
      },
      fail: (error) => {
        console.error('选择图片失败:', error);
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        });
      }
    });
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
   * @param {string} imagePath - 图片路径
   * @returns {Promise<string>} - 压缩后的图片路径
   */
  async compressImageIfNeeded(imagePath) {
    try {
      // 获取图片信息
      const imageInfo = await new Promise((resolve, reject) => {
        wx.getImageInfo({
          src: imagePath,
          success: resolve,
          fail: reject
        });
      });

      // 获取文件信息
       const fileInfo = await new Promise((resolve, reject) => {
         wx.getFileSystemManager().getFileInfo({
           filePath: imagePath,
           success: resolve,
           fail: reject
         });
       });

      const fileSizeInMB = fileInfo.size / (1024 * 1024);
      console.log(`图片大小: ${fileSizeInMB.toFixed(2)}MB`);

      // 如果图片小于等于1MB，直接返回原路径
      if (fileSizeInMB <= 1) {
        console.log('图片大小符合要求，无需压缩');
        return imagePath;
      }

      console.log('图片超过1MB，开始压缩...');

      // 计算压缩质量，目标是压缩到1MB以下
      // 压缩质量范围：0.1 - 0.9
      let quality = Math.max(0.1, Math.min(0.9, 1 / fileSizeInMB));
      
      // 如果图片很大，进一步降低质量
      if (fileSizeInMB > 5) {
        quality = Math.max(0.1, quality * 0.6);
      } else if (fileSizeInMB > 3) {
        quality = Math.max(0.1, quality * 0.8);
      }

      console.log(`使用压缩质量: ${quality}`);

      // 压缩图片
      const compressResult = await new Promise((resolve, reject) => {
        wx.compressImage({
          src: imagePath,
          quality: Math.round(quality * 100), // 微信API需要0-100的整数
          success: resolve,
          fail: reject
        });
      });

      // 检查压缩后的文件大小
       const compressedFileInfo = await new Promise((resolve, reject) => {
         wx.getFileSystemManager().getFileInfo({
           filePath: compressResult.tempFilePath,
           success: resolve,
           fail: reject
         });
       });

      const compressedSizeInMB = compressedFileInfo.size / (1024 * 1024);
      console.log(`压缩后大小: ${compressedSizeInMB.toFixed(2)}MB`);

      // 如果压缩后仍然超过1MB，进行二次压缩
      if (compressedSizeInMB > 1 && quality > 0.1) {
        console.log('进行二次压缩...');
        const secondQuality = Math.max(0.1, quality * 0.5);
        
        const secondCompressResult = await new Promise((resolve, reject) => {
          wx.compressImage({
            src: compressResult.tempFilePath,
            quality: Math.round(secondQuality * 100),
            success: resolve,
            fail: reject
          });
        });

        const finalFileInfo = await new Promise((resolve, reject) => {
           wx.getFileSystemManager().getFileInfo({
             filePath: secondCompressResult.tempFilePath,
             success: resolve,
             fail: reject
           });
         });

        const finalSizeInMB = finalFileInfo.size / (1024 * 1024);
        console.log(`二次压缩后大小: ${finalSizeInMB.toFixed(2)}MB`);

        return secondCompressResult.tempFilePath;
      }

      return compressResult.tempFilePath;

    } catch (error) {
      console.error('图片压缩失败:', error);
      // 压缩失败时返回原图片路径
      wx.showToast({
        title: '图片压缩失败，使用原图',
        icon: 'none',
        duration: 2000
      });
      return imagePath;
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
    
    if (!content && images.length === 0) {
      wx.showToast({
        title: '请输入内容或选择图片',
        icon: 'none'
      });
      return;
    }
    
    if (this.data.publishing) return;
    
    this.setData({ publishing: true });
    
    wx.showLoading({
      title: '发布中...'
    });
    
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
      const userInfo = wx.getStorageSync('userInfo');
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
        wx.showToast({ title: '用户信息获取失败', icon: 'error' });
        return;
      }
      
      await db.collection('ld_moments').add({
        data: momentData
      });
      
      wx.hideLoading();
      wx.showToast({
        title: '发布成功',
        icon: 'success'
      });
      
      // 隐藏发布模态框
      this.hidePublishModal();
      
      // 刷新瞬间列表（getMoments会自动处理图片缓存）
      await this.getMoments();
      
      // 不需要清除本地缓存，让智能缓存系统自动管理
      console.log('发布成功，瞬间列表已刷新');
      
    } catch (error) {
      console.error('发布瞬间失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '发布失败，请重试',
        icon: 'none'
      });
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
   * 点赞
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
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 先获取当前文档，检查likes字段类型
      const doc = await db.collection('ld_moments').doc(momentId).get();
      const currentLikes = doc.data.likes;
      
      // 如果likes是数组类型，先重置为0，然后再增加1
      if (Array.isArray(currentLikes)) {
        await db.collection('ld_moments').doc(momentId).update({
          data: {
            likes: 1 // 直接设置为1
          }
        });
      } else {
        // 如果likes是数字类型，正常使用$inc操作
        await db.collection('ld_moments').doc(momentId).update({
          data: {
            likes: _.inc(1)
          }
        });
      }
      
      // 立即更新本地数据
      const moments = this.data.moments;
      if (moments[momentIndex]) {
        // 如果原来是数组类型，重置为1；否则正常加1
        if (Array.isArray(moments[momentIndex].likes)) {
          moments[momentIndex].likes = 1;
        } else {
          moments[momentIndex].likes = (moments[momentIndex].likes || 0) + 1;
        }
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
      
      // 更新本地缓存
      this.updateLocalCache(moments);
      
    } catch (error) {
      console.error('点赞失败:', error);
      wx.showToast({
        title: '点赞失败',
        icon: 'none'
      });
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
      wx.showToast({
        title: '请输入评论内容',
        icon: 'none'
      });
      return;
    }
    
    if (!momentId) {
      wx.showToast({
        title: '评论失败',
        icon: 'none'
      });
      return;
    }
    
    wx.showLoading({
      title: '发布中...'
    });
    
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 评论只存储内容、时间戳和用户openid，用户名和头像在显示时动态获取
      const userInfo = wx.getStorageSync('userInfo');
      const comment = {
        content: commentText,
        timestamp: new Date(),
        _openid: userInfo?.openid
      };
      
      if (!comment._openid) {
        wx.showToast({ title: '用户信息获取失败', icon: 'error' });
        return;
      }
      
      // 更新数据库中的评论
      await db.collection('ld_moments').doc(momentId).update({
        data: {
          comments: _.push(comment)
        }
      });
      
      wx.hideLoading();
      wx.showToast({
        title: '评论成功',
        icon: 'success'
      });
      
      // 隐藏评论模态框
      this.hideCommentModal();
      
      // 刷新瞬间列表
      await this.getMoments();
      
    } catch (error) {
      console.error('发布评论失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '评论失败，请重试',
        icon: 'none'
      });
    }
  },

  /**
   * 删除瞬间
   */
  async deleteMoment(e) {
    const momentId = e.currentTarget.dataset.id;
    let momentIndex = e.currentTarget.dataset.index;
    
    if (!momentId) return;
    
    // 如果没有传递index，则查找对应的索引
    if (momentIndex === undefined) {
      momentIndex = this.data.moments.findIndex(moment => moment._id === momentId);
    }
    
    const result = await new Promise((resolve) => {
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这条瞬间吗？',
        success: (res) => {
          resolve(res.confirm);
        }
      });
    });
    
    if (!result) return;
    
    wx.showLoading({
      title: '删除中...'
    });
    
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
              await this.removeCacheItem(fileID);
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
      
      wx.hideLoading();
      wx.showToast({
        title: '删除成功',
        icon: 'success'
      });
      
    } catch (error) {
      console.error('删除瞬间失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '删除失败，请重试',
        icon: 'none'
      });
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
    wx.showModal({
      title: '缓存清理',
      content: '选择清理方式：\n智能清理 - 清理7天未访问的图片\n强制清理 - 清理所有缓存图片',
      confirmText: '智能清理',
      cancelText: '强制清理',
      success: async (res) => {
        wx.showLoading({ title: '清理中...' });
        
        try {
          const result = await this.clearImageCache({ 
            force: !res.confirm,
            showToast: false 
          });
          
          wx.hideLoading();
          wx.showModal({
            title: '清理完成',
            content: `清理了${result.cleanedCount}个文件\n释放空间：${result.cleanedSize}\n剩余：${result.remainingCount}个文件(${result.remainingSize})`,
            showCancel: false
          });
        } catch (error) {
          wx.hideLoading();
          wx.showToast({
            title: '清理失败',
            icon: 'error'
          });
        }
      }
    });
  },

  /**
   * 查看缓存状态
   */
  showCacheStatus() {
    const stats = this.getCacheStats();
    
    wx.showModal({
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
      const moments = this.data.moments.slice(0, 5); // 只预加载最新5条
      const preloadPromises = [];
      
      moments.forEach(moment => {
        if (moment.images && moment.images.length > 0) {
          moment.images.forEach(img => {
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
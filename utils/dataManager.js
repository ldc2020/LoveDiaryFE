/**
 * 通用数据管理模板
 * 提供存储、刷新、懒加载、智能清理功能
 * 供情侣计划的所有页面复用
 * 
 * 功能特性：
 * 1. 发布内容：存储到缓存+落盘+上传云端
 * 2. 刷新：对比远程最新数据和本地缓存，增量更新
 * 3. 懒加载：每次加载指定条数的数据
 * 4. 智能清理：定期清理过期缓存数据
 * 
 * 使用方法：
 * const dataManager = new DataManager({
 *   collectionName: 'ld_travel_plans',
 *   cachePrefix: 'travelPlans',
 *   pageSize: 20,
 *   cleanupInterval: 2, // 天
 *   retentionPeriod: 30 // 天
 * });
 */

class DataManager {
  constructor(options = {}) {
    // 配置参数
    this.config = {
      collectionName: options.collectionName || 'ld_base_data', // 数据库集合名
      cachePrefix: options.cachePrefix || 'baseData', // 缓存前缀
      pageSize: options.pageSize || 20, // 每页加载数量
      cleanupInterval: options.cleanupInterval || 10/86400, // 清理间隔（10秒，用于测试）
      retentionPeriod: options.retentionPeriod || 10/86400, // 数据保留期（10秒，用于测试）
      hasImages: options.hasImages || false, // 是否包含图片
      timestampField: options.timestampField || 'timestamp', // 时间戳字段名
      sortField: options.sortField || 'timestamp', // 排序字段
      sortOrder: options.sortOrder || 'desc' // 排序方式
    };
    
    console.log(`${options.cachePrefix || 'baseData'}: 初始化配置`, {
      清理间隔: this.config.cleanupInterval + '天（约' + (this.config.cleanupInterval * 86400) + '秒）',
      数据保留期: this.config.retentionPeriod + '天（约' + (this.config.retentionPeriod * 86400) + '秒）'
    });
    
    // 内部状态
    this.coupleId = wx.getStorageSync('coupleId');
    this.loading = false;
    this.hasMore = true;
    this.currentSkip = 0;
    
    // 缓存相关
    this.imageCache = new Map();
    this.cacheStats = {
      totalSize: 0,
      imageCount: 0,
      lastCleanup: 0
    };
    
    // 初始化智能缓存系统
    this.initSmartCacheSystem();
  }
  
  /**
   * 初始化智能缓存系统
   */
  async initSmartCacheSystem() {
    try {
      // 加载缓存统计信息
      const cacheStatsKey = `${this.config.cachePrefix}_cacheStats_${this.coupleId}`;
      const savedStats = wx.getStorageSync(cacheStatsKey) || {
        totalSize: 0,
        imageCount: 0,
        lastCleanup: 0
      };
      
      // 如果包含图片，加载图片缓存映射
      if (this.config.hasImages) {
        const imageCacheKey = `${this.config.cachePrefix}_imageCache_${this.coupleId}`;
        const savedImageCache = wx.getStorageSync(imageCacheKey) || {};
        this.imageCache = new Map(Object.entries(savedImageCache));
      }
      
      this.cacheStats = savedStats;
      
      // 检查是否需要清理缓存
      const now = Date.now();
      const cleanupInterval = this.config.cleanupInterval * 24 * 60 * 60 * 1000;
      if (now - savedStats.lastCleanup > cleanupInterval) {
        console.log(`${this.config.cachePrefix}: 检测到需要清理缓存，延迟2秒执行`);
        setTimeout(async () => {
          await this.smartCacheCleanup();
        }, 2000);
      }
      
      console.log(`${this.config.cachePrefix}: 智能缓存系统初始化完成`, {
        totalSize: this.formatFileSize(savedStats.totalSize),
        imageCount: savedStats.imageCount
      });
    } catch (error) {
      console.error(`${this.config.cachePrefix}: 初始化缓存系统失败`, error);
    }
  }
  
  /**
   * 获取数据（支持刷新和懒加载）
   * @param {boolean} isRefresh - 是否为刷新操作
   * @param {boolean} isLoadMore - 是否为加载更多操作
   * @param {Object} extraQuery - 额外的查询条件
   * @returns {Promise<Array>} 数据列表
   */
  async getData(isRefresh = false, isLoadMore = false, extraQuery = {}) {
    if (this.loading) {
      console.log(`${this.config.cachePrefix}: 正在加载中，跳过重复请求`);
      return [];
    }
    
    this.loading = true;
    
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 构建查询条件
      let query = {
        coupleId: this.coupleId,
        ...extraQuery
      };
      
      let skip = 0;
      let limit = this.config.pageSize;
      
      if (isLoadMore) {
        // 懒加载：跳过已加载的数据
        skip = this.currentSkip;
      } else if (isRefresh) {
        // 刷新：重置分页状态
        this.currentSkip = 0;
        this.hasMore = true;
      }
      
      // 查询数据
      const result = await db.collection(this.config.collectionName)
        .where(query)
        .orderBy(this.config.sortField, this.config.sortOrder)
        .skip(skip)
        .limit(limit)
        .get();
      
      const cloudData = result.data || [];
      const hasMore = cloudData.length === limit;
      
      if (isLoadMore) {
        // 懒加载：更新跳过数量
        this.currentSkip += cloudData.length;
        this.hasMore = hasMore;
        return cloudData;
      } else {
        // 首次加载或刷新：检查是否有新数据
        const cachedData = this.getLocalCachedData();
        const recentCachedData = cachedData.slice(0, this.config.pageSize);
        const hasNewData = this.checkForNewData(cloudData, recentCachedData);
        
        let processedData = cloudData;
        
        if (hasNewData) {
          console.log(`${this.config.cachePrefix}: 检测到新数据，开始处理`);
          
          // 如果包含图片，缓存图片
          if (this.config.hasImages) {
            processedData = await this.cacheDataImages(cloudData);
          }
          
          // 合并新数据和现有缓存数据
          const mergedData = this.mergeWithCachedData(processedData, cachedData);
          
          // 更新本地缓存
          this.updateLocalCache(mergedData);
          
          this.currentSkip = processedData.length;
          this.hasMore = hasMore;
          
          return mergedData;
        } else {
          console.log(`${this.config.cachePrefix}: 没有新数据，使用本地缓存`);
          
          // 如果包含图片，应用本地图片缓存路径
          if (this.config.hasImages) {
            processedData = this.applyLocalImageCache(cloudData);
          }
          
          this.currentSkip = processedData.length;
          this.hasMore = hasMore;
          
          return processedData;
        }
      }
    } catch (error) {
      console.error(`${this.config.cachePrefix}: 获取数据失败`, error);
      
      if (isLoadMore) {
        throw error;
      } else {
        // 如果云端获取失败，使用缓存数据
        const cachedData = this.getLocalCachedData();
        return cachedData;
      }
    } finally {
      this.loading = false;
    }
  }
  
  /**
   * 发布新内容（存储到缓存+落盘+上传云端）
   * @param {Object} data - 要发布的数据
   * @returns {Promise<Object>} 发布结果
   */
  async publishData(data) {
    try {
      const db = wx.cloud.database();
      
      // 添加基础字段
      const publishData = {
        ...data,
        coupleId: this.coupleId,
        [this.config.timestampField]: new Date(),
        _openid: wx.getStorageSync('userInfo')?.openid
      };
      
      // 如果包含图片，先上传图片
      if (this.config.hasImages && data.images && data.images.length > 0) {
        publishData.images = await this.uploadImages(data.images);
      }
      
      // 上传到云端数据库
      const result = await db.collection(this.config.collectionName).add({
        data: publishData
      });
      
      // 添加到本地缓存
      const cachedData = this.getLocalCachedData();
      const newData = {
        ...publishData,
        _id: result._id
      };
      
      // 如果包含图片，缓存图片到本地
      if (this.config.hasImages && newData.images) {
        const cachedImages = await this.cacheDataImages([newData]);
        newData.images = cachedImages[0].images;
      }
      
      // 插入到缓存数据的开头
      cachedData.unshift(newData);
      this.updateLocalCache(cachedData);
      
      console.log(`${this.config.cachePrefix}: 数据发布成功`, result._id);
      return newData;
    } catch (error) {
      console.error(`${this.config.cachePrefix}: 发布数据失败`, error);
      throw error;
    }
  }
  
  /**
   * 更新数据
   * @param {string} dataId - 数据ID
   * @param {Object} updateData - 要更新的数据
   * @returns {Promise<void>}
   */
  async updateData(dataId, updateData) {
    try {
      const db = wx.cloud.database();
      
      // 更新云端数据
      await db.collection(this.config.collectionName).doc(dataId).update({
        data: updateData
      });
      
      // 更新本地缓存
      const cachedData = this.getLocalCachedData();
      const updatedData = cachedData.map(item => {
        if (item._id === dataId) {
          return { ...item, ...updateData };
        }
        return item;
      });
      this.updateLocalCache(updatedData);
      
      console.log(`${this.config.cachePrefix}: 数据更新成功`, dataId, updateData);
    } catch (error) {
      console.error(`${this.config.cachePrefix}: 更新数据失败`, error);
      throw error;
    }
  }

  /**
   * 删除数据
   * @param {string} dataId - 数据ID
   * @param {Object} dataItem - 数据项（用于清理关联资源）
   * @returns {Promise<void>}
   */
  async deleteData(dataId, dataItem = null) {
    try {
      const db = wx.cloud.database();
      
      // 如果包含图片，删除云端图片文件
      if (this.config.hasImages && dataItem && dataItem.images) {
        await this.deleteCloudImages(dataItem.images);
        
        // 删除本地缓存图片
        await this.deleteLocalImages(dataItem.images);
      }
      
      // 删除云端数据
      await db.collection(this.config.collectionName).doc(dataId).remove();
      
      // 从本地缓存中删除
      const cachedData = this.getLocalCachedData();
      const filteredData = cachedData.filter(item => item._id !== dataId);
      this.updateLocalCache(filteredData);
      
      console.log(`${this.config.cachePrefix}: 数据删除成功`, dataId);
    } catch (error) {
      console.error(`${this.config.cachePrefix}: 删除数据失败`, error);
      throw error;
    }
  }
  
  /**
   * 获取本地缓存的数据
   * @returns {Array} 缓存数据
   */
  getLocalCachedData() {
    try {
      const cacheKey = `${this.config.cachePrefix}_${this.coupleId}`;
      let cachedData = wx.getStorageSync(cacheKey) || [];
      
      // 确保cachedData是数组类型
      if (!Array.isArray(cachedData)) {
        console.warn(`${this.config.cachePrefix}: 缓存数据格式错误，重置为空数组`, typeof cachedData);
        cachedData = [];
        // 清除错误的缓存数据
        wx.removeStorageSync(cacheKey);
      }
      
      // 如果缓存为空，尝试从磁盘加载50条数据
      if (cachedData.length === 0) {
        console.log(`${this.config.cachePrefix}: 缓存为空，尝试从磁盘加载数据`);
        // 这里可以实现从磁盘加载逻辑，暂时返回空数组
      }
      
      // 按时间戳排序
      return cachedData.sort((a, b) => {
        const timeA = new Date(a[this.config.timestampField]).getTime();
        const timeB = new Date(b[this.config.timestampField]).getTime();
        return this.config.sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      });
    } catch (error) {
      console.error(`${this.config.cachePrefix}: 获取本地缓存失败`, error);
      return [];
    }
  }
  
  /**
   * 检查是否有新数据
   * @param {Array} cloudData - 云端数据
   * @param {Array} cachedData - 缓存数据
   * @returns {boolean} 是否有新数据
   */
  checkForNewData(cloudData, cachedData) {
    try {
      // 如果本地没有缓存数据，说明是第一次加载
      if (!cachedData || cachedData.length === 0) {
        console.log(`${this.config.cachePrefix}: 本地没有缓存数据，需要下载`);
        return true;
      }
      
      // 比较最新数据的时间戳
      if (cloudData.length > 0 && cachedData.length > 0) {
        const latestCloudTime = new Date(cloudData[0][this.config.timestampField]).getTime();
        const latestCachedTime = new Date(cachedData[0][this.config.timestampField]).getTime();
        if (latestCloudTime > latestCachedTime) {
          console.log(`${this.config.cachePrefix}: 检测到新数据（时间戳比较）`);
          return true;
        }
      }
      
      // 比较数据ID集合
      const cloudIds = new Set(cloudData.map(item => item._id));
      const cachedIds = new Set(cachedData.map(item => item._id));
      
      // 检查是否有新的ID
      for (let id of cloudIds) {
        if (!cachedIds.has(id)) {
          console.log(`${this.config.cachePrefix}: 检测到新数据（ID比较）`);
          return true;
        }
      }
      
      console.log(`${this.config.cachePrefix}: 没有新数据`);
      return false;
    } catch (error) {
      console.error(`${this.config.cachePrefix}: 检查新数据时出错`, error);
      return true; // 出错时默认认为有新数据
    }
  }
  
  /**
   * 合并新数据和缓存数据
   * @param {Array} newData - 新数据
   * @param {Array} cachedData - 缓存数据
   * @returns {Array} 合并后的数据
   */
  mergeWithCachedData(newData, cachedData) {
    try {
      // 创建新数据的ID集合，用于去重
      const newDataIds = new Set(newData.map(item => item._id));
      
      // 过滤掉已存在的数据，避免重复
      const filteredCachedData = cachedData.filter(item => !newDataIds.has(item._id));
      
      // 合并数据：新数据在前，旧数据在后
      const mergedData = [...newData, ...filteredCachedData];
      
      console.log(`${this.config.cachePrefix}: 数据合并完成`, {
        新数据: newData.length,
        缓存数据: filteredCachedData.length,
        合并后: mergedData.length
      });
      
      return mergedData;
    } catch (error) {
      console.error(`${this.config.cachePrefix}: 合并数据失败`, error);
      return newData;
    }
  }
  
  /**
   * 更新本地缓存
   * @param {Array} data - 要缓存的数据
   */
  updateLocalCache(data) {
    try {
      const cacheKey = `${this.config.cachePrefix}_${this.coupleId}`;
      
      // 限制缓存数据量，只保留最新的数据
      const maxCacheSize = this.config.pageSize * 10; // 保留10页的数据
      const dataToCache = data.slice(0, maxCacheSize);
      
      wx.setStorageSync(cacheKey, dataToCache);
      console.log(`${this.config.cachePrefix}: 本地缓存更新完成，缓存${dataToCache.length}条数据`);
    } catch (error) {
      console.error(`${this.config.cachePrefix}: 更新本地缓存失败`, error);
    }
  }
  
  /**
   * 智能图片缓存清理
   * 清理过期的本地图片缓存文件和图片缓存映射
   * @param {number} expireTime - 过期时间戳
   * @returns {Promise<number>} 清理的文件大小
   */
  async smartImageCleanup(expireTime) {
    if (!this.config.hasImages) {
      return 0;
    }
    
    let cleanedSize = 0;
    const expiredItems = [];
    
    console.log(`${this.config.cachePrefix}: 开始智能图片缓存清理`);
    
    try {
      // 遍历图片缓存，找出过期的项目
      for (const [fileID, cacheItem] of this.imageCache.entries()) {
        if (cacheItem.lastAccess < expireTime) {
          expiredItems.push({ fileID, cacheItem });
          cleanedSize += cacheItem.size || 0;
        }
      }
      
      // 删除过期的图片文件和缓存项
      for (const { fileID, cacheItem } of expiredItems) {
        try {
          // 删除本地图片文件
          const fs = wx.getFileSystemManager();
          await new Promise((resolve, reject) => {
            fs.removeSavedFile({
              filePath: cacheItem.localPath,
              success: resolve,
              fail: (error) => {
                console.warn(`${this.config.cachePrefix}: 删除本地图片文件失败`, cacheItem.localPath, error);
                resolve(); // 即使删除失败也继续处理
              }
            });
          });
          
          // 从图片缓存映射中移除
          this.imageCache.delete(fileID);
          
          console.log(`${this.config.cachePrefix}: 已删除过期图片文件`, cacheItem.localPath);
        } catch (error) {
          console.error(`${this.config.cachePrefix}: 删除图片缓存项失败`, fileID, error);
        }
      }
      
      // 更新缓存统计
      this.updateCacheStats();
      
      console.log(`${this.config.cachePrefix}: 图片缓存清理完成`, {
        清理文件数: expiredItems.length,
        释放空间: this.formatFileSize(cleanedSize)
      });
      
      return cleanedSize;
    } catch (error) {
      console.error(`${this.config.cachePrefix}: 智能图片缓存清理失败`, error);
      return 0;
    }
  }
  
  /**
   * 智能缓存清理
   */
  async smartCacheCleanup() {
    const now = Date.now();
    const retentionPeriod = this.config.retentionPeriod * 24 * 60 * 60 * 1000;
    const expireTime = now - retentionPeriod;
    
    let cleanedCount = 0;
    let cleanedSize = 0;
    
    console.log(`${this.config.cachePrefix}: 开始智能缓存清理`);
    
    try {
      const cacheKey = `${this.config.cachePrefix}_${this.coupleId}`;
      const cachedData = wx.getStorageSync(cacheKey) || [];
      const dataToKeep = [];
      
      // 遍历所有数据，检查是否过期
      for (const item of cachedData) {
        const itemTime = new Date(item[this.config.timestampField]).getTime();
        const lastAccessTime = item.lastAccess || itemTime;
        
        if (lastAccessTime < expireTime) {
          // 数据过期
          cleanedCount++;
        } else {
          // 保留未过期的数据
          dataToKeep.push(item);
        }
      }
      
      // 如果启用了图片功能，执行智能图片清理
      if (this.config.hasImages) {
        const imageCleanedSize = await this.smartImageCleanup(expireTime);
        cleanedSize += imageCleanedSize;
      }
      
      // 更新缓存，只保留未过期的数据
      wx.setStorageSync(cacheKey, dataToKeep);
      
      // 更新清理时间
      this.cacheStats.lastCleanup = now;
      this.saveCacheData();
      
      console.log(`${this.config.cachePrefix}: 智能清理完成`, {
        清理数据: cleanedCount,
        释放空间: this.formatFileSize(cleanedSize),
        剩余数据: dataToKeep.length
      });
    } catch (error) {
      console.error(`${this.config.cachePrefix}: 智能清理失败`, error);
    }
  }
  
  /**
   * 上传图片到云存储
   * @param {Array} imagePaths - 本地图片路径数组
   * @returns {Promise<Array>} 云存储文件ID数组
   */
  async uploadImages(imagePaths) {
    if (!this.config.hasImages || !imagePaths || imagePaths.length === 0) {
      return [];
    }
    
    const uploadPromises = imagePaths.map(async (imagePath, index) => {
      try {
        // 压缩图片
        const compressedPath = await this.compressImage(imagePath);
        
        // 上传到云存储
        const cloudPath = `${this.config.cachePrefix}/${Date.now()}_${index}.jpg`;
        const result = await wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: compressedPath
        });
        
        return result.fileID;
      } catch (error) {
        console.error(`${this.config.cachePrefix}: 上传图片失败`, error);
        throw error;
      }
    });
    
    return Promise.all(uploadPromises);
  }
  
  /**
   * 压缩图片
   * @param {string} imagePath - 图片路径
   * @returns {Promise<string>} 压缩后的图片路径
   */
  async compressImage(imagePath) {
    return new Promise((resolve, reject) => {
      wx.compressImage({
        src: imagePath,
        quality: 80, // 压缩质量
        success: (res) => {
          resolve(res.tempFilePath);
        },
        fail: (error) => {
          console.warn(`${this.config.cachePrefix}: 图片压缩失败，使用原图`, error);
          resolve(imagePath); // 压缩失败时使用原图
        }
      });
    });
  }
  
  /**
   * 缓存数据中的图片
   * @param {Array} dataList - 数据列表
   * @returns {Promise<Array>} 处理后的数据列表
   */
  async cacheDataImages(dataList) {
    if (!this.config.hasImages || !dataList || dataList.length === 0) {
      return dataList;
    }
    
    const processedData = [];
    
    for (const item of dataList) {
      const processedItem = { ...item };
      
      if (item.images && Array.isArray(item.images) && item.images.length > 0) {
        const cachedImages = [];
        
        // 并发处理图片缓存
        const cachePromises = item.images.map(async (imageUrl) => {
          try {
            const cachedPath = await this.smartImageCache(imageUrl);
            return {
              cloudUrl: imageUrl,
              localPath: cachedPath
            };
          } catch (error) {
            console.error(`${this.config.cachePrefix}: 缓存图片失败`, imageUrl, error);
            return {
              cloudUrl: imageUrl,
              localPath: imageUrl
            };
          }
        });
        
        const results = await Promise.allSettled(cachePromises);
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            cachedImages.push(result.value);
          }
        });
        
        processedItem.cloudImages = item.images;
        processedItem.images = cachedImages;
      }
      
      processedData.push(processedItem);
    }
    
    return processedData;
  }
  
  /**
   * 应用本地图片缓存路径
   * @param {Array} dataList - 数据列表
   * @returns {Array} 应用缓存路径后的数据列表
   */
  applyLocalImageCache(dataList) {
    if (!this.config.hasImages || !dataList || dataList.length === 0) {
      return dataList;
    }
    
    return dataList.map(item => {
      const updatedItem = { ...item };
      
      if (item.images && Array.isArray(item.images) && item.images.length > 0) {
        const cachedImages = item.images.map(imageUrl => {
          const cachedPath = this.getCachedImagePath(imageUrl);
          return {
            cloudUrl: imageUrl,
            localPath: cachedPath
          };
        });
        
        updatedItem.cloudImages = item.images;
        updatedItem.images = cachedImages;
      }
      
      return updatedItem;
    });
  }
  
  /**
   * 智能图片缓存
   * 检查缓存是否过期，过期则删除缓存
   * 缓存过期时间为7天
   * 缓存大小超过100MB时，删除最旧的缓存
   * @param {string} fileID - 云存储文件ID
   * @returns {Promise<string>} 本地缓存路径
   */
  async smartImageCache(fileID) {
    if (!this.config.hasImages || !fileID || typeof fileID !== 'string') {
      return fileID;
    }
    
    const now = Date.now();
    
    // 检查是否已缓存
    if (this.imageCache.has(fileID)) {
      const cacheItem = this.imageCache.get(fileID);
      
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
        
        // 更新访问时间
        this.updateDataLastAccess(fileID);
        return cacheItem.localPath;
      } catch (e) {
        // 缓存文件不存在，从缓存中移除
        this.imageCache.delete(fileID);
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
    
    this.imageCache.set(fileID, cacheItem);
    
    // 更新统计信息
    this.cacheStats.totalSize += fileSize;
    this.cacheStats.imageCount += 1;
    
    this.saveCacheData();
    this.updateDataLastAccess(fileID);
    
    return savedResult.savedFilePath;
  }
  
  /**
   * 获取缓存的图片路径
   * @param {string} fileID - 云存储文件ID
   * @returns {string} 本地缓存路径或原始路径
   */
  getCachedImagePath(fileID) {
    if (!this.config.hasImages) {
      return fileID;
    }
    
    const cacheItem = this.imageCache.get(fileID);
    if (cacheItem) {
      this.updateDataLastAccess(fileID);
      return cacheItem.localPath;
    }
    return fileID;
  }
  
  /**
   * 更新包含指定图片的数据的访问时间
   * @param {string} fileID - 图片的云端fileID
   */
  updateDataLastAccess(fileID) {
    if (!this.config.hasImages) {
      return;
    }
    
    try {
      const cacheKey = `${this.config.cachePrefix}_${this.coupleId}`;
      const cachedData = wx.getStorageSync(cacheKey) || [];
      const now = Date.now();
      let updated = false;
      
      const updatedData = cachedData.map(item => {
        if (item.images && Array.isArray(item.images)) {
          const hasTargetImage = item.images.some(img => {
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
              ...item,
              lastAccess: now
            };
          }
        }
        return item;
      });
      
      if (updated) {
        wx.setStorageSync(cacheKey, updatedData);
      }
    } catch (error) {
      console.warn(`${this.config.cachePrefix}: 更新数据访问时间失败`, error);
    }
  }
  
  /**
   * 删除云端图片
   * @param {Array} images - 图片数组
   */
  async deleteCloudImages(images) {
    if (!this.config.hasImages || !images || images.length === 0) {
      return;
    }
    
    try {
      let fileIDs = [];
      
      // 提取文件ID
      if (Array.isArray(images)) {
        fileIDs = images.map(img => {
          if (typeof img === 'string') {
            return img;
          } else if (typeof img === 'object' && img.cloudUrl) {
            return img.cloudUrl;
          }
          return null;
        }).filter(Boolean);
      }
      
      if (fileIDs.length > 0) {
        const deletePromises = fileIDs.map(fileID => {
          return wx.cloud.deleteFile({
            fileList: [fileID]
          });
        });
        
        await Promise.all(deletePromises);
        console.log(`${this.config.cachePrefix}: 云端图片删除成功`, fileIDs.length);
      }
    } catch (error) {
      console.error(`${this.config.cachePrefix}: 删除云端图片失败`, error);
    }
  }
  
  /**
   * 删除本地缓存图片
   * @param {Array} images - 图片数组
   */
  async deleteLocalImages(images) {
    if (!this.config.hasImages || !images || images.length === 0) {
      return;
    }
    
    try {
      let fileIDs = [];
      
      // 提取文件ID
      if (Array.isArray(images)) {
        fileIDs = images.map(img => {
          if (typeof img === 'string') {
            return img;
          } else if (typeof img === 'object' && img.cloudUrl) {
            return img.cloudUrl;
          }
          return null;
        }).filter(Boolean);
      }
      
      const deletePromises = fileIDs.map(async (fileID) => {
        try {
          await this.removeCacheItemOnly(fileID);
        } catch (error) {
          console.warn(`${this.config.cachePrefix}: 删除缓存项失败`, fileID, error);
        }
      });
      
      await Promise.allSettled(deletePromises);
      console.log(`${this.config.cachePrefix}: 本地图片缓存删除完成`, fileIDs.length);
    } catch (error) {
      console.error(`${this.config.cachePrefix}: 删除本地图片缓存失败`, error);
    }
  }
  
  /**
   * 仅删除缓存项（不删除物理文件）
   * @param {string} fileID - 文件ID
   */
  async removeCacheItemOnly(fileID) {
    if (!this.config.hasImages || !fileID) {
      return;
    }
    
    try {
      const cacheItem = this.imageCache.get(fileID);
      if (cacheItem) {
        // 删除物理文件
        try {
          const fs = wx.getFileSystemManager();
          await new Promise((resolve, reject) => {
            fs.unlink({
              filePath: cacheItem.localPath,
              success: resolve,
              fail: reject
            });
          });
        } catch (error) {
          console.warn(`${this.config.cachePrefix}: 删除物理文件失败`, cacheItem.localPath, error);
        }
        
        // 从缓存中移除
        this.imageCache.delete(fileID);
        
        // 更新统计信息
        this.cacheStats.totalSize -= (cacheItem.size || 0);
        this.cacheStats.imageCount -= 1;
        
        this.saveCacheData();
      }
    } catch (error) {
      console.error(`${this.config.cachePrefix}: 删除缓存项失败`, error);
    }
  }
  
  /**
   * 保存缓存数据到本地存储
   */
  saveCacheData() {
    try {
      if (this.config.hasImages) {
        const imageCacheKey = `${this.config.cachePrefix}_imageCache_${this.coupleId}`;
        const imageCacheObj = Object.fromEntries(this.imageCache.entries());
        wx.setStorageSync(imageCacheKey, imageCacheObj);
      }
      
      const cacheStatsKey = `${this.config.cachePrefix}_cacheStats_${this.coupleId}`;
      wx.setStorageSync(cacheStatsKey, this.cacheStats);
    } catch (error) {
      console.error(`${this.config.cachePrefix}: 保存缓存数据失败`, error);
    }
  }

  /**
   * 更新缓存统计信息
   * @description 更新并保存缓存统计数据到本地存储
   */
  updateCacheStats() {
    try {
      const cacheStatsKey = `${this.config.cachePrefix}_cacheStats_${this.coupleId}`;
      wx.setStorageSync(cacheStatsKey, this.cacheStats);
      console.log(`${this.config.cachePrefix}: 缓存统计已更新`, {
        总大小: this.formatFileSize(this.cacheStats.totalSize),
        图片数量: this.cacheStats.imageCount,
        最后清理: this.cacheStats.lastCleanup ? new Date(this.cacheStats.lastCleanup).toLocaleString() : '从未清理'
      });
    } catch (error) {
      console.error(`${this.config.cachePrefix}: 更新缓存统计失败`, error);
    }
  }
  
  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string} 格式化后的大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * 获取缓存统计信息
   * @returns {Object} 缓存统计
   */
  getCacheStats() {
    const maxSize = 200 * 1024 * 1024; // 200MB
    const usagePercentage = Math.round((this.cacheStats.totalSize / maxSize) * 100);
    
    return {
      totalSize: this.cacheStats.totalSize,
      formattedTotalSize: this.formatFileSize(this.cacheStats.totalSize),
      formattedMaxSize: this.formatFileSize(maxSize),
      imageCount: this.cacheStats.imageCount,
      usagePercentage: usagePercentage,
      usagePercent: `${usagePercentage}%`,
      lastCleanup: this.cacheStats.lastCleanup ? new Date(this.cacheStats.lastCleanup).toLocaleString() : '从未清理'
    };
  }
  
  /**
   * 手动清理缓存
   * @param {boolean} force - 是否强制清理所有缓存
   * @returns {Promise<Object>} 清理结果
   */
  async manualCacheCleanup(force = false) {
    if (force) {
      // 强制清理所有缓存
      let cleanedCount = 0;
      let cleanedSize = 0;
      
      for (const [fileID, cacheItem] of this.imageCache.entries()) {
        cleanedSize += cacheItem.size;
        cleanedCount++;
        await this.removeCacheItemOnly(fileID);
      }
      
      // 清空数据缓存
      const cacheKey = `${this.config.cachePrefix}_${this.coupleId}`;
      wx.removeStorageSync(cacheKey);
      
      return {
        cleanedCount,
        cleanedSize: this.formatFileSize(cleanedSize),
        remainingCount: 0,
        remainingSize: this.formatFileSize(0)
      };
    } else {
      // 智能清理
      await this.smartCacheCleanup();
      const stats = this.getCacheStats();
      
      return {
        cleanedCount: '智能清理完成',
        cleanedSize: '已清理过期数据',
        remainingCount: stats.imageCount,
        remainingSize: stats.formattedTotalSize
      };
    }
  }
  
  /**
   * 重置分页状态
   */
  resetPagination() {
    this.currentSkip = 0;
    this.hasMore = true;
  }
  
  /**
   * 获取当前分页状态
   * @returns {Object} 分页状态
   */
  getPaginationState() {
    return {
      currentSkip: this.currentSkip,
      hasMore: this.hasMore,
      loading: this.loading,
      pageSize: this.config.pageSize
    };
  }
}

// 导出数据管理器类
module.exports = DataManager;
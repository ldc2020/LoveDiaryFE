/**
 * 通用存储管理工具类
 * 统一处理本地存储、数据缓存、存储清理等操作
 */

class StorageManager {
  /**
   * 设置存储数据
   * @param {string} key 存储键
   * @param {any} data 存储数据
   * @param {boolean} sync 是否同步存储，默认true
   * @returns {Promise<boolean>} 返回是否存储成功
   */
  static async setStorage(key, data, sync = true) {
    try {
      if (sync) {
        wx.setStorageSync(key, data);
        return true;
      } else {
        return new Promise((resolve) => {
          wx.setStorage({
            key: key,
            data: data,
            success: () => resolve(true),
            fail: (error) => {
              console.error('异步存储失败:', error);
              resolve(false);
            }
          });
        });
      }
    } catch (error) {
      console.error('存储数据失败:', error);
      return false;
    }
  }

  /**
   * 获取存储数据
   * @param {string} key 存储键
   * @param {any} defaultValue 默认值
   * @param {boolean} sync 是否同步获取，默认true
   * @returns {Promise<any>|any} 返回存储的数据
   */
  static getStorage(key, defaultValue = null, sync = true) {
    try {
      if (sync) {
        const data = wx.getStorageSync(key);
        return data || defaultValue;
      } else {
        return new Promise((resolve) => {
          wx.getStorage({
            key: key,
            success: (res) => resolve(res.data || defaultValue),
            fail: () => resolve(defaultValue)
          });
        });
      }
    } catch (error) {
      console.error('获取存储数据失败:', error);
      return defaultValue;
    }
  }

  /**
   * 删除存储数据
   * @param {string} key 存储键
   * @param {boolean} sync 是否同步删除，默认true
   * @returns {Promise<boolean>} 返回是否删除成功
   */
  static async removeStorage(key, sync = true) {
    try {
      if (sync) {
        wx.removeStorageSync(key);
        return true;
      } else {
        return new Promise((resolve) => {
          wx.removeStorage({
            key: key,
            success: () => resolve(true),
            fail: (error) => {
              console.error('异步删除存储失败:', error);
              resolve(false);
            }
          });
        });
      }
    } catch (error) {
      console.error('删除存储数据失败:', error);
      return false;
    }
  }

  /**
   * 清空所有存储数据
   * @param {boolean} sync 是否同步清空，默认true
   * @returns {Promise<boolean>} 返回是否清空成功
   */
  static async clearStorage(sync = true) {
    try {
      if (sync) {
        wx.clearStorageSync();
        return true;
      } else {
        return new Promise((resolve) => {
          wx.clearStorage({
            success: () => resolve(true),
            fail: (error) => {
              console.error('异步清空存储失败:', error);
              resolve(false);
            }
          });
        });
      }
    } catch (error) {
      console.error('清空存储数据失败:', error);
      return false;
    }
  }

  /**
   * 获取存储信息
   * @returns {Promise<Object>} 返回存储信息对象
   */
  static async getStorageInfo() {
    return new Promise((resolve) => {
      wx.getStorageInfo({
        success: (res) => {
          resolve({
            keys: res.keys,
            currentSize: res.currentSize,
            limitSize: res.limitSize,
            usageRate: (res.currentSize / res.limitSize * 100).toFixed(2) + '%'
          });
        },
        fail: (error) => {
          console.error('获取存储信息失败:', error);
          resolve({
            keys: [],
            currentSize: 0,
            limitSize: 0,
            usageRate: '0%'
          });
        }
      });
    });
  }

  /**
   * 带过期时间的存储
   * @param {string} key 存储键
   * @param {any} data 存储数据
   * @param {number} expireTime 过期时间（毫秒），默认24小时
   * @returns {Promise<boolean>} 返回是否存储成功
   */
  static async setStorageWithExpire(key, data, expireTime = 24 * 60 * 60 * 1000) {
    const expireData = {
      data: data,
      expireTime: Date.now() + expireTime,
      timestamp: Date.now()
    };
    return await this.setStorage(key, expireData);
  }

  /**
   * 获取带过期时间的存储数据
   * @param {string} key 存储键
   * @param {any} defaultValue 默认值
   * @returns {any} 返回存储的数据，过期则返回默认值
   */
  static getStorageWithExpire(key, defaultValue = null) {
    try {
      const expireData = this.getStorage(key);
      if (!expireData || !expireData.expireTime) {
        return defaultValue;
      }

      if (Date.now() > expireData.expireTime) {
        // 数据已过期，删除并返回默认值
        this.removeStorage(key);
        return defaultValue;
      }

      return expireData.data;
    } catch (error) {
      console.error('获取过期存储数据失败:', error);
      return defaultValue;
    }
  }

  /**
   * 缓存管理类
   */
  static Cache = class {
    constructor(prefix = 'cache_', maxSize = 50) {
      this.prefix = prefix;
      this.maxSize = maxSize;
      this.cacheKeys = StorageManager.getStorage(`${prefix}keys`, []);
    }

    /**
     * 设置缓存
     * @param {string} key 缓存键
     * @param {any} data 缓存数据
     * @param {number} expireTime 过期时间（毫秒）
     */
    async set(key, data, expireTime = 30 * 60 * 1000) {
      const cacheKey = this.prefix + key;
      
      // 如果缓存已满，删除最旧的缓存
      if (this.cacheKeys.length >= this.maxSize) {
        const oldestKey = this.cacheKeys.shift();
        await StorageManager.removeStorage(oldestKey);
      }

      // 添加新缓存
      if (!this.cacheKeys.includes(cacheKey)) {
        this.cacheKeys.push(cacheKey);
        await StorageManager.setStorage(`${this.prefix}keys`, this.cacheKeys);
      }

      await StorageManager.setStorageWithExpire(cacheKey, data, expireTime);
    }

    /**
     * 获取缓存
     * @param {string} key 缓存键
     * @param {any} defaultValue 默认值
     * @returns {any} 缓存数据
     */
    get(key, defaultValue = null) {
      const cacheKey = this.prefix + key;
      return StorageManager.getStorageWithExpire(cacheKey, defaultValue);
    }

    /**
     * 删除缓存
     * @param {string} key 缓存键
     */
    async remove(key) {
      const cacheKey = this.prefix + key;
      const index = this.cacheKeys.indexOf(cacheKey);
      if (index > -1) {
        this.cacheKeys.splice(index, 1);
        await StorageManager.setStorage(`${this.prefix}keys`, this.cacheKeys);
      }
      await StorageManager.removeStorage(cacheKey);
    }

    /**
     * 清空所有缓存
     */
    async clear() {
      for (const cacheKey of this.cacheKeys) {
        await StorageManager.removeStorage(cacheKey);
      }
      this.cacheKeys = [];
      await StorageManager.removeStorage(`${this.prefix}keys`);
    }

    /**
     * 获取缓存统计信息
     */
    getStats() {
      return {
        count: this.cacheKeys.length,
        maxSize: this.maxSize,
        keys: this.cacheKeys
      };
    }
  };

  /**
   * 图片缓存管理
   */
  static ImageCache = class extends StorageManager.Cache {
    constructor() {
      super('img_cache_', 100);
      this.maxCacheSize = 150 * 1024 * 1024; // 150MB
      this.currentCacheSize = this.getCurrentCacheSize();
    }

    /**
     * 获取当前缓存大小
     */
    getCurrentCacheSize() {
      const sizeData = StorageManager.getStorage('img_cache_size', 0);
      return sizeData;
    }

    /**
     * 更新缓存大小
     */
    async updateCacheSize(size) {
      this.currentCacheSize += size;
      await StorageManager.setStorage('img_cache_size', this.currentCacheSize);
    }

    /**
     * 设置图片缓存
     */
    async setImage(fileID, localPath, fileSize) {
      // 检查缓存大小限制
      if (this.currentCacheSize + fileSize > this.maxCacheSize) {
        await this.cleanupOldCache(fileSize);
      }

      const cacheData = {
        localPath: localPath,
        fileSize: fileSize,
        lastAccess: Date.now(),
        downloadTime: Date.now()
      };

      await this.set(fileID, cacheData, 7 * 24 * 60 * 60 * 1000); // 7天过期
      await this.updateCacheSize(fileSize);
    }

    /**
     * 获取图片缓存
     */
    getImage(fileID) {
      const cacheData = this.get(fileID);
      if (cacheData) {
        // 更新最后访问时间
        cacheData.lastAccess = Date.now();
        this.set(fileID, cacheData, 7 * 24 * 60 * 60 * 1000);
        return cacheData.localPath;
      }
      return null;
    }

    /**
     * 清理旧缓存
     */
    async cleanupOldCache(needSize) {
      const allCacheData = [];
      
      // 收集所有缓存数据
      for (const cacheKey of this.cacheKeys) {
        const data = StorageManager.getStorage(cacheKey);
        if (data && data.data) {
          allCacheData.push({
            key: cacheKey,
            ...data.data,
            fileID: cacheKey.replace(this.prefix, '')
          });
        }
      }

      // 按最后访问时间排序，删除最旧的
      allCacheData.sort((a, b) => a.lastAccess - b.lastAccess);
      
      let freedSize = 0;
      for (const item of allCacheData) {
        if (freedSize >= needSize) break;
        
        await this.remove(item.fileID);
        freedSize += item.fileSize;
        this.currentCacheSize -= item.fileSize;
      }

      await StorageManager.setStorage('img_cache_size', this.currentCacheSize);
    }
  };

  /**
   * 数据缓存管理
   */
  static DataCache = class extends StorageManager.Cache {
    constructor() {
      super('data_cache_', 50);
    }

    /**
     * 设置用户信息缓存
     */
    async setUserInfo(userInfo, expireTime = 5 * 60 * 1000) {
      await this.set('userInfo', userInfo, expireTime);
    }

    /**
     * 获取用户信息缓存
     */
    getUserInfo() {
      return this.get('userInfo');
    }

    /**
     * 设置瞬间列表缓存
     */
    async setMoments(moments, expireTime = 10 * 60 * 1000) {
      await this.set('moments', moments, expireTime);
    }

    /**
     * 获取瞬间列表缓存
     */
    getMoments() {
      return this.get('moments', []);
    }
  };
}

module.exports = StorageManager;
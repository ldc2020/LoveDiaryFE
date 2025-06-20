/**
 * 猫眼电影API服务模块
 * 提供电影搜索和详情获取功能，包含图片压缩和本地缓存机制
 * 不使用云函数，直接本地处理
 * 
 * 功能特性：
 * 1. 电影搜索：调用猫眼搜索API，支持本地缓存24小时
 * 2. 电影详情：调用猫眼详情API，存储到云数据库
 * 3. 图片处理：下载、压缩到50KB、上传到公共云端文件夹
 * 4. 智能缓存：本地存储 → 云数据库 → API调用的三级缓存策略
 * 
 * @author AI Assistant
 * @version 1.0.0
 */

const app = getApp();
const CompressUtil = require('./compressUtil');

class MovieApiService {
  constructor() {
    // 猫眼API配置
    this.config = {
      searchApiUrl: 'https://apis.netstart.cn/maoyan/search/movies', // 搜索API
      detailApiUrl: 'https://apis.netstart.cn/maoyan/movie/detail',   // 详情API
      maxImageSize: 50 * 1024, // 图片压缩目标：50KB
      cacheExpiry: 24 * 60 * 60 * 1000, // 搜索缓存24小时
      requestTimeout: 10000 // 请求超时10秒
    };
    
    console.log('[MovieApiService] 初始化猫眼电影API服务');
  }

  /**
   * 搜索电影
   * 缓存策略：本地存储 → 猫眼搜索API → 结果缓存
   * @param {string} keyword - 搜索关键词
   * @returns {Promise<Array>} 电影搜索结果列表
   */
  async searchMovies(keyword) {
    try {
      console.log('[MovieApiService] 开始搜索电影:', keyword);
      
      // 参数验证
      if (!keyword || !keyword.trim()) {
        throw new Error('搜索关键词不能为空');
      }
      
      const trimmedKeyword = keyword.trim();
      
      // 1. 先检查本地缓存
      const cachedResult = await this.getCachedSearchResult(trimmedKeyword);
      if (cachedResult) {
        console.log('[MovieApiService] 从本地缓存获取搜索结果:', cachedResult.title);
        return cachedResult;
      }

      // 2. 调用猫眼搜索API
      const searchResult = await this.callSearchApi(trimmedKeyword);
      
      // 3. 缓存搜索结果到本地
      if (searchResult) {
        await this.cacheSearchResult(trimmedKeyword, searchResult);
        console.log('[MovieApiService] 搜索结果已缓存:', searchResult.title);
      }

      return searchResult;
    } catch (error) {
      console.error('[MovieApiService] 搜索电影失败:', error);
      throw new Error(`搜索电影失败: ${error.message}`);
    }
  }

  /**
   * 获取电影详情
   * 缓存策略：云数据库 → 猫眼详情API → 图片处理 → 数据库存储
   * @param {string} movieId - 电影ID
   * @returns {Promise<Object>} 电影详情信息
   */
  async getMovieDetail(movieId) {
    try {
      console.log('[MovieApiService] 获取电影详情:', movieId);
      
      // 参数验证
      if (!movieId) {
        throw new Error('电影ID不能为空');
      }
      
      // 1. 先检查云数据库缓存
      const cachedDetail = await this.getCachedMovieDetail(movieId);
      if (cachedDetail) {
        console.log('[MovieApiService] 从云数据库获取电影详情');
        return cachedDetail;
      }

      // 2. 调用猫眼详情API
      const movieDetail = await this.callDetailApi(movieId);
      
      // 3. 处理海报图片：下载、压缩、上传到云端
      if (movieDetail.poster) {
        console.log('[MovieApiService] 开始处理电影海报图片');
        movieDetail.poster = await this.processAndUploadImage(
          movieDetail.poster, 
          movieId
        );
      }

      // 4. 保存到云数据库
      await this.saveMovieToDatabase(movieDetail);
      console.log('[MovieApiService] 电影详情已保存到云数据库');

      return movieDetail;
    } catch (error) {
      console.error('[MovieApiService] 获取电影详情失败:', error);
      throw new Error(`获取电影详情失败: ${error.message}`);
    }
  }

  /**
   * 调用猫眼搜索API
   * @param {string} keyword - 搜索关键词
   * @returns {Promise<Array>} API返回的电影列表
   */
  async callSearchApi(keyword) {
    return new Promise((resolve, reject) => {
      console.log('[MovieApiService] 调用猫眼搜索API:', keyword);
      
      wx.request({
        url: this.config.searchApiUrl,
        method: 'GET',
        data: {
          keyword: keyword
        },
        header: {
          'Content-Type': 'application/json'
        },
        timeout: this.config.requestTimeout,
        success: (res) => {
          console.log('[MovieApiService] 搜索API响应状态:', res.statusCode);
          console.log('[MovieApiService] 搜索API响应数据:', res.data);
          
          if (res.statusCode === 200) {
            // 处理API返回的数据格式，只获取第一个电影对象
            const movies = Array.isArray(res.data) ? res.data : [];
            
            if (movies.length === 0) {
              console.log('[MovieApiService] 搜索结果为空');
              resolve(null);
              return;
            }
            
            // 只取第一个电影对象
            const firstMovie = movies[0];
            const formattedMovie = {
              id: firstMovie.id?.toString() || '',
              title: firstMovie.name || '未知电影',
              poster: firstMovie.poster || '',
              year: firstMovie.release || '未知年份',
              rating: firstMovie.score ? `${firstMovie.score}分` : '暂无评分',
              genre: firstMovie.catogary || '未知类型',
              ename: firstMovie.ename || '',
              wish: firstMovie.wish || '',
              version: firstMovie.version || ''
            };
            
            console.log('[MovieApiService] 格式化后的电影数据（第一个）:', formattedMovie);
            resolve(formattedMovie);
          } else {
            reject(new Error(`API请求失败，状态码: ${res.statusCode}`));
          }
        },
        fail: (error) => {
          console.error('[MovieApiService] 搜索API请求失败:', error);
          reject(new Error(`网络请求失败: ${error.errMsg || '未知错误'}`));
        }
      });
    });
  }

  /**
   * 调用猫眼详情API
   * @param {string} movieId - 电影ID
   * @returns {Promise<Object>} API返回的电影详情
   */
  async callDetailApi(movieId) {
    return new Promise((resolve, reject) => {
      console.log('[MovieApiService] 调用猫眼详情API:', movieId);
      
      wx.request({
        url: this.config.detailApiUrl,
        method: 'GET',
        data: {
          movieId: movieId
        },
        header: {
          'Content-Type': 'application/json'
        },
        timeout: this.config.requestTimeout,
        success: (res) => {
          console.log('[MovieApiService] 详情API响应状态:', res.statusCode);
          
          if (res.statusCode === 200 && res.data) {
            // 处理API返回的详情数据，提取导演、主演、简介、电影时长等字段
            const data = res.data;
            const movieInfo = data.movie || {};
            
            // 处理电影简介，超过200字时截断并添加省略号
            let summary = movieInfo.dra || data.$description || '暂无简介';
            if (summary.length > 200) {
              summary = summary.substring(0, 200) + '...';
              console.log('[MovieApiService] 电影简介超过200字，已截断并添加省略号');
            }
            
            const formattedMovie = {
              id: movieId,
              movieId: movieId, // 保存原始ID用于数据库查询
              summary: summary, // 处理后的简介（可能包含省略号）
              director: movieInfo.dir || '未知导演', // 导演信息
              actors: data.star || movieInfo.star || '未知主演', // 主演信息，优先使用顶级star字段
              duration: movieInfo.dur ? `${movieInfo.dur}分钟` : '未知时长', // 电影时长
              createTime: new Date(),
              updateTime: new Date()
            };
            
            console.log('[MovieApiService] 格式化后的电影详情:', formattedMovie);
            resolve(formattedMovie);
          } else {
            reject(new Error(`详情API返回数据格式错误，状态码: ${res.statusCode}`));
          }
        },
        fail: (error) => {
          console.error('[MovieApiService] 详情API请求失败:', error);
          reject(new Error(`网络请求失败: ${error.errMsg || '未知错误'}`));
        }
      });
    });
  }

  /**
   * 处理并上传图片到云端公共文件夹
   * 流程：下载原图 → 压缩到50KB → 上传到movies/posters/文件夹
   * @param {string} imageUrl - 原始图片URL
   * @param {string} movieId - 电影ID
   * @returns {Promise<string>} 云端图片URL
   */
  async processAndUploadImage(imageUrl, movieId) {
    try {
      console.log('[MovieApiService] 开始处理图片:', imageUrl);
      
      if (!imageUrl) {
        console.warn('[MovieApiService] 图片URL为空，跳过处理');
        return '';
      }
      
      // 1. 下载原始图片到本地临时文件
      const tempFilePath = await this.downloadImage(imageUrl);
      console.log('[MovieApiService] 图片下载完成:', tempFilePath);
      
      // 2. 压缩图片到50KB以下
      const compressedPath = await this.compressImage(tempFilePath);
      console.log('[MovieApiService] 图片压缩完成:', compressedPath);
      
      // 3. 上传到云存储的公共文件夹
      const cloudPath = `movies/posters/${movieId}_${Date.now()}.jpg`;
      const cloudUrl = await this.uploadToCloud(compressedPath, cloudPath);
      
      console.log('[MovieApiService] 图片上传成功，云端URL:', cloudUrl);
      return cloudUrl;
    } catch (error) {
      console.error('[MovieApiService] 图片处理失败:', error);
      // 如果图片处理失败，返回原始URL，不影响主流程
      console.warn('[MovieApiService] 图片处理失败，使用原始URL');
      return imageUrl;
    }
  }

  /**
   * 下载图片到本地临时文件
   * @param {string} imageUrl - 图片URL
   * @returns {Promise<string>} 本地临时文件路径
   */
  downloadImage(imageUrl) {
    return new Promise((resolve, reject) => {
      console.log('[MovieApiService] 开始下载图片:', imageUrl);
      
      wx.downloadFile({
        url: imageUrl,
        timeout: this.config.requestTimeout,
        success: (res) => {
          if (res.statusCode === 200) {
            console.log('[MovieApiService] 图片下载成功:', res.tempFilePath);
            resolve(res.tempFilePath);
          } else {
            reject(new Error(`图片下载失败，状态码: ${res.statusCode}`));
          }
        },
        fail: (error) => {
          console.error('[MovieApiService] 图片下载失败:', error);
          reject(new Error(`图片下载失败: ${error.errMsg || '未知错误'}`));
        }
      });
    });
  }

  /**
   * 压缩图片到指定大小
   * @param {string} filePath - 原始文件路径
   * @returns {Promise<string>} 压缩后文件路径
   */
  async compressImage(filePath) {
    try {
      console.log('[MovieApiService] 开始压缩图片:', filePath);
      
      const result = await CompressUtil.compressImage(filePath, this.config.maxImageSize);
      
      console.log('[MovieApiService] 图片压缩完成:', {
        原始路径: filePath,
        压缩后路径: result.tempFilePath,
        原始大小: CompressUtil.formatFileSize(result.originalSize),
        压缩后大小: CompressUtil.formatFileSize(result.compressedSize)
      });
      
      return result.tempFilePath;
    } catch (error) {
      console.error('[MovieApiService] 图片压缩失败:', error);
      throw new Error(`图片压缩失败: ${error.message}`);
    }
  }

  /**
   * 获取文件大小
   * @param {string} filePath - 文件路径
   * @returns {Promise<number>} 文件大小（字节）
   */
  getFileSize(filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileInfo({
        filePath: filePath,
        success: (res) => {
          resolve(res.size);
        },
        fail: (error) => {
          console.error('[MovieApiService] 获取文件大小失败:', error);
          reject(new Error(`获取文件大小失败: ${error.errMsg || '未知错误'}`));
        }
      });
    });
  }

  /**
   * 格式化文件大小显示
   * @param {number} bytes - 字节数
   * @returns {string} 格式化后的大小字符串
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 上传文件到云存储公共文件夹
   * @param {string} filePath - 本地文件路径
   * @param {string} cloudPath - 云端路径
   * @returns {Promise<string>} 云端文件URL
   */
  uploadToCloud(filePath, cloudPath) {
    return new Promise((resolve, reject) => {
      console.log('[MovieApiService] 开始上传文件到云端:', cloudPath);
      
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath,
        success: (res) => {
          console.log('[MovieApiService] 文件上传成功:', res.fileID);
          resolve(res.fileID);
        },
        fail: (error) => {
          console.error('[MovieApiService] 文件上传失败:', error);
          reject(new Error(`文件上传失败: ${error.errMsg || '未知错误'}`));
        }
      });
    });
  }

  /**
   * 从本地缓存获取搜索结果
   * 缓存键格式：movie_search_{keyword}
   * @param {string} keyword - 搜索关键词
   * @returns {Promise<Array|null>} 缓存的搜索结果或null
   */
  async getCachedSearchResult(keyword) {
    try {
      const cacheKey = `movie_search_${keyword}`;
      const cached = wx.getStorageSync(cacheKey);
      
      if (cached && cached.timestamp && cached.data) {
        const now = Date.now();
        const cacheAge = now - cached.timestamp;
        
        // 检查缓存是否过期（24小时）
        if (cacheAge < this.config.cacheExpiry) {
          console.log(`[MovieApiService] 搜索缓存命中，剩余有效期: ${Math.round((this.config.cacheExpiry - cacheAge) / 1000 / 60)}分钟`);
          return cached.data;
        } else {
          // 缓存过期，删除
          console.log('[MovieApiService] 搜索缓存已过期，删除缓存');
          wx.removeStorageSync(cacheKey);
        }
      }
      
      return null;
    } catch (error) {
      console.error('[MovieApiService] 获取搜索缓存失败:', error);
      return null;
    }
  }

  /**
   * 缓存搜索结果到本地存储
   * @param {string} keyword - 搜索关键词
   * @param {Array} data - 搜索结果
   */
  async cacheSearchResult(keyword, data) {
    try {
      const cacheKey = `movie_search_${keyword}`;
      const cacheData = {
        data: data,
        timestamp: Date.now(),
        keyword: keyword
      };
      
      wx.setStorageSync(cacheKey, cacheData);
      console.log(`[MovieApiService] 搜索结果已缓存，关键词: ${keyword}，电影: ${data.title || '未知电影'}`);
    } catch (error) {
      console.error('[MovieApiService] 缓存搜索结果失败:', error);
    }
  }

  /**
   * 从云数据库获取电影详情缓存
   * @param {string} movieId - 电影ID
   * @returns {Promise<Object|null>} 电影详情或null
   */
  async getCachedMovieDetail(movieId) {
    try {
      console.log('[MovieApiService] 查询云数据库电影详情:', movieId);
      
      const db = wx.cloud.database();
      const result = await db.collection('ld_movies_info').where({
        movieId: movieId
      }).get();
      
      if (result.data && result.data.length > 0) {
        console.log('[MovieApiService] 云数据库命中电影详情缓存');
        return result.data[0];
      }
      
      console.log('[MovieApiService] 云数据库未找到电影详情缓存');
      return null;
    } catch (error) {
      console.error('[MovieApiService] 从云数据库获取电影详情失败:', error);
      return null;
    }
  }

  /**
   * 保存电影信息到云数据库
   * 集合名：ld_movies_info
   * @param {Object} movieData - 电影数据
   */
  async saveMovieToDatabase(movieData) {
    try {
      console.log('[MovieApiService] 保存电影信息到云数据库:', movieData.movieId);
      
      const db = wx.cloud.database();
      
      // 检查是否已存在相同电影
      const existing = await db.collection('ld_movies_info').where({
        movieId: movieData.movieId
      }).get();
      
      if (existing.data && existing.data.length > 0) {
        // 更新现有记录
        const updateData = {
          ...movieData,
          updateTime: new Date()
        };
        
        await db.collection('ld_movies_info').doc(existing.data[0]._id).update({
          data: updateData
        });
        
        console.log('[MovieApiService] 电影信息已更新到云数据库');
      } else {
        // 创建新记录
        await db.collection('ld_movies_info').add({
          data: movieData
        });
        
        console.log('[MovieApiService] 电影信息已新增到云数据库');
      }
    } catch (error) {
      console.error('[MovieApiService] 保存电影信息到云数据库失败:', error);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 清理过期的本地搜索缓存
   * 清理所有超过24小时的搜索缓存
   */
  async cleanupExpiredCache() {
    try {
      console.log('[MovieApiService] 开始清理过期搜索缓存');
      
      const storageInfo = wx.getStorageInfoSync();
      const keys = storageInfo.keys;
      let cleanedCount = 0;
      
      for (const key of keys) {
        if (key.startsWith('movie_search_')) {
          try {
            const cached = wx.getStorageSync(key);
            if (cached && cached.timestamp) {
              const now = Date.now();
              const cacheAge = now - cached.timestamp;
              
              if (cacheAge >= this.config.cacheExpiry) {
                wx.removeStorageSync(key);
                cleanedCount++;
                console.log(`[MovieApiService] 清理过期缓存: ${key}`);
              }
            }
          } catch (error) {
            console.error(`[MovieApiService] 清理缓存项失败: ${key}`, error);
          }
        }
      }
      
      console.log(`[MovieApiService] 缓存清理完成，清理数量: ${cleanedCount}`);
    } catch (error) {
      console.error('[MovieApiService] 清理过期缓存失败:', error);
    }
  }
}

// 导出单例实例
const movieApiService = new MovieApiService();

// 定期清理过期缓存（每小时执行一次）
setInterval(() => {
  movieApiService.cleanupExpiredCache();
}, 60 * 60 * 1000);

module.exports = movieApiService;
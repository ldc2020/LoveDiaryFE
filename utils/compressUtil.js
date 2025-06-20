/**
 * 图片压缩工具类
 * 提供统一的图片压缩功能，支持自定义压缩目标大小
 * 默认压缩到100KB左右
 */
class CompressUtil {
  /**
   * 压缩图片到指定大小
   * @param {string} tempFilePath - 临时文件路径
   * @param {number} targetSize - 目标文件大小（字节），默认100KB
   * @returns {Promise<Object>} 压缩结果对象
   */
  static async compressImage(tempFilePath, targetSize = 100 * 1024) {
    try {
      // 获取原始图片信息
      const fs = wx.getFileSystemManager();
      const originalStats = await new Promise((resolve, reject) => {
        fs.stat({
          path: tempFilePath,
          success: resolve,
          fail: reject
        });
      });
      
      const originalSize = originalStats.stats.size;
      console.log(`[CompressUtil] 原始图片大小: ${this.formatFileSize(originalSize)}`);
      
      // 如果原始图片已经小于目标大小，直接返回
      if (originalSize <= targetSize) {
        console.log('[CompressUtil] 图片已经足够小，无需压缩');
        return {
          tempFilePath: tempFilePath,
          originalSize: originalSize,
          compressedSize: originalSize,
          compressionRatio: 0
        };
      }
      
      // 计算压缩质量（基于文件大小比例）
      let quality = (targetSize*1.0 / originalSize) * 10;
      console.log(`[CompressUtil] 压缩质量: ${quality}%`);
      

      const compressResult = await new Promise((resolve, reject) => {
        wx.compressImage({
          src: tempFilePath,
          quality: quality,
          success: resolve,
          fail: reject
        });
      });
      
      // 检查压缩后的文件大小
      const compressedStats = await new Promise((resolve, reject) => {
        fs.stat({
          path: compressResult.tempFilePath,
          success: resolve,
          fail: reject
        });
      });
      const compressedSize = compressedStats.stats.size;
      console.log(`[CompressUtil] 压缩后大小: ${this.formatFileSize(compressedSize)}`);
      
    
      return {
        tempFilePath: compressResult.tempFilePath,
        originalSize: originalSize,
        compressedSize: compressedSize,
        compressionRatio: ((originalSize - compressedSize) / originalSize * 100).toFixed(2)
      };
      
    } catch (error) {
      console.error('[CompressUtil] 压缩图片失败:', error);
      // 压缩失败时返回原图片
      return {
        tempFilePath: tempFilePath,
        originalSize: 0,
        compressedSize: 0,
        compressionRatio: 0,
        error: error.message
      };
    }
  }
  
  /**
   * 批量压缩图片
   * @param {Array<string>} tempFilePaths - 临时文件路径数组
   * @param {number} targetSize - 目标文件大小（字节），默认100KB
   * @returns {Promise<Array<Object>>} 压缩结果数组
   */
  static async compressImages(tempFilePaths, targetSize = 100 * 1024) {
    try {
      console.log(`[CompressUtil] 开始批量压缩 ${tempFilePaths.length} 张图片`);
      
      const results = await Promise.all(
        tempFilePaths.map(async (tempPath, index) => {
          console.log(`[CompressUtil] 压缩第 ${index + 1}/${tempFilePaths.length} 张图片`);
          return await this.compressImage(tempPath, targetSize);
        })
      );
      
      console.log('[CompressUtil] 批量压缩完成');
      return results;
    } catch (error) {
      console.error('[CompressUtil] 批量压缩失败:', error);
      throw error;
    }
  }
  
  /**
   * 格式化文件大小显示
   * @param {number} bytes - 字节数
   * @returns {string} 格式化后的文件大小
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * 获取图片信息
   * @param {string} filePath - 文件路径
   * @returns {Promise<Object>} 图片信息
   */
  static async getImageInfo(filePath) {
    try {
      const fs = wx.getFileSystemManager();
      const stats = await new Promise((resolve, reject) => {
        fs.stat({
          path: filePath,
          success: resolve,
          fail: reject
        });
      });
      
      const imageInfo = await new Promise((resolve, reject) => {
        wx.getImageInfo({
          src: filePath,
          success: resolve,
          fail: reject
        });
      });
      
      return {
        size: stats.size,
        width: imageInfo.width,
        height: imageInfo.height,
        type: imageInfo.type,
        formattedSize: this.formatFileSize(stats.size)
      };
    } catch (error) {
      console.error('[CompressUtil] 获取图片信息失败:', error);
      throw error;
    }
  }
  
  /**
   * 检查图片是否需要压缩
   * @param {string} filePath - 文件路径
   * @param {number} targetSize - 目标文件大小（字节）
   * @returns {Promise<boolean>} 是否需要压缩
   */
  static async needsCompression(filePath, targetSize = 100 * 1024) {
    try {
      const imageInfo = await this.getImageInfo(filePath);
      return imageInfo.size > targetSize;
    } catch (error) {
      console.error('[CompressUtil] 检查压缩需求失败:', error);
      return false;
    }
  }
}

module.exports = CompressUtil;
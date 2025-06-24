/**
 * 通用图片处理工具类
 * 统一处理图片选择、压缩、保存等操作
 */
const CompressUtil = require('./compressUtil');
const LoadingManager = require('./loadingManager');

class ImageHandler {
  /**
   * 选择图片的通用方法
   * @param {Object} options 配置选项
   * @param {number} options.maxCount 最大选择数量，默认9
   * @param {Array} options.sourceType 图片来源，默认['album', 'camera']
   * @param {Array} options.sizeType 图片尺寸，默认['compressed']
   * @param {boolean} options.showActionSheet 是否显示选择菜单，默认true
   * @param {Array} options.currentImages 当前已选图片数组，用于计算剩余可选数量
   * @returns {Promise<Array>} 返回选中的图片路径数组
   */
  static async chooseImages(options = {}) {
    const {
      maxCount = 9,
      sourceType = ['album', 'camera'],
      sizeType = ['compressed'],
      showActionSheet = true,
      currentImages = []
    } = options;

    // 计算剩余可选数量
    const remainingCount = maxCount - currentImages.length;
    if (remainingCount <= 0) {
      LoadingManager.showToast(`最多只能选择${maxCount}张图片`, 'none');
      return [];
    }

    return new Promise((resolve, reject) => {
      const selectImages = (sourceType) => {
        wx.chooseMedia({
          mediaType: ['image'],
          count: remainingCount,
          sizeType: sizeType,
          sourceType: sourceType,
          success: (res) => {
            const tempFiles = res.tempFiles;
            const tempFilePaths = tempFiles.map(file => file.tempFilePath);
            resolve(tempFilePaths);
          },
          fail: (err) => {
            console.error('选择图片失败:', err);
            LoadingManager.showToast('选择图片失败', 'error');
            reject(err);
          }
        });
      };

      if (showActionSheet && sourceType.length > 1) {
        wx.showActionSheet({
          itemList: ['从相册选择', '拍照'],
          success: (res) => {
            const selectedSourceType = res.tapIndex === 0 ? ['album'] : ['camera'];
            selectImages(selectedSourceType);
          },
          fail: () => {
            reject(new Error('用户取消选择'));
          }
        });
      } else {
        selectImages(sourceType);
      }
    });
  }

  /**
   * 压缩图片的通用方法
   * @param {string} imagePath 图片路径
   * @param {number} targetSize 目标大小（字节），默认100KB
   * @returns {Promise<string>} 返回压缩后的图片路径
   */
  static async compressImage(imagePath, targetSize = 100 * 1024) {
    try {
      const result = await CompressUtil.compressImage(imagePath, targetSize);
      return result.tempFilePath;
    } catch (error) {
      console.error('图片压缩失败，使用原图:', error);
      return imagePath;
    }
  }

  /**
   * 批量压缩图片
   * @param {Array<string>} imagePaths 图片路径数组
   * @param {number} targetSize 目标大小（字节），默认100KB
   * @returns {Promise<Array<string>>} 返回压缩后的图片路径数组
   */
  static async compressImages(imagePaths, targetSize = 100 * 1024) {
    if (!imagePaths || imagePaths.length === 0) {
      return [];
    }

    try {
      const compressedPaths = await Promise.all(
        imagePaths.map(path => this.compressImage(path, targetSize))
      );
      return compressedPaths;
    } catch (error) {
      console.error('批量压缩图片失败:', error);
      throw error;
    }
  }

  /**
   * 保存图片到本地永久存储
   * @param {string} tempFilePath 临时文件路径
   * @returns {Promise<string>} 返回保存后的永久路径
   */
  static async saveImageToLocal(tempFilePath) {
    return new Promise((resolve, reject) => {
      const fs = wx.getFileSystemManager();
      fs.saveFile({
        tempFilePath: tempFilePath,
        success: (res) => {
          resolve(res.savedFilePath);
        },
        fail: (err) => {
          console.error('保存图片到本地失败:', err);
          reject(err);
        }
      });
    });
  }

  /**
   * 批量保存图片到本地永久存储
   * @param {Array<string>} tempFilePaths 临时文件路径数组
   * @param {boolean} showLoading 是否显示加载提示，默认true
   * @returns {Promise<Array<string>>} 返回保存后的永久路径数组
   */
  static async saveImagesToLocal(tempFilePaths, showLoading = true) {
    if (!tempFilePaths || tempFilePaths.length === 0) {
      return [];
    }

    if (showLoading) {
      LoadingManager.showLoading('保存图片中...');
    }

    try {
      const savedPaths = await Promise.all(
        tempFilePaths.map(path => this.saveImageToLocal(path))
      );
      
      if (showLoading) {
        LoadingManager.hideLoading();
      }
      
      return savedPaths;
    } catch (error) {
      if (showLoading) {
        LoadingManager.hideLoading();
      }
      console.error('批量保存图片失败:', error);
      throw error;
    }
  }

  /**
   * 压缩并保存图片的组合方法
   * @param {Array<string>} tempFilePaths 临时文件路径数组
   * @param {Object} options 配置选项
   * @param {number} options.targetSize 压缩目标大小，默认100KB
   * @param {boolean} options.showLoading 是否显示加载提示，默认true
   * @param {string} options.loadingText 加载提示文本，默认'压缩并保存图片中...'
   * @returns {Promise<Array<string>>} 返回压缩并保存后的永久路径数组
   */
  static async compressAndSaveImages(tempFilePaths, options = {}) {
    const {
      targetSize = 100 * 1024,
      showLoading = true,
      loadingText = '压缩并保存图片中...'
    } = options;

    if (!tempFilePaths || tempFilePaths.length === 0) {
      LoadingManager.showToast('未选择图片', 'none');
      return [];
    }

    if (showLoading) {
      LoadingManager.showLoading(loadingText);
    }

    try {
      // 先压缩所有图片
      const compressedPaths = await this.compressImages(tempFilePaths, targetSize);
      
      // 再保存所有压缩后的图片
      const savedPaths = await this.saveImagesToLocal(compressedPaths, false);
      
      if (showLoading) {
        LoadingManager.hideLoading();
      }
      
      return savedPaths;
    } catch (error) {
      if (showLoading) {
        LoadingManager.hideLoading();
      }
      console.error('压缩并保存图片失败:', error);
      LoadingManager.showToast('图片处理失败', 'error');
      throw error;
    }
  }

  /**
   * 删除本地保存的文件
   * @param {Array<string>} filePaths 文件路径数组
   * @returns {Promise<void>}
   */
  static async removeLocalFiles(filePaths) {
    if (!filePaths || filePaths.length === 0) {
      return;
    }

    const fs = wx.getFileSystemManager();
    const removePromises = filePaths.map(filePath => {
      return new Promise((resolve) => {
        fs.removeSavedFile({
          filePath,
          success: (res) => {
            console.log('删除文件成功:', filePath);
            resolve(res);
          },
          fail: (err) => {
            console.log('删除文件失败:', filePath, err);
            resolve(err); // 即使失败也resolve，避免影响其他文件删除
          }
        });
      });
    });

    await Promise.all(removePromises);
  }
}

module.exports = ImageHandler;
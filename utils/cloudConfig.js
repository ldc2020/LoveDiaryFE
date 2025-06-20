/**
 * 云存储配置管理工具
 * 统一管理云存储环境ID、路径前缀等配置信息
 * 
 * @author Love Diary Team
 * @version 1.0.0
 * @since 2024-01-01
 */

class CloudConfig {
  /**
   * 云存储环境配置
   * 注意：不同环境可能有不同的云存储ID
   */
  static CLOUD_ENV_CONFIG = {
    // 生产环境云存储ID cloud://cloud1-3gxic0n80d5341e3.636c-cloud1-3gxic0n80d5341e3-1351801414
    PRODUCTION: 'cloud1-3gxic0n80d5341e3.636c-cloud1-3gxic0n80d5341e3-1351801414',
    // 开发环境云存储ID（如果有的话）
    DEVELOPMENT: 'cloud1-3gxic0n80d5341e3.636c-cloud1-3gxic0n80d5341e3-1330048667'
  };

  /**
   * 路径前缀配置
   */
  static PATH_CONFIG = {
    // 头像存储路径
    AVATARS: 'avatars',
    // 情侣空间图片路径
    LOVE_DIARY_IMAGES: 'LoveDiaryImage',
    // 计划相关图片路径
    PLAN_IMAGES: 'planImages',
    // 其他文件路径
    OTHERS: 'others'
  };

  /**
   * 默认文件配置
   */
  static DEFAULT_FILES = {
    // 默认背景图片
    DEFAULT_BACKGROUND: 'DefaultBackgroundww.jpg'
  };

  /**
   * 获取当前环境的云存储ID
   * @returns {string} 云存储环境ID
   */
  static getCurrentCloudEnvId() {
    // 可以根据实际需要切换环境
    // 这里默认使用生产环境
    return this.CLOUD_ENV_CONFIG.PRODUCTION;
  }

  /**
   * 构建完整的云存储路径
   * @param {string} pathType - 路径类型（来自PATH_CONFIG）
   * @param {string} fileName - 文件名
   * @returns {string} 完整的云存储路径
   */
  static buildCloudPath(pathType, fileName) {
    const envId = this.getCurrentCloudEnvId();
    return `cloud://${envId}/${pathType}/${fileName}`;
  }

  /**
   * 构建头像云存储路径（完整路径，用于下载）
   * @param {string} openid - 用户openid
   * @param {number} timestamp - 时间戳（可选）
   * @returns {string} 头像云存储路径
   */
  static buildAvatarPath(openid, timestamp = null) {
    const fileName = timestamp 
      ? `${openid}_avatar_${timestamp}.jpg`
      : `${openid}_avatar.jpg`;
    return this.buildCloudPath(this.PATH_CONFIG.AVATARS, fileName);
  }

  /**
   * 构建头像上传路径（相对路径，用于上传）
   * @param {string} openid - 用户openid
   * @param {number} timestamp - 时间戳（可选）
   * @returns {string} 头像上传路径（不包含环境ID）
   */
  static buildAvatarUploadPath(openid, timestamp = null) {
    const fileName = timestamp 
      ? `${openid}_avatar_${timestamp}.jpg`
      : `${openid}_avatar.jpg`;
    return `${this.PATH_CONFIG.AVATARS}/${fileName}`;
  }

  /**
   * 构建恋爱日记图片上传路径（相对路径，用于上传）
   * @param {string} fileName - 文件名
   * @returns {string} 恋爱日记图片上传路径（不包含环境ID）
   */
  static buildLoveDiaryUploadPath(fileName) {
    return `${this.PATH_CONFIG.LOVE_DIARY_IMAGES}/${fileName}`;
  }

  /**
   * 构建计划图片上传路径（相对路径，用于上传）
   * @param {string} fileName - 文件名
   * @returns {string} 计划图片上传路径（不包含环境ID）
   */
  static buildPlanUploadPath(fileName) {
    return `${this.PATH_CONFIG.PLAN_IMAGES}/${fileName}`;
  }

  /**
   * 构建头像通配符路径（用于删除操作）
   * @param {string} openid - 用户openid
   * @returns {string} 头像通配符路径
   */
  static buildAvatarWildcardPath(openid) {
    const envId = this.getCurrentCloudEnvId();
    return `cloud://${envId}/${this.PATH_CONFIG.AVATARS}/${openid}_*`;
  }

  /**
   * 构建头像通配符相对路径（备用方案）
   * @param {string} openid - 用户openid
   * @returns {string} 头像通配符相对路径
   */
  static buildAvatarWildcardRelativePath(openid) {
    return `${this.PATH_CONFIG.AVATARS}/${openid}_*`;
  }

  /**
   * 构建默认背景图片路径
   * @returns {string} 默认背景图片路径
   */
  static buildDefaultBackgroundPath() {
    return this.buildCloudPath(
      this.PATH_CONFIG.LOVE_DIARY_IMAGES, 
      this.DEFAULT_FILES.DEFAULT_BACKGROUND
    );
  }

  /**
   * 构建情侣空间图片路径
   * @param {string} fileName - 文件名
   * @returns {string} 情侣空间图片路径
   */
  static buildLoveDiaryImagePath(fileName) {
    return this.buildCloudPath(this.PATH_CONFIG.LOVE_DIARY_IMAGES, fileName);
  }

  /**
   * 构建计划图片路径
   * @param {string} fileName - 文件名
   * @returns {string} 计划图片路径
   */
  static buildPlanImagePath(fileName) {
    return this.buildCloudPath(this.PATH_CONFIG.PLAN_IMAGES, fileName);
  }

  /**
   * 解析云存储路径，提取环境ID和文件路径
   * @param {string} cloudPath - 完整的云存储路径
   * @returns {object} 解析结果 {envId, filePath, fileName}
   */
  static parseCloudPath(cloudPath) {
    const match = cloudPath.match(/^cloud:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new Error('无效的云存储路径格式');
    }

    const [, envId, filePath] = match;
    const fileName = filePath.split('/').pop();
    
    return {
      envId,
      filePath,
      fileName
    };
  }

  /**
   * 验证云存储路径格式
   * @param {string} cloudPath - 云存储路径
   * @returns {boolean} 是否为有效格式
   */
  static isValidCloudPath(cloudPath) {
    try {
      this.parseCloudPath(cloudPath);
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = CloudConfig;
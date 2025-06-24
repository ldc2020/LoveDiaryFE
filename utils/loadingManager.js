/**
 * 通用加载状态管理工具类
 * 统一处理加载状态、错误提示、成功提示等UI反馈
 */

class LoadingManager {
  /**
   * 显示加载提示
   * @param {string} title 加载文本，默认'加载中...'
   * @param {boolean} mask 是否显示透明蒙层，默认true
   */
  static showLoading(title = '加载中...', mask = true) {
    wx.showLoading({
      title: title,
      mask: mask
    });
  }

  /**
   * 隐藏加载提示
   */
  static hideLoading() {
    wx.hideLoading();
  }

  /**
   * 显示成功提示
   * @param {string} title 提示文本
   * @param {number} duration 显示时长，默认1500ms
   */
  static showSuccess(title, duration = 1500) {
    wx.showToast({
      title: title,
      icon: 'success',
      duration: duration
    });
  }

  /**
   * 显示错误提示
   * @param {string} title 提示文本
   * @param {number} duration 显示时长，默认2000ms
   */
  static showError(title, duration = 2000) {
    wx.showToast({
      title: title,
      icon: 'error',
      duration: duration
    });
  }

  /**
   * 显示普通提示
   * @param {string} title 提示文本
   * @param {number} duration 显示时长，默认1500ms
   */
  static showToast(title, duration = 1500) {
    wx.showToast({
      title: title,
      icon: 'none',
      duration: duration
    });
  }

  /**
   * 显示模态对话框
   * @param {Object} options 配置选项
   * @param {string} options.title 标题
   * @param {string} options.content 内容
   * @param {boolean} options.showCancel 是否显示取消按钮，默认true
   * @param {string} options.confirmText 确认按钮文本，默认'确定'
   * @param {string} options.cancelText 取消按钮文本，默认'取消'
   * @returns {Promise<boolean>} 返回用户是否点击确认
   */
  static showModal(options = {}) {
    const {
      title = '提示',
      content = '',
      showCancel = true,
      confirmText = '确定',
      cancelText = '取消'
    } = options;

    return new Promise((resolve) => {
      wx.showModal({
        title: title,
        content: content,
        showCancel: showCancel,
        confirmText: confirmText,
        cancelText: cancelText,
        success: (res) => {
          resolve(res.confirm);
        },
        fail: () => {
          resolve(false);
        }
      });
    });
  }

  /**
   * 显示操作菜单
   * @param {Array<string>} itemList 菜单项列表
   * @param {string} alertText 提示文本，可选
   * @returns {Promise<number>} 返回用户选择的索引，取消返回-1
   */
  static showActionSheet(itemList, alertText = '') {
    return new Promise((resolve) => {
      const options = {
        itemList: itemList,
        success: (res) => {
          resolve(res.tapIndex);
        },
        fail: () => {
          resolve(-1);
        }
      };

      if (alertText) {
        options.alertText = alertText;
      }

      wx.showActionSheet(options);
    });
  }

  /**
   * 执行异步操作并自动管理加载状态
   * @param {Function} asyncFunction 异步函数
   * @param {Object} options 配置选项
   * @param {string} options.loadingText 加载文本，默认'处理中...'
   * @param {string} options.successText 成功提示文本，可选
   * @param {string} options.errorText 错误提示文本，默认'操作失败'
   * @param {boolean} options.showSuccess 是否显示成功提示，默认true
   * @param {boolean} options.showError 是否显示错误提示，默认true
   * @returns {Promise<any>} 返回异步函数的结果
   */
  static async executeWithLoading(asyncFunction, options = {}) {
    const {
      loadingText = '处理中...',
      successText = '',
      errorText = '操作失败',
      showSuccess = true,
      showError = true
    } = options;

    this.showLoading(loadingText);

    try {
      const result = await asyncFunction();
      this.hideLoading();
      
      if (showSuccess && successText) {
        this.showSuccess(successText);
      }
      
      return result;
    } catch (error) {
      this.hideLoading();
      
      if (showError) {
        this.showError(errorText);
      }
      
      console.error('执行异步操作失败:', error);
      throw error;
    }
  }

  /**
   * 防抖执行函数
   * @param {Function} func 要执行的函数
   * @param {number} delay 延迟时间，默认300ms
   * @returns {Function} 防抖后的函数
   */
  static debounce(func, delay = 300) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  /**
   * 节流执行函数
   * @param {Function} func 要执行的函数
   * @param {number} limit 时间间隔，默认300ms
   * @returns {Function} 节流后的函数
   */
  static throttle(func, limit = 300) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * 重试机制
   * @param {Function} asyncFunction 异步函数
   * @param {number} maxRetries 最大重试次数，默认3
   * @param {number} delay 重试间隔，默认1000ms
   * @returns {Promise<any>} 返回异步函数的结果
   */
  static async retry(asyncFunction, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await asyncFunction();
      } catch (error) {
        lastError = error;
        console.warn(`第${i + 1}次尝试失败:`, error);
        
        if (i < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * 检查网络状态
   * @returns {Promise<boolean>} 返回是否有网络连接
   */
  static async checkNetworkStatus() {
    return new Promise((resolve) => {
      wx.getNetworkType({
        success: (res) => {
          resolve(res.networkType !== 'none');
        },
        fail: () => {
          resolve(false);
        }
      });
    });
  }

  /**
   * 网络状态检查装饰器
   * @param {Function} asyncFunction 异步函数
   * @param {string} offlineMessage 离线提示信息
   * @returns {Promise<any>} 返回异步函数的结果
   */
  static async executeWithNetworkCheck(asyncFunction, offlineMessage = '网络连接异常，请检查网络设置') {
    const hasNetwork = await this.checkNetworkStatus();
    
    if (!hasNetwork) {
      this.showError(offlineMessage);
      throw new Error('网络连接异常');
    }
    
    return await asyncFunction();
  }

  /**
   * 页面导航 - 保留当前页面，跳转到应用内的某个页面
   * @param {string} url 需要跳转的应用内非 tabBar 的页面的路径
   * @param {Object} options 额外配置选项
   * @param {Object} options.events 页面间通信接口，用于监听被打开页面发送到当前页面的数据
   * @returns {Promise<boolean>} 返回是否跳转成功
   */
  static navigateTo(url, options = {}) {
    return new Promise((resolve) => {
      const navigateOptions = {
        url: url,
        success: () => {
          resolve(true);
        },
        fail: (error) => {
          console.error('页面跳转失败:', error);
          this.showError('页面跳转失败');
          resolve(false);
        }
      };

      // 如果有页面间通信配置，添加到选项中
      if (options.events) {
        navigateOptions.events = options.events;
      }

      wx.navigateTo(navigateOptions);
    });
  }

  /**
   * 页面重定向 - 关闭当前页面，跳转到应用内的某个页面
   * @param {string} url 需要跳转的应用内非 tabBar 的页面的路径
   * @returns {Promise<boolean>} 返回是否跳转成功
   */
  static redirectTo(url) {
    return new Promise((resolve) => {
      wx.redirectTo({
        url: url,
        success: () => {
          resolve(true);
        },
        fail: (error) => {
          console.error('页面重定向失败:', error);
          this.showError('页面跳转失败');
          resolve(false);
        }
      });
    });
  }

  /**
   * 页面重启 - 关闭所有页面，打开到应用内的某个页面
   * @param {string} url 需要跳转的应用内页面路径
   * @returns {Promise<boolean>} 返回是否跳转成功
   */
  static reLaunch(url) {
    return new Promise((resolve) => {
      wx.reLaunch({
        url: url,
        success: () => {
          resolve(true);
        },
        fail: (error) => {
          console.error('页面重启失败:', error);
          this.showError('页面跳转失败');
          resolve(false);
        }
      });
    });
  }

  /**
   * 切换到 tabBar 页面
   * @param {string} url 需要跳转的 tabBar 页面的路径
   * @returns {Promise<boolean>} 返回是否跳转成功
   */
  static switchTab(url) {
    return new Promise((resolve) => {
      wx.switchTab({
        url: url,
        success: () => {
          resolve(true);
        },
        fail: (error) => {
          console.error('切换tabBar失败:', error);
          this.showError('页面跳转失败');
          resolve(false);
        }
      });
    });
  }

  /**
   * 返回上一页面
   * @param {number} delta 返回的页面数，默认1
   * @returns {Promise<boolean>} 返回是否操作成功
   */
  static navigateBack(delta = 1) {
    return new Promise((resolve) => {
      wx.navigateBack({
        delta: delta,
        success: () => {
          resolve(true);
        },
        fail: (error) => {
          console.error('页面返回失败:', error);
          this.showError('页面返回失败');
          resolve(false);
        }
      });
    });
  }
}

module.exports = LoadingManager;
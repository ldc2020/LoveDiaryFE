// app.js
// 引入工具类
const StorageManager = require('./utils/storageManager');
const LoadingManager = require('./utils/loadingManager');

App({
  
  onLaunch() {
    // 异步初始化云开发，避免阻塞启动
    this.initCloudAsync();
    
    // 立即检查用户状态，不等待云开发初始化
    this.checkUserStatus();
  },

  /**
   * 异步初始化云开发
   */
  async initCloudAsync() {
    try {
      await wx.cloud.init({
        env: 'cloud1-3gxic0n80d5341e3'
      });
      console.log('云开发初始化成功');
      // 云开发初始化完成后的回调
      this.onCloudReady();
    } catch (error) {
      console.error('云开发初始化失败:', error);
    }
  },

  /**
   * 云开发就绪后的回调
   */
  onCloudReady() {
    // 云开发初始化完成后可以执行的操作
    console.log('云开发已就绪，可以进行云端操作');
  },

  /**
   * 检查用户状态
   */
  checkUserStatus() {
    // 检查用户是否已注册
    const userInfo = StorageManager.getStorage('userInfo');
    if (userInfo) {
      // 用户已注册，检查绑定状态
      const bindStatus = StorageManager.getStorage('bindStatus');
      if (bindStatus === 'bound') {
        // 已绑定，跳转到首页
        LoadingManager.navigateTo('/pages/home/home', true);
      } else {
        // 未绑定，跳转到绑定页面
        LoadingManager.navigateTo('/pages/bind/bind', true);
      }
    } else {
      // 首次登录，获取用户信息并注册
      this.registerUser();
    }
  },

  /**
   * 用户首次登录注册
   */
  registerUser() {
    // 跳转到登录页面，让用户输入信息
    LoadingManager.navigateTo('/pages/index/index', true);
  },

  globalData: {
    userInfo: null
  }
})

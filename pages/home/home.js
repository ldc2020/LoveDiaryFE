// ... existing code ...
  onLoad(options) {
    // 初始化云能力
    wx.cloud.init({
      env: 'cloud1-3gxic0n80d5341e3', // 替换为你的环境 ID
      traceUser: true
    });

    // 直接展示云端默认背景图片
    const cloudPath = 'cloud://cloud1-3gxic0n80d5341e3.636c-cloud1-3gxic0n80d5341e3-1351801414/LoveDiaryImage/DefaultBackgroundww.jpg';
    this.setData({ backgroundImage: cloudPath });

    // 从本地存储加载保存的图片
    const savedImages = wx.getStorageSync('showcaseImages');
    if (savedImages && savedImages.length > 0) {
      this.setData({ images: savedImages });
    }
  },
// ... existing code ...
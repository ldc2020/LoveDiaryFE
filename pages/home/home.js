// pages/home/home.js
Page({

  /**
   * 页面的初始数据
   */
  data: {
    backgroundImage: '', // 默认背景图路径
    CarouselImages: [
    
    ],
    showSettingsPopup: false,
    handlePageTap: '',
    // 长按删除相关状态
    showDeleteMode: false,
    currentDragImage: '',
    currentDragIndex: -1,
    showTrashCan: false,
    // 拖拽位置
    dragX: 0,
    dragY: 0,
    isOverTrashCan: false,
    // 用户信息
    userInfo: null
  },
  
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
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
    
    // 云开发已在app.js中初始化，无需重复初始化

    // 加载背景图片
    const cachedBackgroundImage = wx.getStorageSync('showbackgroundImage');
    
    
    if (cachedBackgroundImage) {
      // 如果本地存储中有背景图片，直接使用
      this.setData({ backgroundImage: cachedBackgroundImage });
    } else {
      // 如果本地没有背景图片，从云端下载默认背景图并保存
      const cloudPath = 'cloud://cloud1-3gxic0n80d5341e3.636c-cloud1-3gxic0n80d5341e3-1351801414/LoveDiaryImage/DefaultBackgroundww.jpg';
      wx.cloud.downloadFile({
        fileID: cloudPath,
        success: res => {
          // 使用统一的图片保存方法保存背景图
          this.unifiedSaveImagesToStorage([res.tempFilePath], 'backgroundImage',true);
        },
        fail: err => {
          console.error('下载默认背景图片失败:', err);
          wx.showToast({
            title: '加载默认背景失败',
            icon: 'error'
          });
        }
      });
    }

    // 从本地存储加载轮播图片
    const savedImages = wx.getStorageSync('showCarouselImages');
    if (savedImages && savedImages.length > 0) {
      this.setData({ CarouselImages: savedImages });
    }
    
    // 初始化用户信息
    this.initUserInfo();
  },
  


  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 切换设置弹出框显示状态
   */
  toggleSettings() {
    const newState = !this.data.showSettingsPopup;
    this.setData({ 
      showSettingsPopup: newState,
      handlePageTap: newState ? 'handlePageTap' : ''
    });
  },

  /**
   * 隐藏设置弹出框
   */
  hideSettings() {
    this.setData({ 
      showSettingsPopup: false,
      handlePageTap: ''
    });
  },
  
  /**
   * 阻止事件冒泡
   */
  stopPropagation() {
    // 空函数，仅用于阻止事件冒泡
  },
  
  /**
   * 处理页面点击事件，关闭弹出框
   */
  handlePageTap() {
    if (this.data.showSettingsPopup) {
      this.setData({ 
        showSettingsPopup: false,
        handlePageTap: ''
      });
    }
  },
  

  
  /**
   * 压缩图片
   */
  async compressImage(tempFilePath) {
    return new Promise((resolve, reject) => {
      // 对于轮播图，使用更高的压缩比例以节省存储空间，但保持原始比例
      wx.compressImage({
        src: tempFilePath,
        quality: 60, // 压缩质量，范围0-100，60为较好的平衡点
        // 移除 compressedWidth 和 compressedHeight 以保持原始比例
        success: (res) => {
          console.log('图片压缩成功:', {
            原始路径: tempFilePath,
            压缩后路径: res.tempFilePath
          });
          resolve(res.tempFilePath);
        },
        fail: (err) => {
          console.log('图片压缩失败，使用原图:', err);
          // 压缩失败时使用原图
          resolve(tempFilePath);
        }
      });
    });
  },

  /**
   * 追加保存多张图片到本地存储（带压缩功能）
   */
  async unifiedSaveImagesToStorage(tempFilePaths, dataKey, isFirstLoad, oldImages = []) {
    const savedPaths = [];
    let savedCount = 0;
    wx.showLoading({ title: '压缩并保存图片中...' });
    
    if (!tempFilePaths || tempFilePaths.length === 0) {
      wx.hideLoading();
      wx.showToast({ title: '未选择图片', icon: 'none' });
      return;
    }
    
    const fs = wx.getFileSystemManager();
    
    // 只在更新模式下（oldImages为空）删除旧文件
    if (oldImages.length === 0) {
      const oldPaths = wx.getStorageSync(`show${dataKey}`) || [];
      oldPaths.forEach(filePath => {
        fs.removeSavedFile({
          filePath,
          success: (res) => {
            console.log('删除旧文件成功:', res);
          },
          fail: (err) => {
            console.log('删除旧文件失败:', err);
          }
        });
      });
    }

    // 先压缩所有图片
    try {
      const compressedPaths = await Promise.all(
        tempFilePaths.map(tempPath => this.compressImage(tempPath))
      );
      
      // 保存压缩后的图片
      compressedPaths.forEach((compressedPath, index) => {
        fs.saveFile({
          tempFilePath: compressedPath,
          success: (saveRes) => {
            savedPaths.push(saveRes.savedFilePath);
            savedCount++;
            if (savedCount === compressedPaths.length) {
              const allImages = oldImages.concat(savedPaths);
              wx.setStorageSync(`show${dataKey}`, allImages);
              this.setData({ [dataKey]: allImages });
              wx.hideLoading();
              if (!isFirstLoad) {
                wx.showToast({ 
                  title: oldImages.length > 0 ? '图片压缩并追加成功' : '图片压缩并更新成功', 
                  icon: 'success' 
                });
              }
            }
          },
          fail: (err) => {
            savedCount++;
            console.log('保存压缩图片失败:', err.errMsg);
            if (savedCount === compressedPaths.length) {
              const allImages = oldImages.concat(savedPaths);
              if (savedPaths.length > 0) { 
                wx.setStorageSync(`show${dataKey}`, allImages);
                this.setData({ [dataKey]: allImages });
                wx.hideLoading();
                wx.showToast({ title: '部分图片保存失败', icon: 'none' });
              } else {
                wx.hideLoading();
                wx.showToast({ title: '保存图片失败', icon: 'error' });
              }
            }
          }
        });
      });
    } catch (error) {
      console.error('图片压缩过程出错:', error);
      wx.hideLoading();
      wx.showToast({ title: '图片处理失败', icon: 'error' });
    }
  },
  /*
    选择图片逻辑
    */
  chooseImages(addOrUpdate,maxCnt,dataKey,isFirstLoad){
    wx.showActionSheet({
      itemList: ['从相册选择', '拍照'],
      success: (res) => {
        const sourceType = res.tapIndex === 0 ? ['album'] : ['camera'];
        wx.chooseMedia({
          mediaType: ['image'],
          count: maxCnt, // 最多可选9张
          sizeType: ['compressed'], // 优化：只使用压缩图片，提升性能
          sourceType: sourceType,
          success: (res) => {
            const tempFiles = res.tempFiles;
            const tempFilePaths = tempFiles.map(file => file.tempFilePath);
            // 先获取原有图片
            let oldImages = this.data[dataKey] || [];
            // 追加保存新图片
            addOrUpdate == 'add' ? this.unifiedSaveImagesToStorage(tempFilePaths, dataKey,isFirstLoad, oldImages) :
             this.unifiedSaveImagesToStorage(tempFilePaths, dataKey,isFirstLoad);
            
            this.setData({ showSettingsPopup: false, handlePageTap: '' });
          },
          fail: (err) => {
            wx.showToast({ title: '选择图片失败', icon: 'error' });
          }
        });
      }
    });
  },
  /**
   * 更换背景图片
   */
  updateBackground() {
    this.hideSettings();
    this.chooseImages('update',1,'backgroundImage',false);
  },

  /**
   * 追加轮播图片
   */
  appendCarouselImages() {
    this.hideSettings();
    this.chooseImages('add',9,'CarouselImages',false);
  },

  /**
   * 更换轮播图片
   */
  updateCarouselImages() {
    this.hideSettings();
    this.chooseImages('update',9,'CarouselImages',false);
  },

  /**
   * 长按轮播图片开始删除模式
   */
  onLongPressImage(e) {
    const index = e.currentTarget.dataset.index;
    const imageSrc = this.data.CarouselImages[index];
    
    this.setData({
      showDeleteMode: true,
      currentDragImage: imageSrc,
      currentDragIndex: index,
      showTrashCan: true
    });
    
    wx.vibrateShort(); // 震动反馈
  },

  /**
   * 拖拽移动事件（优化性能）
   */
  onTouchMove(e) {
    if (!this.data.showDeleteMode) return;
    
    const touch = e.touches[0];
    const { clientX, clientY } = touch;
    
    // 节流优化：减少setData调用频率
    if (!this.dragThrottleTimer) {
      this.dragThrottleTimer = setTimeout(() => {
        // 检测是否在删除区域
        const windowInfo = wx.getWindowInfo();
        const windowHeight = windowInfo.windowHeight;
        const trashCanArea = windowHeight * 0.8;
        const isOverTrash = clientY > trashCanArea;
        
        // 更新拖拽位置和删除区域状态
        this.setData({
          dragX: clientX,
          dragY: clientY,
          isOverTrashCan: isOverTrash
        });
        
        this.dragThrottleTimer = null;
      }, 16); // 约60fps
    }
  },

  /**
   * 拖拽结束事件
   */
  onTouchEnd(e) {
    if (!this.data.showDeleteMode) return;
    
    const touch = e.changedTouches[0];
    const { clientX, clientY } = touch;
    
    // 获取垃圾桶区域位置（这里简化为屏幕下方区域）
     const windowInfo = wx.getWindowInfo();
     const windowHeight = windowInfo.windowHeight;
     const trashCanArea = windowHeight * 0.8; // 垃圾桶区域在屏幕下方20%
    
    if (clientY > trashCanArea) {
      // 拖拽到垃圾桶区域，执行删除
      this.deleteImageByIndex(this.data.currentDragIndex);
    }
    
    // 重置删除模式状态
    this.resetDeleteMode();
  },

  /**
   * 重置删除模式状态
   */
  resetDeleteMode() {
    // 清理节流定时器
    if (this.dragThrottleTimer) {
      clearTimeout(this.dragThrottleTimer);
      this.dragThrottleTimer = null;
    }
    
    this.setData({
      showDeleteMode: false,
      currentDragImage: '',
      currentDragIndex: -1,
      showTrashCan: false,
      dragX: 0,
      dragY: 0,
      isOverTrashCan: false
    });
  },

  /**
   * 根据索引删除图片（独立方法）
   * @param {number} index - 要删除的图片索引
   * @param {string} dataKey - 数据键名，默认为'CarouselImages'
   */
  deleteImageByIndex(index, dataKey = 'CarouselImages') {
    const images = this.data[dataKey] || [];
    
    if (index < 0 || index >= images.length) {
      wx.showToast({
        title: '删除失败：索引无效',
        icon: 'error'
      });
      return false;
    }
    
    // 删除指定索引的图片
    const updatedImages = images.filter((_, i) => i !== index);
    
    // 更新本地存储和页面数据
    wx.setStorageSync(`show${dataKey}`, updatedImages);
    this.setData({ [dataKey]: updatedImages });
    
    wx.showToast({
      title: '删除成功',
      icon: 'success'
    });
    
    return true;
  },

  /**
   * 根据图片路径删除图片（独立方法）
   * @param {string} imagePath - 要删除的图片路径
   * @param {string} dataKey - 数据键名，默认为'CarouselImages'
   */
  deleteImageByPath(imagePath, dataKey = 'CarouselImages') {
    const images = this.data[dataKey] || [];
    const index = images.findIndex(img => img === imagePath);
    
    if (index === -1) {
      wx.showToast({
        title: '删除失败：图片不存在',
        icon: 'error'
      });
      return false;
    }
    
    return this.deleteImageByIndex(index, dataKey);
  },

  
  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  },

  /**
   * 初始化用户信息
   */
  async initUserInfo() {
    try {
      // 先从本地缓存获取
      let userInfo = wx.getStorageSync('userInfo');
      if (userInfo) {
        this.setData({ userInfo });
        return;
      }
      
      // 如果本地没有，则获取用户信息
      const res = await wx.cloud.callFunction({
        name: 'login'
      });
      
      userInfo = {
        openid: res.result.openid,
        nickname: '用户' + res.result.openid.slice(-4),
        avatarUrl: ''
      };
      
      wx.setStorageSync('userInfo', userInfo);
      this.setData({ userInfo });
      
    } catch (error) {
      console.error('初始化用户信息失败:', error);
    }
  },

  /**
   * 修改用户昵称
   */
  changeName() {
    this.hideSettings();
    const currentName = this.data.userInfo?.nickname || '';
    
    wx.showModal({
      title: '修改昵称',
      content: '请输入新的昵称',
      editable: true,
      placeholderText: currentName,
      success: (res) => {
        if (res.confirm && res.content && res.content.trim()) {
          this.updateUserName(res.content.trim());
        }
      }
    });
  },

  /**
   * 更新用户昵称
   */
  async updateUserName(newName) {
    wx.showLoading({ title: '更新中...' });
    
    try {
      const userInfo = { ...this.data.userInfo, nickname: newName };
      
      // 更新本地存储
      wx.setStorageSync('userInfo', userInfo);
      
      // 更新页面数据
      this.setData({ userInfo });
      
      wx.hideLoading();
      wx.showToast({ title: '昵称更新成功', icon: 'success' });
      
    } catch (error) {
      console.error('更新昵称失败:', error);
      wx.hideLoading();
      wx.showToast({ title: '更新失败', icon: 'error' });
    }
  },

  /**
   * 修改用户头像
   */
  changeAvatar() {
    this.hideSettings();
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        if (res.tempFiles && res.tempFiles.length > 0) {
          this.updateUserAvatar(res.tempFiles[0].tempFilePath);
        }
      },
      fail: (error) => {
        console.error('选择头像失败:', error);
        wx.showToast({ title: '选择头像失败', icon: 'error' });
      }
    });
  },

  /**
   * 更新用户头像
   */
  async updateUserAvatar(tempFilePath) {
    wx.showLoading({ title: '更新头像中...' });
    
    try {
      // 保存临时文件到本地永久路径
      const fs = wx.getFileSystemManager();
      const userId = wx.getStorageSync('userId') || wx.getStorageSync('openid');
      const localPath = `${wx.env.USER_DATA_PATH}/avatar_${userId}_${Date.now()}.jpg`;
      
      // 复制临时文件到永久路径
      fs.copyFileSync(tempFilePath, localPath);
      
      // 上传头像到云端
      const cloudAvatarUrl = await this.uploadAvatarToCloud(tempFilePath);
      
      // 更新数据库中的用户信息（存储云端地址）
      await wx.cloud.database().collection('ld_user_info').where({
        $or: [
          { userId: userId }
        ]
      }).update({
        data: {
          avatarUrl: cloudAvatarUrl,
          updateTime: new Date()
        }
      });
      
      // 本地存储保存本地头像地址
      const userInfo = { ...this.data.userInfo, avatarUrl: localPath };
      
      // 更新本地存储
      wx.setStorageSync('userInfo', userInfo);
      
      // 更新页面数据
      this.setData({ userInfo });
      
      wx.hideLoading();
      wx.showToast({ title: '头像更新成功', icon: 'success' });
      
    } catch (error) {
      console.error('更新头像失败:', error);
      wx.hideLoading();
      wx.showToast({ title: '更新头像失败', icon: 'error' });
    }
  },

  /**
   * 上传头像到云端
   */
  async uploadAvatarToCloud(tempFilePath) {
    try {
      // 生成云端文件路径
      const userId = wx.getStorageSync('userId') || wx.getStorageSync('openid');
      const timestamp = Date.now();
      const cloudPath = `avatars/${userId}_${timestamp}.jpg`;
      
      console.log('开始上传头像到云端:', { tempFilePath, cloudPath });
      
      // 上传文件到云存储
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: tempFilePath
      });
      
      console.log('头像上传成功:', uploadResult.fileID);
      return uploadResult.fileID;
      
    } catch (error) {
      console.error('上传头像到云端失败:', error);
      throw error;
    }
  },

  /**
   * 显示解绑确认弹窗
   */
  showUnbindConfirm() {
    this.hideSettings();
    wx.showModal({
      title: '解除绑定',
      content: '确定要解除情侣绑定吗？解绑后双方的绑定关系都将被清除，需要重新绑定才能使用情侣功能。',
      confirmText: '确定解绑',
      confirmColor: '#ff4757',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.performUnbind();
        }
      }
    });
  },

  /**
   * 执行解绑操作
   */
  async performUnbind() {
    wx.showLoading({ title: '解绑中...' });
    
    try {
      const userId = wx.getStorageSync('userId') || wx.getStorageSync('openid');
      const coupleId = wx.getStorageSync('coupleId');
      const partnerId = wx.getStorageSync('partnerId');
      
      if (!userId || !coupleId || !partnerId) {
        throw new Error('缺少必要的绑定信息');
      }
      
      console.log('开始解绑操作:', { userId, coupleId, partnerId });
      
      // 调用云函数执行解绑操作
      const result = await wx.cloud.callFunction({
        name: 'unbindCouple',
        data: {
          userId: userId,
          coupleId: coupleId,
          partnerId: partnerId
        }
      });
      
      console.log('解绑云函数结果:', result);
      
      if (result.result && result.result.success) {
        // 清除本地存储的绑定相关数据
        wx.removeStorageSync('coupleId');
        wx.removeStorageSync('partnerId');
        wx.removeStorageSync('partnerInfo');
        wx.removeStorageSync('bindStatus');
        wx.removeStorageSync('bindTime');
        
        console.log('本地绑定数据已清除');
        
        wx.hideLoading();
        wx.showToast({ 
          title: '解绑成功', 
          icon: 'success',
          duration: 2000
        });
        
        // 延迟跳转到绑定页面
        setTimeout(() => {
          wx.reLaunch({
            url: '/pages/bind/bind'
          });
        }, 2000);
        
      } else {
        throw new Error(result.result?.message || '解绑失败');
      }
      
    } catch (error) {
      console.error('解绑操作失败:', error);
      wx.hideLoading();
      wx.showModal({
        title: '解绑失败',
        content: error.message || '解绑过程中发生错误，请稍后重试',
        showCancel: false,
        confirmText: '确定'
      });
    }
  }
  
})
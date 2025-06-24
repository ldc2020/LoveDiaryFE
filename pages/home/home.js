// pages/home/home.js
const CompressUtil = require('../../utils/compressUtil');
const CloudConfig = require('../../utils/cloudConfig');
const ImageHandler = require('../../utils/imageHandler');
const LoadingManager = require('../../utils/loadingManager');
const StorageManager = require('../../utils/storageManager');

Page({

  /**
   * 保存单个图片到本地永久路径（统一使用images目录）
   * 自动压缩图片到100k左右
   * @deprecated 使用 ImageHandler.compressAndSaveImages 替代
   */
  async saveImageToLocal(tempFilePath) {
    try {
      const savedPaths = await ImageHandler.compressAndSaveImages([tempFilePath], {
        targetSize: 100 * 1024,
        showLoading: false
      });
      return savedPaths[0];
    } catch (error) {
      console.error('压缩保存图片到本地失败:', error);
      throw error;
    }
  },



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
    const coupleId = StorageManager.getStorage('coupleId');
    const bindStatus = StorageManager.getStorage('bindStatus');
    
    if (!coupleId || bindStatus !== 'bound') {
      // 未绑定，跳转到绑定页面
      LoadingManager.navigateTo('/pages/bind/bind', true);
      return;
    }
    
    // 云开发已在app.js中初始化，无需重复初始化

    // 加载背景图片
    const cachedBackgroundImage = StorageManager.getStorage('showbackgroundImage');
    
    
    if (cachedBackgroundImage) {
      // 如果本地存储中有背景图片，直接使用
      this.setData({ backgroundImage: cachedBackgroundImage });
    } else {
      // 如果本地没有背景图片，从云端下载默认背景图并保存
      const cloudPath = CloudConfig.buildDefaultBackgroundPath();
      wx.cloud.downloadFile({
        fileID: cloudPath,
        success: res => {
          // 使用统一的图片保存方法保存背景图
          this.unifiedSaveImagesToStorage([res.tempFilePath], 'backgroundImage',true);
        },
        fail: err => {
          console.error('下载默认背景图片失败:', err);
          LoadingManager.showToast('加载默认背景失败', 'error');
        }
      });
    }

    // 从本地存储加载轮播图片
    const savedImages = StorageManager.getStorage('showCarouselImages');
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
    // 检查并更新用户信息（5分钟缓存机制）
    this.checkAndUpdateUserInfo();
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
   * @deprecated 使用 ImageHandler.compressImage 替代
   */
  async compressImage(tempFilePath) {
    return await ImageHandler.compressImage(tempFilePath);
  },

  /**
   * 追加保存多张图片到本地存储（带压缩功能）
   * @deprecated 使用 ImageHandler.compressAndSaveImages 和 StorageManager 替代
   */
  async unifiedSaveImagesToStorage(tempFilePaths, dataKey, isFirstLoad, oldImages = []) {
    try {
      if (!tempFilePaths || tempFilePaths.length === 0) {
        LoadingManager.showToast('未选择图片');
        return;
      }

      // 删除旧文件（仅在更新模式下）
      if (oldImages.length === 0) {
        const oldPaths = StorageManager.getStorage(`show${dataKey}`, []);
        await ImageHandler.removeLocalFiles(oldPaths);
      }

      // 压缩并保存图片
      const savedPaths = await ImageHandler.compressAndSaveImages(tempFilePaths, {
        loadingText: '压缩并保存图片中...'
      });

      // 合并图片路径
      const allImages = oldImages.concat(savedPaths);
      
      // 更新存储和页面数据
      await StorageManager.setStorage(`show${dataKey}`, allImages);
      this.setData({ [dataKey]: allImages });
      
      if (!isFirstLoad) {
        const message = oldImages.length > 0 ? '图片压缩并追加成功' : '图片压缩并更新成功';
        LoadingManager.showSuccess(message);
      }
    } catch (error) {
      console.error('保存图片失败:', error);
      LoadingManager.showError('图片处理失败');
    }
  },
  /*
    选择图片逻辑
    */
  /**
   * 选择图片
   * @deprecated 使用 ImageHandler.chooseImages 替代
   */
  async chooseImages(addOrUpdate, maxCnt, dataKey, isFirstLoad) {
    try {
      const tempFilePaths = await ImageHandler.chooseImages({
        count: maxCnt,
        showActionSheet: true
      });
      
      if (!tempFilePaths || tempFilePaths.length === 0) {
        return;
      }
      
      // 获取原有图片
      const oldImages = addOrUpdate === 'add' ? (this.data[dataKey] || []) : [];
      
      // 保存图片
      await this.unifiedSaveImagesToStorage(tempFilePaths, dataKey, isFirstLoad, oldImages);
      
      this.setData({ showSettingsPopup: false, handlePageTap: '' });
    } catch (error) {
      console.error('选择图片失败:', error);
      LoadingManager.showError('选择图片失败');
    }
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
  async deleteImageByIndex(index, dataKey = 'CarouselImages') {
    const images = this.data[dataKey] || [];
    
    if (index < 0 || index >= images.length) {
      LoadingManager.showError('删除失败：索引无效');
      return false;
    }
    
    try {
      // 删除本地文件
      const imagePath = images[index];
      await ImageHandler.removeLocalFiles([imagePath]);
      
      // 删除指定索引的图片
      const updatedImages = images.filter((_, i) => i !== index);
      
      // 更新本地存储和页面数据
      await StorageManager.setStorage(`show${dataKey}`, updatedImages);
      this.setData({ [dataKey]: updatedImages });
      
      LoadingManager.showSuccess('删除成功');
      return true;
    } catch (error) {
      console.error('删除图片失败:', error);
      LoadingManager.showError('删除失败');
      return false;
    }
  },

  /**
   * 根据图片路径删除图片（独立方法）
   * @param {string} imagePath - 要删除的图片路径
   * @param {string} dataKey - 数据键名，默认为'CarouselImages'
   */
  async deleteImageByPath(imagePath, dataKey = 'CarouselImages') {
    const images = this.data[dataKey] || [];
    const index = images.findIndex(img => img === imagePath);
    
    if (index === -1) {
      LoadingManager.showError('删除失败：图片不存在');
      return false;
    }
    
    return await this.deleteImageByIndex(index, dataKey);
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
   * 检查并更新用户信息（5分钟缓存机制）
   */
  async checkAndUpdateUserInfo() {
    try {
      // 检查是否有正在进行的用户信息处理（避免与index页面冲突）
      const isProcessingUserInfo = StorageManager.getStorage('isProcessingUserInfo');
      if (isProcessingUserInfo) {
        console.log('用户信息正在处理中，跳过本次更新');
        // 从缓存加载用户信息
        const userInfo = StorageManager.getStorage('userInfo');
        if (userInfo) {
          this.setData({ userInfo });
        }
        return;
      }
      
      const lastUpdateTime = StorageManager.getStorage('userInfoLastUpdate') || 0;
      const currentTime = Date.now();
      const fiveMinutes = 5 * 60 * 1000; // 5分钟的毫秒数
      // const fiveMinutes = 1 * 1000; // 5分钟的毫秒数

      // 如果距离上次更新超过5分钟，则从云端更新
      if (currentTime - lastUpdateTime > fiveMinutes) {
        console.log('用户信息缓存已过期，从云端更新');
        await this.updateUserInfoFromCloud();
        StorageManager.setStorage('userInfoLastUpdate', currentTime);
      } else {
        console.log('使用缓存的用户信息');
        // 从缓存加载用户信息
        const userInfo = StorageManager.getStorage('userInfo');
        if (userInfo) {
          this.setData({ userInfo });
        }
      }
    } catch (error) {
      console.error('检查并更新用户信息失败:', error);
    }
  },

  /**
   * 从云端更新情侣信息
   * 主要用于同步情侣的最新信息到本地
   */
  async updateUserInfoFromCloud() {
    try {
      const partnerId = StorageManager.getStorage('partnerId');
      const coupleId = StorageManager.getStorage('coupleId');
      const bindStatus = StorageManager.getStorage('bindStatus');
      
      // 检查是否已绑定情侣
      if (!partnerId || !coupleId || bindStatus !== 'bound') {
        console.log('未绑定情侣，跳过情侣信息更新');
        return;
      }

      // 查询云端最新情侣信息
      const db = wx.cloud.database();
      const partnerResult = await db.collection('ld_user_info')
        .where({ 
            openid: partnerId 
        })
        .get();
        
      if (partnerResult.data && partnerResult.data.length > 0) {
        const cloudPartnerInfo = partnerResult.data[0];
        
        // 获取当前本地存储的情侣信息
        const localPartnerInfo = StorageManager.getStorage('partnerInfo') || {};
        // 构建更新后的情侣信息对象
        const updatedPartnerInfo = {
          nickName: cloudPartnerInfo.nickName || localPartnerInfo.nickName || '',
          avatarUrl: localPartnerInfo.avatarUrl || '', // 保持本地头像路径
          cloudAvatarUrl: localPartnerInfo.cloudAvatarUrl || '' // 保持本地云端图片
        };

        // 如果云端头像URL发生变化，下载并更新本地头像
        if (cloudPartnerInfo.avatarUrl && 
            cloudPartnerInfo.avatarUrl !== localPartnerInfo.cloudAvatarUrl) {
          try {
            console.log('检测到情侣头像更新，开始下载新头像');
            const downloadRes = await wx.cloud.downloadFile({
              fileID: cloudPartnerInfo.avatarUrl
            });
            
            if (downloadRes.tempFilePath) {
              // 保存情侣头像到本地永久路径
              const savedPath = await this.saveImageToLocal(downloadRes.tempFilePath);
              updatedPartnerInfo.avatarUrl = savedPath;
              updatedPartnerInfo.cloudAvatarUrl = cloudPartnerInfo.avatarUrl;
              
              // 清理旧的情侣头像文件
              if (localPartnerInfo.avatarUrl && localPartnerInfo.avatarUrl !== savedPath) {
                try {
                  const fs = wx.getFileSystemManager();
                  await new Promise((resolve, reject) => {
                    fs.removeSavedFile({
                      filePath: localPartnerInfo.avatarUrl,
                      success: resolve,
                      fail: reject
                    });
                  });
                  console.log('已清理旧的情侣头像文件:', localPartnerInfo.avatarUrl);
                } catch (cleanError) {
                  console.warn('清理旧情侣头像文件失败:', cleanError);
                }
              }
            }
          } catch (downloadError) {
            console.error('下载情侣头像失败:', downloadError);
            // 下载失败时保持原有信息
            updatedPartnerInfo.avatarUrl = localPartnerInfo.avatarUrl;
            updatedPartnerInfo.cloudAvatarUrl = localPartnerInfo.cloudAvatarUrl;
          }
        }

        // 更新本地存储的情侣信息
        StorageManager.setStorage('partnerInfo', updatedPartnerInfo);
        
        // 更新页面数据中的情侣信息（如果页面有相关显示）
        if (this.data.partnerInfo) {
          this.setData({ partnerInfo: updatedPartnerInfo });
        }
        
        console.log('情侣信息已从云端更新:', updatedPartnerInfo.nickName);
      } else {
        console.log('云端未找到情侣信息');
      }
    } catch (error) {
      console.error('从云端更新情侣信息失败:', error);
    }
  },

  /**
   * 初始化用户信息
   */
  async initUserInfo() {
    try {
      // 先从本地缓存获取
      let userInfo = StorageManager.getStorage('userInfo');
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
      
      StorageManager.setStorage('userInfo', userInfo);
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
    
    LoadingManager.showModal({
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
    LoadingManager.showLoading('更新中...');
    
    try {
      // 获取当前用户信息并更新昵称字段
      const userInfo = StorageManager.getStorage('userInfo') || {};
      const updatedUserInfo = {
        ...userInfo,
        nickName: newName,  // 使用统一的字段名nickName
        nickname: newName   // 保持兼容性
      };
      
      // 1. 先更新本地存储
      StorageManager.setStorage('userInfo', updatedUserInfo);
      
      // 2. 更新页面数据
      this.setData({ userInfo: updatedUserInfo });
      
      
      // 3. 最后更新云端数据库
      const openid = StorageManager.getStorage('openid');
      if (openid) {
        await wx.cloud.database().collection('ld_user_info').where({
          openid: openid
        }).update({
          data: {
            nickName: newName,
            updateTime: new Date()
          }
        });
        
        console.log('云端昵称更新成功:', newName);
      }
      
      LoadingManager.hideLoading();
      LoadingManager.showToast('昵称更新成功', 'success');
      
    } catch (error) {
      console.error('更新昵称失败:', error);
      LoadingManager.hideLoading();
      LoadingManager.showToast('更新失败', 'error');
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
        LoadingManager.showToast('选择头像失败', 'error');
      }
    });
  },

  /**
   * 更新用户头像
   */
  async updateUserAvatar(tempFilePath) {
    LoadingManager.showLoading('更新头像中...');
    
    try {
      // 验证输入参数
      if (!tempFilePath || typeof tempFilePath !== 'string') {
        throw new Error('无效的图片文件路径');
      }
      
      const openid = StorageManager.getStorage('openid');
      
      // 1. 先删除旧的本地头像文件
      await this.deleteOldLocalAvatar(openid);
      
      // 2. 使用优化后的方法保存头像到images目录
      const localAvatarPath = await this.saveImageToLocal(tempFilePath);
      
      // 3. 更新本地存储和页面数据
      const userInfo = StorageManager.getStorage('userInfo') || {};
      const updatedUserInfo = {
        ...userInfo,
        avatarUrl: localAvatarPath,  // 使用本地路径
        localAvatarPath: localAvatarPath  // 更新本地头像路径
      };
      
      StorageManager.setStorage('userInfo', updatedUserInfo);
      this.setData({ userInfo: updatedUserInfo });
      
      // 4. 异步上传头像到云端并更新云端数据库
       this.uploadAvatarToCloudAsync(localAvatarPath, openid);
      
      LoadingManager.hideLoading();
      LoadingManager.showToast('头像更新成功', 'success');
      
    } catch (error) {
      console.error('更新头像失败:', error);
      LoadingManager.hideLoading();
      
      // 根据错误类型提供不同的提示信息
      let errorMessage = '更新头像失败';
      if (error.message && error.message.includes('tempFilePath参数无效')) {
        errorMessage = '图片文件无效，请重新选择';
      } else if (error.message && error.message.includes('图片压缩失败')) {
        errorMessage = '图片处理失败，请重新尝试';
      } else if (error.message && error.message.includes('无效的图片文件路径')) {
        errorMessage = '图片选择失败，请重新选择';
      }
      
      LoadingManager.showToast(errorMessage, 'error');
    }
  },

  /**
   * 异步上传头像到云端并更新数据库
   */
  async uploadAvatarToCloudAsync(tempFilePath, openid) {
    try {
      // 上传头像到云端
      const cloudAvatarUrl = await this.uploadAvatarToCloud(tempFilePath);
      
      // 更新云端数据库中的用户信息
      if (openid && cloudAvatarUrl) {
        await wx.cloud.database().collection('ld_user_info').where({
          openid: openid
        }).update({
          data: {
            avatarUrl: cloudAvatarUrl,
            updateTime: new Date()
          }
        });
        
        // 同时更新本地存储中的云端头像URL
        const userInfo = StorageManager.getStorage('userInfo') || {};
        userInfo.cloudAvatarUrl = cloudAvatarUrl;
        StorageManager.setStorage('userInfo', userInfo);
        
        console.log('云端头像更新成功:', cloudAvatarUrl);
      }
    } catch (error) {
      console.error('云端头像更新失败:', error);
      // 云端更新失败不影响本地使用
    }
  },

  /**
   * 上传头像到云端（覆盖模式，删除旧头像）
   */
  async uploadAvatarToCloud(localFilePath) {
    try {
      const openid = StorageManager.getStorage('openid');
      
      // 1. 先删除用户的旧头像文件
      await this.deleteOldUserAvatar(openid);
      
      // 2. 生成新的云端文件路径（添加时间戳确保每次更新都有不同的URL）
      const timestamp = Date.now();
      const cloudPath = CloudConfig.buildAvatarUploadPath(openid, timestamp);
      
      console.log('开始上传头像到云端:', { localFilePath, cloudPath });
      
      // 3. 检查本地文件是否存在
      const fs = wx.getFileSystemManager();
      try {
        fs.accessSync(localFilePath);
        console.log('本地头像文件存在，开始上传');
      } catch (error) {
        console.error('本地头像文件不存在:', localFilePath);
        throw new Error('本地头像文件不存在');
      }
      
      // 4. 上传本地头像文件到云存储
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: localFilePath
      });
      
      console.log('头像上传成功:', uploadResult.fileID);
      return uploadResult.fileID;
      
    } catch (error) {
      console.error('上传头像到云端失败:', error);
      throw error;
    }
  },

  /**
   * 删除用户旧的云端头像
   * 从缓存中获取cloudAvatarUrl进行精确删除
   */
  async deleteOldUserAvatar(openid) {
    try {
      // 从缓存中获取用户信息
      const userInfo = StorageManager.getStorage('userInfo') || {};
      const cloudAvatarUrl = userInfo.cloudAvatarUrl;
      
      // 如果缓存中有云端头像URL，则进行精确删除
      if (cloudAvatarUrl && cloudAvatarUrl.startsWith('cloud://')) {
        console.log('开始删除缓存中的云端头像:', cloudAvatarUrl);
        try {
          await wx.cloud.deleteFile({
            fileList: [cloudAvatarUrl]
          });
          console.log('云端头像删除成功:', cloudAvatarUrl);
          
          // 删除成功后清空缓存中的cloudAvatarUrl
          userInfo.cloudAvatarUrl = '';
          StorageManager.setStorage('userInfo', userInfo);
          
        } catch (deleteError) {
          console.log('云端头像删除失败，错误信息:', deleteError.message);
        }
      } else {
        console.log('缓存中没有有效的云端头像URL，跳过删除操作');
      }
      
      console.log('旧云端头像清理完成');
    } catch (error) {
      console.error('删除旧头像文件失败:', error);
      // 删除失败不影响新头像上传，继续执行
    }
  },

  /**
   * 显示解绑锁死提示弹窗
   */
  showUnbindConfirm() {
    this.hideSettings();
    LoadingManager.showModal({
      title: '已被锁死，无法解绑 😏',
      content: '哈哈，想解绑？门都没有！你们的爱情已经被我牢牢锁住了~',
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#ff6b9d'
    });
  },

  /**
   * 删除用户的旧本地头像文件
   */
  async deleteOldLocalAvatar(openid) {
    try {
      const userInfo = StorageManager.getStorage('userInfo');
      const oldLocalAvatarPath = userInfo?.localAvatarPath;
      
      console.log('检查需要删除的旧头像:', oldLocalAvatarPath);
      
      if (oldLocalAvatarPath) {
        const fs = wx.getFileSystemManager();
        
        try {
          // 先检查文件是否存在
          await new Promise((resolve, reject) => {
            fs.access({
              path: oldLocalAvatarPath,
              success: resolve,
              fail: reject
            });
          });
          
          console.log('旧头像文件存在，开始删除:', oldLocalAvatarPath);
          
          // 根据路径类型选择删除方法
          // 对于saveFile保存的文件，使用removeSavedFile
          await new Promise((resolve, reject) => {
            fs.removeSavedFile({
              filePath: oldLocalAvatarPath,
              success: resolve,
              fail: reject
            });
          });
          
          
          console.log('旧本地头像删除成功:', oldLocalAvatarPath);
          
        } catch (accessError) {
          console.log('旧头像文件不存在，无需删除:', oldLocalAvatarPath);
        }
      } else {
        console.log('没有需要删除的本地头像文件');
      }
    } catch (error) {
      console.error('删除旧本地头像失败:', error);
      // 删除失败不影响后续流程
    }
  }
  
});
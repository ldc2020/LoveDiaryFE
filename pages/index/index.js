// index.js
// 自己的头像保存在- 存储位置 ： wx.env.USER_DATA_PATH 目录下
// - 文件命名 ： avatar_${用户ID}_${时间戳}.jpg
const defaultAvatarUrl = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

Page({
  data: {
    motto: 'love daily',
    userInfo: {
      avatarUrl: defaultAvatarUrl,
      nickName: '',
    },
    hasUserInfo: false,
    canIUseGetUserProfile: wx.canIUse('getUserProfile'),
    canIUseNicknameComp: wx.canIUse('input.type.nickname'),
    isRegistering: false, // 防重复注册标志
  },
  bindViewTap() {
    wx.navigateTo({
      url: '../logs/logs'
    })
  },
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    const { nickName } = this.data.userInfo
    const hasUserInfo = nickName && avatarUrl && avatarUrl !== defaultAvatarUrl
    this.setData({
      "userInfo.avatarUrl": avatarUrl,
      hasUserInfo: hasUserInfo,
    }, () => {
      // 当头像和昵称都完成时自动注册
      if (hasUserInfo && !this.data.isRegistering) {
        this.registerUserToCloud();
      }
    })
  },
  onInputChange(e) {
    const nickName = e.detail.value
    const { avatarUrl } = this.data.userInfo
    const hasUserInfo = nickName && avatarUrl && avatarUrl !== defaultAvatarUrl
    this.setData({
      "userInfo.nickName": nickName,
      hasUserInfo: hasUserInfo,
    }, () => {
      // 当头像和昵称都完成时自动注册
      if (hasUserInfo && !this.data.isRegistering) {
        this.registerUserToCloud();
      }
    })
  },
  getUserProfile(e) {
    wx.getUserProfile({
      desc: '展示用户信息',
      success: (res) => {
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        }, () => {
          this.registerUserToCloud();
        })
      }
    })
  },

  /**
   * 注册或更新用户信息到云端
   */
  async registerUserToCloud() {
    // 防重复调用
    if (this.data.isRegistering) {
      return;
    }
    
    this.setData({ isRegistering: true });
    
    // 显示加载提示
    wx.showLoading({
      title: '初始化用户数据中...',
      mask: true
    });
    
    try {
      // 获取用户openid
      const loginRes = await wx.cloud.callFunction({
        name: 'login'
      });
      
      const openid = loginRes.result.openid;
      wx.setStorageSync('openid', openid)
      // 检查用户是否已在数据库中存在
      const db = wx.cloud.database();
      const userQuery = await db.collection('ld_user_info').where({
        openid: openid
      }).get();
      
      if (userQuery.data.length > 0) {
        // 用户已存在，更新用户信息
        console.log('用户已存在，更新用户信息');
        const existingUser = userQuery.data[0];
        await this.updateUserInfo(db, existingUser, openid);
      } else {
        // 用户不存在，创建新用户
        await this.createNewUser(db, openid);
      }
      
    } catch (error) {
      console.error('注册或更新用户失败:', error);
      wx.showToast({
        title: '操作失败，请重试',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
      this.setData({ isRegistering: false });
    }
  },

  /**
   * 更新已存在用户的信息
   */
  async updateUserInfo(db, existingUser, openid) {
    // 1. 先将本地信息更新到云端
    await this.updateCloudUserInfo(db, existingUser._id, openid);
    
    // 2. 再从云端获取完整用户数据并更新到本地
    await this.syncCloudDataToLocal(db, existingUser, openid);
    
    // 3. 等待头像处理完成后再跳转，确保数据一致性
    await this.processAvatarAsync(db, existingUser._id, openid);
    
    // 4. 所有异步操作完成后再检查绑定状态并跳转
    this.checkBindingStatusAndNavigate(existingUser);
  },

  /**
   * 将本地信息更新到云端
   */
  async updateCloudUserInfo(db, recordId, openid) {
    try {
      console.log('开始将本地信息更新到云端');
      
      // 更新云端用户信息
      await db.collection('ld_user_info').doc(recordId).update({
        data: {
          nickName: this.data.userInfo.nickName,
          avatarUrl: this.data.userInfo.avatarUrl,
          updateTime: new Date()
        }
      });
      
      console.log('本地信息已更新到云端');
      
    } catch (error) {
      console.error('更新云端用户信息失败:', error);
      // 更新失败不影响后续流程
    }
  },

  /**
   * 同步云端数据到本地存储
   */
  async syncCloudDataToLocal(db, existingUser, openid) {
    try {
      console.log('开始从云端拉取最新信息到本地存储');
      
      // 1. 重新查询云端最新用户信息（因为之前已经更新过）
      const latestUserQuery = await db.collection('ld_user_info').where({
        openid: openid
      }).get();
      
      const latestUser = latestUserQuery.data.length > 0 ? latestUserQuery.data[0] : existingUser;
      
      // 2. 使用云端最新数据更新本地存储
      const userInfo = {
        openid: openid,
        nickName: latestUser.nickName,  // 使用云端最新昵称
        avatarUrl: this.data.userInfo.avatarUrl,  // 保持当前选择的头像地址
        localAvatarPath: '',  // 稍后异步更新
        cloudAvatarUrl: latestUser.avatarUrl || ''  // 云端头像地址
      };
      
      // 如果云端有头像文件名称前缀且与当前头像前缀不同，下载并缓存到本地
      
      if (latestUser.avatarUrl && latestUser.avatarUrl !== this.data.userInfo.avatarUrl) {
        const localAvatarPath = await this.downloadAndCacheAvatar(latestUser.avatarUrl, openid);
        userInfo.avatarUrl = localAvatarPath;  // 使用本地缓存的头像路径
        userInfo.localAvatarPath = localAvatarPath;
      }
      
      // 3. 更新本地存储
      wx.setStorageSync('userInfo', userInfo);
      wx.setStorageSync('myInviteCode', latestUser.inviteCode);
      
      // 4. 更新页面数据
      this.setData({ userInfo });
      
      // 5. 检查绑定状态（使用最新用户数据）
      if (latestUser.coupleId && latestUser.partnerId) {
        console.log('用户已绑定，同步绑定信息到本地');
        
        // 保存绑定状态
        wx.setStorageSync('bindStatus', 'bound');
        wx.setStorageSync('coupleId', latestUser.coupleId);
        wx.setStorageSync('partnerId', latestUser.partnerId);
        
        // 获取伴侣信息
        const partnerQuery = await db.collection('ld_user_info').where({
            openid: latestUser.partnerId 
        }).get();
        
        if (partnerQuery.data.length > 0) {
          const partnerInfo = partnerQuery.data[0];
          
          // 下载并缓存伴侣头像
          const localPartnerAvatarUrl = await this.downloadAndCacheAvatar(partnerInfo.avatarUrl, partnerInfo.openid || partnerInfo.userId);
          
          // 保存伴侣信息到本地（包含云端地址用于后续比较）
          wx.setStorageSync('partnerInfo', {
            nickName: partnerInfo.nickName,
            avatarUrl: localPartnerAvatarUrl, // 本地缓存的头像路径
            cloudAvatarUrl: partnerInfo.avatarUrl // 云端头像URL，用于比较是否需要更新
          });
          
          console.log('已同步伴侣信息到本地:', partnerInfo.nickName);
        }
      } else {
        console.log('用户未绑定，设置为未绑定状态');
        wx.setStorageSync('bindStatus', 'unbound');
        // 清除可能存在的旧绑定信息
        wx.removeStorageSync('coupleId');
        wx.removeStorageSync('partnerId');
        wx.removeStorageSync('partnerInfo');
      }
      
      // 注意：本人头像不需要下载，因为用户注册时就可以获取
       // 只有情侣头像需要从云端下载
      
      console.log('云端数据同步完成');
      
    } catch (error) {
      console.error('同步云端数据到本地失败:', error);
      // 即使同步失败，也保存基本用户信息，确保用户能正常使用
      const basicUserInfo = {
        openid: openid,
        nickName: this.data.userInfo.nickName,
        avatarUrl: this.data.userInfo.avatarUrl,
        localAvatarPath: '',
        cloudAvatarUrl: ''
      };
      wx.setStorageSync('userInfo', basicUserInfo);
      wx.setStorageSync('myInviteCode', existingUser.inviteCode || '');
    }
  },

  /**
   * 下载并缓存头像到本地
   */
  async downloadAndCacheAvatar(cloudAvatarUrl, userId) {
    try {
      // 如果是默认头像或本地路径，直接返回
      if (!cloudAvatarUrl || cloudAvatarUrl.startsWith('wxfile://') || cloudAvatarUrl.startsWith('http://tmp/') || cloudAvatarUrl.includes('mmbiz.qpic.cn')) {
        return cloudAvatarUrl;
      }
      
      // 检查本地是否已有缓存
      const cacheKey = `avatar_${userId}`;
      const cachedPath = wx.getStorageSync(cacheKey);
      if (cachedPath) {
        // 检查缓存文件是否存在
        try {
          const fs = wx.getFileSystemManager();
          fs.accessSync(cachedPath);
          console.log('使用缓存头像:', cachedPath);
          return cachedPath;
        } catch (e) {
          // 缓存文件不存在，清除缓存记录
          wx.removeStorageSync(cacheKey);
        }
      }
      
      console.log('开始下载头像:', cloudAvatarUrl);
      
      // 下载云端头像
      const downloadResult = await wx.cloud.downloadFile({
        fileID: cloudAvatarUrl
      });
      
      // 保存到本地
      const fs = wx.getFileSystemManager();
      const saveResult = await new Promise((resolve, reject) => {
        fs.saveFile({
          tempFilePath: downloadResult.tempFilePath,
          success: resolve,
          fail: reject
        });
      });
      
      // 缓存本地路径
      wx.setStorageSync(cacheKey, saveResult.savedFilePath);
      
      console.log('头像下载并缓存成功:', saveResult.savedFilePath);
      return saveResult.savedFilePath;
      
    } catch (error) {
      console.error('下载头像失败:', error);
      // 下载失败时返回原地址
      return cloudAvatarUrl;
    }
  },

  /**
   * 创建新用户
   */
  async createNewUser(db, openid) {
    // 先创建基本用户记录，不保存头像地址（等云端上传成功后再更新）
    const userRecord = await db.collection('ld_user_info').add({
      data: {
        openid: openid,
        userId: openid,
        nickName: this.data.userInfo.nickName,
        // avatarUrl 将在云端上传成功后异步更新
        createTime: new Date(),
        updateTime: new Date()
      }
    });
    
    // 保存基本信息到本地存储
    const basicUserInfo = {
      openid: openid,
      nickName: this.data.userInfo.nickName,
      avatarUrl: this.data.userInfo.avatarUrl,  // 原始头像地址
      localAvatarPath: '',  // 稍后更新
      cloudAvatarUrl: ''  // 稍后更新
    };
    
    wx.setStorageSync('userInfo', basicUserInfo);
    wx.setStorageSync('bindStatus', 'unbound');
    
    // 等待头像处理完成后再跳转，确保数据一致性
    await this.processAvatarAsync(db, userRecord._id, openid);
    
    // 头像处理完成后跳转到绑定页面
    wx.reLaunch({
      url: '/pages/bind/bind'
    });
  },

  /**
   * 异步处理头像上传和保存
   */
  async processAvatarAsync(db, recordId, openid) {
    try {
      // 设置处理状态标记，避免与home页面冲突
      wx.setStorageSync('isProcessingUserInfo', true);
      console.log('开始异步处理头像...', this.data.userInfo.avatarUrl);
      
      // 先保存临时文件到本地，避免临时文件失效
      const localAvatarPath = await this.saveAvatarToLocal(this.data.userInfo.avatarUrl);
      
      // 使用本地保存的文件上传到云端
      const cloudAvatarUrl = await this.uploadAvatarToCloud(localAvatarPath);
      
      // 更新数据库中的头像地址（只有成功获得云端URL时才更新）
      if (cloudAvatarUrl && cloudAvatarUrl !== '') {
        await db.collection('ld_user_info').doc(recordId).update({
          data: {
            avatarUrl: cloudAvatarUrl,
            updateTime: new Date()
          }
        });
        console.log('数据库头像地址已更新为云端URL:', cloudAvatarUrl);
      } else {
        console.warn('云端头像上传失败，数据库保持原状');
      }
      
      // 更新本地存储的用户信息
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo) {
        userInfo.localAvatarPath = localAvatarPath;
        userInfo.cloudAvatarUrl = cloudAvatarUrl;
        wx.setStorageSync('userInfo', userInfo);
      }
      
      console.log('头像处理完成:', { cloudAvatarUrl, localAvatarPath });
      
    } catch (error) {
      console.error('异步处理头像失败:', error);
      // 头像处理失败不影响用户正常使用
    } finally {
      // 清除处理状态标记
      wx.removeStorageSync('isProcessingUserInfo');
      console.log('用户信息处理状态已清除');
    }
  },

  /**
   * 上传头像到云端（覆盖模式，删除旧头像）
   * @param {string} localFilePath 本地文件路径
   * @returns {string} 云端文件URL
   */
  async uploadAvatarToCloud(localFilePath) {
    try {
      // 检查文件路径是否存在
      if (!localFilePath || localFilePath === '') {
        console.warn('本地文件路径为空，跳过上传');
        return '';
      }
      
      const openid = wx.getStorageSync('openid');
      
      // 先查找用户是否存在，如果存在则删除旧的云端头像
      await this.deleteOldCloudAvatar(openid);
      
      // 生成云端文件路径（使用固定文件名确保唯一性）
      const cloudPath = `avatars/${openid}_avatar.jpg`;
      
      console.log('开始上传头像到云端:', { localFilePath, cloudPath });
      
      // 上传文件到云存储
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: localFilePath
      });
      
      console.log('头像上传成功:', uploadResult.fileID);
      return uploadResult.fileID;
      
    } catch (error) {
      console.error('上传头像到云端失败:', error);
      // 上传失败时返回原地址
      return '';
    }
  },

  /**
   * 删除用户旧的云端头像
   */
  async deleteOldCloudAvatar(openid) {
    try {
      console.log('开始查找并删除旧的云端头像:', openid);
      
      // 查询数据库中的用户信息
      const db = wx.cloud.database();
      const userQuery = await db.collection('ld_user_info').where({
        openid: openid
      }).get();
      
      if (userQuery.data && userQuery.data.length > 0) {
        const userData = userQuery.data[0];
        const oldCloudAvatarUrl = userData.avatarUrl;
        
        // 如果存在云端头像地址且不是默认头像，则删除
        if (oldCloudAvatarUrl && 
            oldCloudAvatarUrl !== defaultAvatarUrl && 
            oldCloudAvatarUrl.startsWith('cloud://')) {
          
          console.log('找到旧的云端头像，准备删除:', oldCloudAvatarUrl);
          
          // 删除云存储中的旧头像文件
          await wx.cloud.deleteFile({
            fileList: [oldCloudAvatarUrl]
          });
          
          console.log('旧云端头像删除成功:', oldCloudAvatarUrl);
        } else {
          console.log('用户没有需要删除的云端头像');
        }
      } else {
        console.log('用户不存在，无需删除旧头像');
      }
      
    } catch (error) {
      console.error('删除旧云端头像失败:', error);
      // 删除失败不影响后续上传流程
    }
  },

  /**
   * 保存头像到本地永久存储（自动压缩到100k左右）
   */
  async saveAvatarToLocal(avatarUrl) {
    try {
      // 如果是默认头像URL，直接返回
      if (avatarUrl === defaultAvatarUrl) {
        return avatarUrl;
      }
      
      const openid = wx.getStorageSync('openid');
      
      // 删除之前的头像文件
      await this.deleteOldAvatar(openid);
      
      // 生成本地文件路径 - 保存到images目录
      const timestamp = Date.now();
      const fileName = `avatar_${openid}_${timestamp}.jpg`;
      const localPath = `./images/${fileName}`;
      
      console.log('开始压缩并保存头像到本地images目录:', { avatarUrl, localPath });
      
      // 压缩图片到100k左右
      const compressedResult = await this.compressImage(avatarUrl);
      
      // 使用saveFile保存压缩后的图片到永久存储
      const fs = wx.getFileSystemManager();
      const saveResult = await new Promise((resolve, reject) => {
        fs.saveFile({
          tempFilePath: compressedResult.tempFilePath,
          success: resolve,
          fail: reject
        });
      });
      
      console.log('压缩头像保存成功:', {
        originalSize: compressedResult.originalSize,
        compressedSize: compressedResult.compressedSize,
        savedPath: saveResult.savedFilePath
      });
      
      return saveResult.savedFilePath;
      
    } catch (error) {
      console.error('压缩保存头像到本地失败:', error);
      // 保存失败时返回原地址
      return avatarUrl;
    }
  },

  /**
   * 压缩图片到指定大小（默认100k左右）
   */
  async compressImage(tempFilePath, targetSize = 100 * 1024) {
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
      
      const originalSize = originalStats.size;
      console.log('原始图片大小:', this.formatFileSize(originalSize));
      
      // 如果原始图片已经小于目标大小，直接返回
      if (originalSize <= targetSize) {
        console.log('图片已经足够小，无需压缩');
        return {
          tempFilePath: tempFilePath,
          originalSize: originalSize,
          compressedSize: originalSize
        };
      }
      
      // 计算压缩质量（基于文件大小比例）
      let quality = Math.min(90, Math.max(20, Math.floor((targetSize / originalSize) * 100)));
      
      console.log('开始压缩图片，质量:', quality);
      
      // 压缩图片
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
      
      const compressedSize = compressedStats.size;
      console.log('压缩后图片大小:', this.formatFileSize(compressedSize));
      
      // 如果压缩后仍然太大，进行二次压缩
      if (compressedSize > targetSize && quality > 20) {
        quality = Math.max(20, Math.floor(quality * 0.7));
        console.log('文件仍然过大，进行二次压缩，质量:', quality);
        
        const secondCompressResult = await new Promise((resolve, reject) => {
          wx.compressImage({
            src: compressResult.tempFilePath,
            quality: quality,
            success: resolve,
            fail: reject
          });
        });
        
        const finalStats = await new Promise((resolve, reject) => {
          fs.stat({
            path: secondCompressResult.tempFilePath,
            success: resolve,
            fail: reject
          });
        });
        
        console.log('二次压缩后图片大小:', this.formatFileSize(finalStats.size));
        
        return {
          tempFilePath: secondCompressResult.tempFilePath,
          originalSize: originalSize,
          compressedSize: finalStats.size
        };
      }
      
      return {
        tempFilePath: compressResult.tempFilePath,
        originalSize: originalSize,
        compressedSize: compressedSize
      };
      
    } catch (error) {
      console.error('压缩图片失败:', error);
      // 压缩失败时返回原图片
      return {
        tempFilePath: tempFilePath,
        originalSize: 0,
        compressedSize: 0
      };
    }
  },

  /**
   * 格式化文件大小显示
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  /**
   * 删除旧的头像文件
   */
  async deleteOldAvatar(openid) {
    try {
      // 获取本地存储的用户信息
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo && userInfo.localAvatarPath && userInfo.localAvatarPath !== defaultAvatarUrl) {
        // 检查文件是否存在
        const fs = wx.getFileSystemManager();
        try {
          await fs.access({
            path: userInfo.localAvatarPath
          });
          // 文件存在，使用removeSavedFile删除永久存储的文件
          await new Promise((resolve, reject) => {
            fs.removeSavedFile({
              filePath: userInfo.localAvatarPath,
              success: resolve,
              fail: reject
            });
          });
          console.log('已删除旧头像文件:', userInfo.localAvatarPath);
        } catch (accessError) {
          // 文件不存在，无需删除
          console.log('旧头像文件不存在，无需删除');
        }
      }
    } catch (error) {
      console.error('删除旧头像文件失败:', error);
      // 删除失败不影响新头像保存
    }
  },

  /**
   * 检查绑定状态并导航
   */
  checkBindingStatusAndNavigate(userData) {
    if (userData.coupleId) {
      // 有绑定信息，保存到本地并跳转到首页
      wx.setStorageSync('coupleId', userData.coupleId);
      wx.setStorageSync('partnerId', userData.partnerId);
      wx.setStorageSync('bindStatus', 'bound');
      wx.reLaunch({
        url: '/pages/home/home'
      });
    } else {
      // 有注册信息但无绑定信息，跳转到绑定页面
      wx.setStorageSync('bindStatus', 'unbound');
      wx.reLaunch({
        url: '/pages/bind/bind'
      });
    }
  },

  
})

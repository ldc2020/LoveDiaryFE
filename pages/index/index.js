// index.js
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
    // 从云端获取完整用户数据并更新到本地
    await this.syncCloudDataToLocal(db, existingUser, openid);
    
    // 立即检查绑定状态并跳转，不等待头像处理完成
    this.checkBindingStatusAndNavigate(existingUser);
    
    // 异步处理头像上传和保存，不阻塞用户体验
    this.processAvatarAsync(db, existingUser._id, openid);
  },

  /**
   * 同步云端数据到本地存储
   */
  async syncCloudDataToLocal(db, existingUser, openid) {
    try {
      console.log('开始同步云端数据到本地存储');
      
      // 保存基本用户信息到本地存储
      const userInfo = {
        openid: openid,
        nickName: this.data.userInfo.nickName,
        avatarUrl: this.data.userInfo.avatarUrl,  // 原始头像地址
        localAvatarPath: '',  // 稍后异步更新
        cloudAvatarUrl: existingUser.avatarUrl || ''  // 云端头像地址
      };
      
      wx.setStorageSync('userInfo', userInfo);
      wx.setStorageSync('myInviteCode', existingUser.inviteCode);
      
      // 检查绑定状态
      if (existingUser.coupleId && existingUser.partnerId) {
        console.log('用户已绑定，同步绑定信息到本地');
        
        // 保存绑定状态
        wx.setStorageSync('bindStatus', 'bound');
        wx.setStorageSync('coupleId', existingUser.coupleId);
        wx.setStorageSync('partnerId', existingUser.partnerId);
        
        // 获取伴侣信息
        const partnerQuery = await db.collection('ld_user_info').where({
          $or: [
            { userId: existingUser.partnerId },
          ]
        }).get();
        
        if (partnerQuery.data.length > 0) {
          const partnerInfo = partnerQuery.data[0];
          
          // 下载并缓存伴侣头像
          const localPartnerAvatarUrl = await this.downloadAndCacheAvatar(partnerInfo.avatarUrl, partnerInfo.openid || partnerInfo.userId);
          
          // 保存伴侣信息到本地
          wx.setStorageSync('partnerInfo', {
            nickName: partnerInfo.nickName,
            avatarUrl: localPartnerAvatarUrl
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
    // 先创建基本用户记录，使用原始头像地址
    const userRecord = await db.collection('ld_user_info').add({
      data: {
        openid: openid,
        userId: openid,
        nickName: this.data.userInfo.nickName,
        avatarUrl: this.data.userInfo.avatarUrl,  // 先使用原始地址
        createTime: new Date(),
        updateTime: new Date()
      }
    });
    
    // 保存基本信息到本地存储，快速完成登录
    const basicUserInfo = {
      openid: openid,
      nickName: this.data.userInfo.nickName,
      avatarUrl: this.data.userInfo.avatarUrl,  // 原始头像地址
      localAvatarPath: '',  // 稍后异步更新
      cloudAvatarUrl: ''  // 稍后异步更新
    };
    
    wx.setStorageSync('userInfo', basicUserInfo);
    wx.setStorageSync('bindStatus', 'unbound');
    
    // 立即跳转到绑定页面，不等待头像处理完成
    wx.reLaunch({
      url: '/pages/bind/bind'
    });
    
    // 异步处理头像上传和保存，不阻塞用户体验
    this.processAvatarAsync(db, userRecord._id, openid);
  },

  /**
   * 异步处理头像上传和保存
   */
  async processAvatarAsync(db, recordId, openid) {
    try {
      console.log('开始异步处理头像...');
      
      // 并行处理头像上传和本地保存
      const [cloudAvatarUrl, localAvatarPath] = await Promise.all([
        this.uploadAvatarToCloud(this.data.userInfo.avatarUrl),
        this.saveAvatarToLocal(this.data.userInfo.avatarUrl)
      ]);
      
      // 更新数据库中的头像地址
      if (cloudAvatarUrl) {
        await db.collection('ld_user_info').doc(recordId).update({
          data: {
            avatarUrl: cloudAvatarUrl,
            updateTime: new Date()
          }
        });
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
    }
  },

  /**
   * 上传头像到云端
   */
  async uploadAvatarToCloud(localAvatarUrl) {
    try {
      // 如果是默认头像URL，直接返回
      if (localAvatarUrl === defaultAvatarUrl) {
        return localAvatarUrl;
      }
      
      const openid = wx.getStorageSync('openid');
      
      // 先查找用户是否存在，如果存在则删除旧的云端头像
      await this.deleteOldCloudAvatar(openid);
      
      // 生成云端文件路径
      const timestamp = Date.now();
      const cloudPath = `avatars/${openid}_${timestamp}.jpg`;
      
      console.log('开始上传头像到云端:', { localAvatarUrl, cloudPath });
      
      // 上传文件到云存储
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: localAvatarUrl
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
   * 保存头像文件到本地
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
      
      // 生成本地文件路径
      const timestamp = Date.now();
      const localPath = `${wx.env.USER_DATA_PATH}/avatar_${openid}_${timestamp}.jpg`;
      
      console.log('开始保存头像到本地:', { avatarUrl, localPath });
      
      // 复制文件到本地存储目录
      const copyResult = await wx.getFileSystemManager().copyFile({
        srcPath: avatarUrl,
        destPath: localPath
      });
      
      console.log('头像保存成功:', localPath);
      return localPath;
      
    } catch (error) {
      console.error('保存头像到本地失败:', error);
      // 保存失败时返回原地址
      return avatarUrl;
    }
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
          // 文件存在，删除它
          await fs.unlink({
            filePath: userInfo.localAvatarPath
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

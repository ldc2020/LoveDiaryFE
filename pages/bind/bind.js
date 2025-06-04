
Page({
  data: {
    bindStep: 1, // 当前步骤：1-获取用户信息，2-显示邀请码，3-输入对方邀请码
    userInfo: null,
    myCode: '',// 我的邀请码
    partnerCode: '',
    partnerInfo: null,
    loading: false
  },

  // 定时器ID
  bindCheckTimer: null,

  onLoad() {
    // 云开发已在app.js中初始化，无需重复初始化
    
    // 检查本地存储的用户信息和绑定状态
    this.checkUserStatus();
  },

  onShow() {
    // 页面显示时重新检查绑定状态，监控是否被对方绑定
    this.checkUserStatus();
    // 注意：startBindMonitoring会在checkUserStatus完成后，根据bindStep状态自动调用
  },

  onHide() {
    // 页面隐藏时停止监控
    this.stopBindMonitoring();
  },

  onUnload() {
    // 页面卸载时停止监控
    this.stopBindMonitoring();
  },

  /**
   * 启动绑定状态监控
   */
  startBindMonitoring() {
    // 清除之前的定时器
    this.stopBindMonitoring();
    
    // 只在显示邀请码步骤时启动监控
    if (this.data.bindStep === 2) {
      // 优化：延长检查间隔，减少频繁请求
      this.bindCheckTimer = setInterval(() => {
        this.checkBindingStatus();
      }, 3000); // 每3秒检查一次在·
    }
  },

  /**
   * 停止绑定状态监控
   */
  stopBindMonitoring() {
    if (this.bindCheckTimer) {
      // 移除console.log，减少输出
      clearInterval(this.bindCheckTimer);
      this.bindCheckTimer = null;
    }
  },

  /**
   * 检查绑定状态（用于定时监控）
   * 
   * 1. 查询自己的用户记录
   * 2. 如果已经有coupleId，说明已被绑定
   * 3. 如果没有coupleId，继续检查
   * 4. 如果有coupleId，说明已被绑定
   * 5. 保存绑定状态到本地
   * 6. 显示绑定成功提示
   * 7. 延迟跳转到首页
   */
  async checkBindingStatus() {
    try {
      const userInfo = this.data.userInfo;
      if (!userInfo) return;
      
      const db = wx.cloud.database();
      
      // 查询自己的用户记录
      const myUserQuery = await db.collection('ld_user_info').where({
        openid: userInfo.openid
      }).get();

      if (myUserQuery.data.length > 0) {
        const myUserInfo = myUserQuery.data[0];
        
        // 如果已经有coupleId，说明已被绑定
        if (myUserInfo.coupleId) {
          console.log('检测到已被其他人绑定，自动完成绑定流程');
          
          // 停止监控
          this.stopBindMonitoring();
          
          // 获取伴侣信息
          const partnerQuery = await db.collection('ld_user_info').where({
            $or: [
              { userId: myUserInfo.partnerId }
            ]
          }).get();
          
          // 保存绑定状态到本地
          wx.setStorageSync('bindStatus', 'bound');
          wx.setStorageSync('coupleId', myUserInfo.coupleId);
          wx.setStorageSync('partnerId', myUserInfo.partnerId);
          
          // 保存伴侣头像信息到本地
          if (partnerQuery.data.length > 0) {
            const partnerInfo = partnerQuery.data[0];
            // 下载并缓存伴侣头像
            const localAvatarUrl = await this.downloadAndCacheAvatar(partnerInfo.avatarUrl, partnerInfo.openid || partnerInfo.userId);
            wx.setStorageSync('partnerInfo', {
              nickName: partnerInfo.nickName,
              avatarUrl: localAvatarUrl
            });
            console.log('被动绑定 - 已保存伴侣信息:', partnerInfo.nickName, localAvatarUrl);
          }
          
          // 显示绑定成功提示
          wx.showToast({
            title: '对方已注册，绑定成功！',
            icon: 'success',
            duration: 2000
          });
          
          // 延迟跳转到首页
          setTimeout(() => {
            wx.reLaunch({
              url: '/pages/home/home'
            });
          }, 2000);
        }
      }
    } catch (error) {
      console.error('检查绑定状态失败:', error);
    }
  },

  /**
   * 检查用户状态
   * 
   * 1. 检查本地存储的绑定状态
   * 2. 如果已绑定，跳转到首页
   * 3. 如果未绑定，检查本地存储的用户信息和邀请码
   * 4. 如果有用户信息和邀请码，检查是否已被其他人绑定
   * 5. 如果没有用户信息但有邀请码，显示获取用户信息的步骤
   * 6. 如果没有用户信息和邀请码，需要获取用户信息
   * 7. 显示获取用户信息的步骤  
   * checkUserStatus->checkIfAlreadyBound->startBindMonitoring->checkBindingStatus
   */
  async checkUserStatus() {
    const userInfo = wx.getStorageSync('userInfo');
    const bindStatus = wx.getStorageSync('bindStatus');
    const myCode = wx.getStorageSync('myInviteCode');
    
    if (bindStatus === 'bound') {
      // 已绑定，跳转到首页
      wx.reLaunch({
        url: '/pages/home/home'
      });
      return;
    }
    
    // 如果有用户信息和邀请码，检查是否已被其他人绑定
    if (userInfo && myCode) {
      await this.checkIfAlreadyBound(userInfo, myCode);
      return;
    }
    
    // 如果有用户信息但没有邀请码，显示生成邀请码的步骤
    if (userInfo && !myCode) {
      this.setData({
        userInfo: userInfo,
        bindStep: 1.5 // 新增步骤：生成邀请码
      });
      // 生成邀请码后需要启动监控，这里先不启动，等生成邀请码后再启动
      return;
    }
    
    // 需要获取用户信息
    this.setData({
      bindStep: 1
    });
  },

  /**
   * 检查是否已被其他人绑定
   * 
   * 1. 查询自己的用户记录
   * 2. 如果已经有coupleId，说明已被绑定
   * 3. 如果没有coupleId，显示邀请码
   * 4. 启动绑定状态监控
   */
  async checkIfAlreadyBound(userInfo, myCode) {
    try {
      const db = wx.cloud.database();
      
      // 查询自己的用户记录
      const myUserQuery = await db.collection('ld_user_info').where({
        openid: userInfo.openid
      }).get();

      if (myUserQuery.data.length > 0) {
        const myUserInfo = myUserQuery.data[0];
        
        // 如果已经有coupleId，说明已被绑定
        if (myUserInfo.coupleId) {
          console.log('检测到已被其他人绑定，自动完成绑定流程');
          
          // 获取伴侣信息
          const partnerQuery = await db.collection('ld_user_info').where({
            $or: [
              { userId: myUserInfo.partnerId }
            ]
          }).get();
          
          // 保存绑定状态到本地
          wx.setStorageSync('bindStatus', 'bound');
          wx.setStorageSync('coupleId', myUserInfo.coupleId);
          wx.setStorageSync('partnerId', myUserInfo.partnerId);
          
          // 保存伴侣头像信息到本地
          if (partnerQuery.data.length > 0) {
            const partnerInfo = partnerQuery.data[0];
            // 下载并缓存伴侣头像
            const localAvatarUrl = await this.downloadAndCacheAvatar(partnerInfo.avatarUrl, partnerInfo.openid || partnerInfo.userId);
            wx.setStorageSync('partnerInfo', {
              nickName: partnerInfo.nickName,
              avatarUrl: localAvatarUrl
            });
            console.log('被动绑定检查 - 已保存伴侣信息:', partnerInfo.nickName, localAvatarUrl);
          }
          
          // 显示绑定成功提示
          wx.showToast({
            title: '已自动完成绑定！',
            icon: 'success',
            duration: 2000
          });
          
          // 延迟跳转到首页
          setTimeout(() => {
            wx.reLaunch({
              url: '/pages/home/home'
            });
          }, 1000);
          
          return;
        }
      }
      
      // 未被绑定，显示邀请码
      this.setData({
        userInfo: userInfo,
        myCode: myCode,
        bindStep: 2
      });
      
      // 启动定时监控
      this.startBindMonitoring();
      
    } catch (error) {
      console.error('检查绑定状态失败:', error);
      // 出错时仍然显示邀请码页面
      this.setData({
        userInfo: userInfo,
        myCode: myCode,
        bindStep: 2
      });
      
      // 启动定时监控
      this.startBindMonitoring();
    }
  },

  /**
   * 获取用户信息
   * 获取到用户信息后，生成邀请码并保存到云端和本地
   * 用户信息包括：openid, nickName, avatarUrl
   * 邀请码包括：时间戳+随机数+openid哈希
   * 
   */
  getUserInfo() {
    wx.getUserProfile({
      desc: '用于创建情侣空间',
      success: async (res) => {
        try {
          // 获取用户openid
          const loginRes = await wx.cloud.callFunction({
            name: 'login'
          });
          
          const userInfo = {
            openid: loginRes.result.openid,
            nickName: res.userInfo.nickName,
            avatarUrl: res.userInfo.avatarUrl
          };
          
          // 生成邀请码
          const myCode = this.generateInviteCode(userInfo.openid);
          
          // 保存用户信息到云端数据库
          await this.saveUserToDatabase(userInfo, myCode);
          
          this.setData({
            userInfo: userInfo,
            myCode: myCode,
            bindStep: 2
          });
          
          // 启动绑定状态监控
          this.startBindMonitoring();
          
          // 保存到本地存储
          wx.setStorageSync('userInfo', userInfo);
          wx.setStorageSync('myInviteCode', myCode);
          
        } catch (error) {
          console.error('获取用户信息失败:', error);
          wx.showToast({ title: '获取用户信息失败', icon: 'error' });
        }
      },
      fail: () => {
        wx.showToast({ title: '需要授权才能使用', icon: 'none' });
      }
    });
  },

  /**
   * 获取用户授权信息
   */
  wxGetUserProfile() {
    return new Promise((resolve, reject) => {
      wx.getUserProfile({
        desc: '用于情侣绑定功能',
        success: (res) => {
          resolve(res.userInfo);
        },
        fail: reject
      });
    });
  },

  /**
   * 生成邀请码
   */
  generateInviteCode(openid) {
    // 基于openid生成唯一邀请码
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 4);
    const openidHash = openid.slice(-4);
    return `${timestamp}${random}${openidHash}`.toUpperCase();
  },

  /**
   * 生成我的邀请码
   */
  async generateMyInviteCode() {
    try {
      const userInfo = this.data.userInfo;
      if (!userInfo) {
        wx.showToast({ title: '用户信息不存在', icon: 'error' });
        return;
      }
      
      // 生成邀请码
      const myCode = this.generateInviteCode(userInfo.openid);
      
      // 更新数据库中的用户信息，添加邀请码
      const db = wx.cloud.database();
      const userQuery = await db.collection('ld_user_info').where({
        openid: userInfo.openid
      }).get();
      
      if (userQuery.data.length > 0) {
        await db.collection('ld_user_info').doc(userQuery.data[0]._id).update({
          data: {
            inviteCode: myCode,
            updateTime: new Date()
          }
        });
      }
      
      // 保存到本地存储
      wx.setStorageSync('myInviteCode', myCode);
      
      // 更新页面状态
      this.setData({
        myCode: myCode,
        bindStep: 2
      });
      
      // 启动绑定状态监控
      this.startBindMonitoring();
      
      wx.showToast({ title: '邀请码生成成功', icon: 'success' });
      
    } catch (error) {
      console.error('生成邀请码失败:', error);
      wx.showToast({ title: '生成邀请码失败', icon: 'error' });
    }
  },

  /**
   * 复制邀请码
   */
  copyInviteCode() {
    wx.setClipboardData({
      data: this.data.myCode,
      success: () => {
        wx.showToast({ title: '邀请码已复制', icon: 'success' });
      }
    });
  },

  /**
   * 下一步
   */
  nextStep() {
    this.setData({ bindStep: 3 });
  },

  /**
   * 对方邀请码输入
   */
  onPartnerCodeInput(e) {
    this.setData({ partnerCode: e.detail.value });
  },

  /**
   * 我方主动确认绑定
   * 
   * 1. 检查对方邀请码是否存在
   * 2. 检查对方是否已经绑定了其他人（不是自己）
   * 3. 如果对方已经绑定了自己，直接完成双向绑定
   * 4. 检查是否绑定自己
   * 5. 生成情侣ID
   * 6. 更新自己的用户记录
   * 7. 更新对方的用户记录
   * 8. 保存情侣头像信息到本地
   * 9. 保存绑定状态到本地
   */
  async confirmBind() {
    if (!this.data.partnerCode) {
      wx.showToast({ title: '请输入对方邀请码', icon: 'none' });
      return;
    }
    
    this.setData({ loading: true });
    
    try {
      // 处理情侣绑定逻辑
      const result = await this.processCoupleBinding();
      
      if (result.success) {
        // 绑定成功，直接跳转到首页
        wx.setStorageSync('bindStatus', 'bound');
        
        const successMessage = result.message || '绑定成功！';
        wx.showToast({ 
          title: successMessage, 
          icon: 'success',
          duration: 2000
        });
        
        setTimeout(() => {
          wx.reLaunch({
            url: '/pages/home/home'
          });
        }, 2000);
      } else {
        wx.showToast({ title: result.message, icon: 'error' });
      }
      
    } catch (error) {
      console.error('绑定失败:', error);
      wx.showToast({ title: '绑定失败，请重试', icon: 'error' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 创建或更新用户记录
   * 
   * 1. 查询用户是否存在
   * 2. 如果存在，更新记录
   * 3. 如果不存在，创建新记录

   */
  async createOrUpdateUser(userData) {
    const db = wx.cloud.database();
    
    try {
      // 先查询用户是否存在
      const userQuery = await db.collection('ld_user_info').where({
        userId: userData.userId
      }).get();
      
      const userRecord = {
        userId: userData.userId,
        openid: userData.userInfo.openid,
        nickName: userData.userInfo.nickName,
        avatarUrl: userData.userInfo.cloudAvatarUrl || userData.userInfo.avatarUrl,
        inviteCode: userData.inviteCode,
        coupleId: userData.coupleId,
        partnerId: userData.partnerId,
        bindTime: new Date()
      };
      if (userQuery.data.length > 0) {
        // 用户存在，更新记录
        await db.collection('ld_user_info').doc(userQuery.data[0]._id).update({
          data: {
            ...userRecord,
            updateTime: new Date()
          }
        });
      } else {
        // 用户不存在，创建新记录
        await db.collection('ld_user_info').add({
          data: {
            ...userRecord,
            createTime: new Date(),
            updateTime: new Date()
          }
        });
      }
      
    } catch (error) {
      console.error('创建或更新用户失败:', error);
      throw error;
    }
  },

  /**
   * 处理情侣绑定
   * 
   * 1. 检查对方邀请码是否存在
   * 2. 检查对方是否已经绑定了其他人（不是自己）
   * 3. 如果对方已经绑定了自己，直接完成双向绑定
   * 4. 检查是否绑定自己
   * 5. 生成情侣ID
   * 6. 更新自己的用户记录
   * 7. 更新对方的用户记录
   * 8. 保存情侣头像信息到本地
   * 9. 保存绑定状态到本地
   *
   */
  async processCoupleBinding() {
    // 这个partnerCode是本人在输入框输入的邀请码
    const { partnerCode, userInfo, myCode } = this.data;
    const db = wx.cloud.database();
    
 
    try {

      // 检查对方邀请码是否存在
      const partnerQuery = await db.collection('ld_user_info').where({
        inviteCode: partnerCode
      }).get();
      
      if (partnerQuery.data.length === 0) {
        return { success: false, message: '对方邀请码不存在' };
      }
      
      const partnerInfo = partnerQuery.data[0];
      
      // 检查对方是否已经绑定了其他人（不是自己）
      if (partnerInfo.coupleId && partnerInfo.partnerId !== userInfo.openid) {
        return { success: false, message: '对方已经绑定其他人' };
      }
      
      // 如果对方已经绑定了自己，直接完成双向绑定
      if (partnerInfo.coupleId && partnerInfo.partnerId === userInfo.openid) {
        console.log('检测到对方已经绑定了自己，直接完成双向绑定');
        
        // 更新自己的用户记录
        await this.createOrUpdateUser({
          userId: userInfo.openid,
          userInfo: userInfo,
          inviteCode: myCode,
          coupleId: partnerInfo.coupleId,
          partnerId: partnerInfo.openid || partnerInfo.userId
        });
        
        // 保存到本地存储

        wx.setStorageSync('coupleId', partnerInfo.coupleId);
        wx.setStorageSync('partnerId', partnerInfo.openid || partnerInfo.userId);
        // 下载并缓存伴侣头像
        const localAvatarUrl = await this.downloadAndCacheAvatar(partnerInfo.avatarUrl, partnerInfo.openid || partnerInfo.userId);
        // 保存情侣头像信息到本地
        wx.setStorageSync('partnerInfo', {
          nickName: partnerInfo.nickName,
          avatarUrl: localAvatarUrl
        });
        
        // 验证存储结果

        return { 
          success: true, 
          partnerInfo: partnerInfo,
          message: '双向绑定完成！'
        };
      }
      
      // 检查是否绑定自己
      if (partnerCode === myCode.toUpperCase()) {
        return { success: false, message: '不能绑定自己' };
      }
      
      // 生成情侣ID
      const coupleId = `couple_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const userId = userInfo.openid;
      const partnerId = partnerInfo.userId || partnerInfo.openid;
      
      // 调试日志：输出关键信息
      console.log('绑定信息调试:');
      console.log('userId:', userId);
      console.log('partnerId:', partnerId);
      console.log('partnerInfo:', partnerInfo);
      console.log('coupleId:', coupleId);
      
      // 创建或更新自己的用户记录
      await this.createOrUpdateUser({
        userId: userId,
        userInfo: userInfo,
        inviteCode: myCode,
        coupleId: coupleId,
        partnerId: partnerId
      });
      
      // 更新对方的用户记录
      console.log(partnerInfo._id);
      await db.collection('ld_user_info').doc(partnerInfo._id).update({
        data: {
          coupleId: coupleId,
          partnerId: userId,
          bindTime: new Date()
        }
      });
      
      // 检查是否已存在情侣绑定记录
      const existingCouple = await db.collection('ld_couples').where({
        $or: [
          { user1: userId, user2: partnerId },
          { user1: partnerId, user2: userId }
        ]
      }).get();
      
      const coupleData = {
        coupleId: coupleId,
        user1: userId,
        user2: partnerId,
        user1Code: myCode,
        user2Code: partnerCode,
        bindTime: new Date(),
        status: 'active',
        updateTime: new Date()
      };
      
      if (existingCouple.data.length > 0) {
        // 更新现有的情侣绑定记录
        await db.collection('ld_couples').doc(existingCouple.data[0]._id).update({
          data: coupleData
        });
        console.log('已更新现有的情侣绑定记录');
      } else {
        // 创建新的情侣绑定记录
        await db.collection('ld_couples').add({
          data: {
            ...coupleData,
            createTime: new Date()
          }
        });
        console.log('已创建新的情侣绑定记录');
      }
      
      // 保存到本地存储
      console.log('开始保存到本地存储:');
      console.log('保存coupleId:', coupleId);
      console.log('保存partnerId:', partnerId);
      
      wx.setStorageSync('coupleId', coupleId);
      wx.setStorageSync('partnerId', partnerId);
      
      // 下载并缓存伴侣头像
      const localAvatarUrl = await this.downloadAndCacheAvatar(partnerInfo.avatarUrl, partnerInfo.openid || partnerInfo.userId);
      // 保存情侣头像信息到本地
      wx.setStorageSync('partnerInfo', {
        nickName: partnerInfo.nickName,
        avatarUrl: localAvatarUrl
      });
      
      // 验证存储结果
      console.log('存储后验证:');
      console.log('读取coupleId:', wx.getStorageSync('coupleId'));
      console.log('读取partnerId:', wx.getStorageSync('partnerId'));
      console.log('读取partnerInfo:', wx.getStorageSync('partnerInfo'));
      
      return { 
        success: true, 
        partnerInfo: partnerInfo 
      };
      
    } catch (error) {
      console.error('绑定处理失败:', error);
      return { success: false, message: '绑定失败，请重试' };
    }
  },

  /**
   * 重新开始
   */
  restart() {
    this.setData({
      bindStep: 1,
      partnerCode: '',
      loading: false
    });
  },

  /**
   * 保存用户信息到云端数据库
   */
  async saveUserToDatabase(userInfo, inviteCode) {
    try {
      const db = wx.cloud.database();
      
      // 检查用户是否已存在
      const existingUser = await db.collection('ld_user_info').where({
        openid: userInfo.openid
      }).get();
      
      const userData = {
        openid: userInfo.openid,
        nickName: userInfo.nickName,
        avatarUrl: userInfo.cloudAvatarUrl || userInfo.avatarUrl,
        inviteCode: inviteCode,
        createTime: new Date(),
        updateTime: new Date()
      };
      
      if (existingUser.data.length === 0) {
        // 用户不存在，创建新用户
        await db.collection('ld_user_info').add({
          data: userData
        });
        console.log('用户信息已保存到云端数据库');
      } else {
        // 用户已存在，更新用户信息
        await db.collection('ld_user_info').doc(existingUser.data[0]._id).update({
          data: {
            nickName: userInfo.nickName,
            avatarUrl: userInfo.cloudAvatarUrl || userInfo.avatarUrl,
            inviteCode: inviteCode,
            updateTime: new Date()
          }
        });
        console.log('用户信息已更新到云端数据库');
      }
    } catch (error) {
      console.error('保存用户信息到云端失败:', error);
      throw error;
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
  }
});
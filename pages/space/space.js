// 云开发已在app.js中初始化，这里不需要重复初始化
Page({
  data: {
    moments: [],
    loading: false,
    refreshing: false,
    showPublishModal: false,
    showCommentModal: false,
    publishContent: '',
    selectedImages: [],
    publishing: false,
    commentText: '',
    currentCommentMomentId: '',
    userInfo: null,
    partnerInfo: null, // 情侣信息
    coupleId: null,
    localCacheLimit: 5, // 本地缓存条数限制
    backgroundImage: '', // 背景图片
    isRefreshing: false // 刷新状态
  },

  onLoad() {
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

    this.setData({
      coupleId: coupleId
    });

    // 加载背景图片
    const cachedBackgroundImage = wx.getStorageSync('showbackgroundImage');
    if (cachedBackgroundImage) {
      this.setData({ backgroundImage: cachedBackgroundImage });
    }

    // 获取用户信息
    this.getUserInfo().then(userInfo => {
      this.setData({ userInfo });
    }).catch(error => {
      console.error('获取用户信息失败:', error);
      // 如果获取用户信息失败，跳转到绑定页面
      wx.reLaunch({
        url: '/pages/bind/bind'
      });
    });

    // 获取情侣信息
    this.getPartnerInfo().then(partnerInfo => {
      this.setData({ partnerInfo });
    }).catch(error => {
      console.error('获取情侣信息失败:', error);
    });

    // 获取瞬间列表
    this.getMoments();
  },

  onShow() {
    // 页面显示时刷新数据
    if (this.data.coupleId) {
      this.getMoments();
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.refreshData();
  },

  /**
   * 刷新数据
   */
  async refreshData() {
    if (this.data.isRefreshing) return;
    
    this.setData({ isRefreshing: true });
    
    try {
      await this.getMoments();
      wx.showToast({
        title: '刷新成功',
        icon: 'success',
        duration: 1500
      });
    } catch (error) {
      console.error('刷新失败:', error);
      wx.showToast({
        title: '刷新失败',
        icon: 'none',
        duration: 1500
      });
    } finally {
      this.setData({ isRefreshing: false });
      wx.stopPullDownRefresh();
    }
  },

  onReachBottom() {
    // 可以在这里实现分页加载
    console.log('到达底部');
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {
    // 阻止事件冒泡，用于模态框等组件
  },

  /**
   * 内容输入处理
   */
  onContentInput(e) {
    this.setData({
      publishContent: e.detail.value
    });
  },

  /**
   * 选择图片
   */
  selectImages() {
    const maxImages = 9;
    const currentCount = this.data.selectedImages.length;
    const remainingCount = maxImages - currentCount;
    
    if (remainingCount <= 0) {
      wx.showToast({
        title: '最多只能选择9张图片',
        icon: 'none'
      });
      return;
    }
    
    wx.chooseMedia({
      count: remainingCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFiles = res.tempFiles.map(file => file.tempFilePath);
        const newImages = [...this.data.selectedImages, ...tempFiles];
        this.setData({
          selectedImages: newImages
        });
      },
      fail: (error) => {
        console.error('选择图片失败:', error);
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 获取用户信息
   */
  getUserInfo() {
    return new Promise((resolve, reject) => {
      // 先尝试从缓存获取
      const cachedUserInfo = wx.getStorageSync('userInfo');
      if (cachedUserInfo) {
        resolve(cachedUserInfo);
        return;
      }

      // 如果缓存中没有，则从云数据库获取
      const db = wx.cloud.database();
      const openid = wx.getStorageSync('openid');
      
      if (!openid) {
        reject(new Error('未找到openid'));
        return;
      }

      db.collection('ld_user_info').where({
        _openid: openid
      }).get().then(res => {
        if (res.data.length > 0) {
          const userInfo = res.data[0];
          wx.setStorageSync('userInfo', userInfo);
          resolve(userInfo);
        } else {
          reject(new Error('未找到用户信息'));
        }
      }).catch(reject);
    });
  },

  /**
   * 获取情侣ID
   */
  getCoupleId() {
    const cachedCoupleId = wx.getStorageSync('coupleId');
    if (cachedCoupleId) {
      return cachedCoupleId;
    }
    
    // 如果缓存中没有，可以从用户信息中获取
    const userInfo = this.data.userInfo;
    if (userInfo && userInfo.coupleId) {
      wx.setStorageSync('coupleId', userInfo.coupleId);
      return userInfo.coupleId;
    }
    
    return null;
  },

  /**
   * 获取情侣信息
   */
  getPartnerInfo() {
    return new Promise((resolve, reject) => {
      // 先尝试从缓存获取
      const cachedPartnerInfo = wx.getStorageSync('partnerInfo');
      if (cachedPartnerInfo) {
        resolve(cachedPartnerInfo);
        return;
      }
      console.log('获取情侣信息'+partnerId);
      // 如果缓存中没有，则从云数据库获取
      const db = wx.cloud.database();
      const partnerId = wx.getStorageSync('partnerId');
      console.log('获取情侣信息：'+partnerId);
      if (!partnerId) {
        reject(new Error('未找到partnerId'));
        return;
      }

      db.collection('ld_user_info').where({
         $or: [
           { userId: partnerId }
         ]
       }).get().then(res => {
        if (res.data.length > 0) {
          const partnerInfo = {
            nickName: res.data[0].nickName,
            avatarUrl: res.data[0].avatarUrl
          };
          wx.setStorageSync('partnerInfo', partnerInfo);
          resolve(partnerInfo);
        } else {
          reject(new Error('未找到情侣信息'));
        }
      }).catch(reject);
    });
  },

  // 移除getBackgroundImage方法，因为背景是全局的，不需要从云端获取

  /**
   * 获取瞬间列表
   */
  async getMoments() {
    if (this.data.loading) return;
    
    this.setData({ loading: true });
    
    try {
      // 先显示缓存的数据
      const cachedMoments = this.getLocalCachedMoments();
      if (cachedMoments.length > 0) {
        this.setData({
          moments: cachedMoments,
          loading: false
        });
      }
      
      // 然后从云端获取最新数据
      const db = wx.cloud.database();
      const coupleId = this.data.coupleId;
      
      if (!coupleId) {
        throw new Error('未找到情侣ID');
      }

      const result = await db.collection('ld_moments')
        .where({
          coupleId: coupleId
        })
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get();

      if (result.data) {
        // 为每个瞬间添加用户头像
        const momentsWithAvatars = await this.addUserAvatarsToMoments(result.data);
        
        this.setData({
          moments: momentsWithAvatars,
          loading: false
        });
        
        // 更新本地缓存
        this.updateLocalCache(momentsWithAvatars);
      }
    } catch (error) {
      console.error('获取瞬间失败:', error);
      
      // 如果云端获取失败，使用缓存数据
      const cachedMoments = this.getLocalCachedMoments();
      this.setData({
        moments: cachedMoments,
        loading: false
      });
      
      wx.showToast({
        title: '加载失败，显示缓存数据',
        icon: 'none'
      });
    }
  },

  /**
   * 获取本地缓存的瞬间
   */
  getLocalCachedMoments() {
    try {
      const cacheKey = `coupleMoments_${this.data.coupleId}`;
      const cachedData = wx.getStorageSync(cacheKey) || [];
      const sortedData = cachedData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return sortedData;
    } catch (error) {
      console.error('获取本地缓存失败:', error);
      return [];
    }
  },

  /**
   * 为瞬间添加用户头像（动态获取最新用户信息）
   */
  async addUserAvatarsToMoments(moments) {
    try {
      // 获取当前用户和情侣的最新信息
      const userInfo = wx.getStorageSync('userInfo');
      const currentOpenid = userInfo?.openid;
      const partnerId = wx.getStorageSync('partnerId');
      
      if (!currentOpenid) {
        console.error('未找到当前用户openid');
        return moments;
      }
      
      // 从数据库获取最新的用户信息
      const db = wx.cloud.database();
      const userInfos = await db.collection('ld_user_info').where({
        openid: db.command.in([currentOpenid, partnerId])
      }).get();
      
      // 创建用户信息映射，使用本地存储的头像信息
      const userMap = {};
      
      // 获取本地存储的用户头像信息
      const localUserInfo = wx.getStorageSync('userInfo');
      const partnerInfo = wx.getStorageSync('partnerInfo');
      
      for (const user of userInfos.data) {
        let avatarUrl = './images/default-avatar.png';
        
        // 如果是当前用户，使用本地存储的头像
        if (user.openid === currentOpenid && localUserInfo?.localAvatarPath) {
          avatarUrl = localUserInfo.localAvatarPath;
        }
        // 如果是伴侣，使用本地存储的伴侣头像
        else if (user.openid === partnerId && partnerInfo?.avatarUrl) {
          avatarUrl = partnerInfo.avatarUrl;
        }
        
        userMap[user.openid] = {
          avatar: avatarUrl,
          name: user.nickName || (user.openid === currentOpenid ? '我' : 'TA')
        };
      }
      
      // 为每个瞬间添加用户信息，并处理评论
      return moments.map(moment => {
        const userInfo = userMap[moment._openid];
        
        // 处理评论，为每个评论添加最新的用户信息
        const commentsWithUserInfo = (moment.comments || []).map(comment => {
          const commentUserInfo = userMap[comment._openid];
          return {
            ...comment,
            userAvatar: commentUserInfo?.avatar || './images/default-avatar.png',
            userName: commentUserInfo?.name || '未知用户'
          };
        });
        
        return {
          ...moment,
          userAvatar: userInfo?.avatar || './images/default-avatar.png',
          userName: userInfo?.name || '未知用户',
          comments: commentsWithUserInfo
        };
      });
    } catch (error) {
      console.error('添加用户头像失败:', error);
      return moments.map(moment => ({
        ...moment,
        userAvatar: './images/default-avatar.png',
        userName: '未知用户'
      }));
    }
  },

  /**
   * 更新本地缓存
   */
  updateLocalCache(moments) {
    try {
      const cacheKey = `coupleMoments_${this.data.coupleId}`;
      // 只缓存最新的几条数据
      const cacheData = moments.slice(0, this.data.localCacheLimit);
      wx.setStorageSync(cacheKey, cacheData);
    } catch (error) {
      console.error('更新本地缓存失败:', error);
    }
  },



  /**
   * 显示发布模态框
   */
  showPublishModal() {
    this.setData({
      showPublishModal: true,
      publishContent: '',
      selectedImages: []
    });
  },

  /**
   * 隐藏发布模态框
   */
  hidePublishModal() {
    this.setData({
      showPublishModal: false
    });
  },

  /**
   * 输入发布内容
   */
  onPublishInput(e) {
    this.setData({
      publishContent: e.detail.value
    });
  },

  /**
   * 选择图片
   */
  chooseImages() {
    const maxImages = 9;
    const currentCount = this.data.selectedImages.length;
    const remainingCount = maxImages - currentCount;
    
    if (remainingCount <= 0) {
      wx.showToast({
        title: `最多只能选择${maxImages}张图片`,
        icon: 'none'
      });
      return;
    }
    
    wx.chooseMedia({
      count: remainingCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = res.tempFiles.map(file => file.tempFilePath);
        this.setData({
          selectedImages: [...this.data.selectedImages, ...newImages]
        });
      },
      fail: (error) => {
        console.error('选择图片失败:', error);
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 删除选中的图片
   */
  removeImage(e) {
    const index = e.currentTarget.dataset.index;
    const selectedImages = this.data.selectedImages;
    selectedImages.splice(index, 1);
    this.setData({
      selectedImages: selectedImages
    });
  },

  /**
   * 预览图片
   */
  previewImage(e) {
    const current = e.currentTarget.dataset.current;
    const urls = e.currentTarget.dataset.urls;
    
    // 处理图片URL数组，确保格式正确
    const imageUrls = urls.map(img => {
      return typeof img === 'string' ? img : (img.url || img);
    });
    
    wx.previewImage({
      current: current,
      urls: imageUrls
    });
  },

  /**
   * 发布瞬间
   */
  async publishMoment() {
    const content = this.data.publishContent.trim();
    const images = this.data.selectedImages;
    
    if (!content && images.length === 0) {
      wx.showToast({
        title: '请输入内容或选择图片',
        icon: 'none'
      });
      return;
    }
    
    if (this.data.publishing) return;
    
    this.setData({ publishing: true });
    
    wx.showLoading({
      title: '发布中...'
    });
    
    try {
      const db = wx.cloud.database();
      const coupleId = this.data.coupleId;
      
      // 上传图片到云存储
      let uploadedImages = [];
      if (images.length > 0) {
        const uploadPromises = images.map(async (imagePath, index) => {
          const cloudPath = `moments/${coupleId}/${Date.now()}_${index}.jpg`;
          const result = await wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: imagePath
          });
          return result.fileID;
        });
        
        uploadedImages = await Promise.all(uploadPromises);
      }
      
      // 保存瞬间到数据库，只存储用户openid，用户名和头像在显示时动态获取
      const userInfo = wx.getStorageSync('userInfo');
      const momentData = {
        _id: Date.now().toString(), // 使用13位时间戳作为_id
        coupleId: this.data.coupleId,
        content: content,
        images: uploadedImages,
        timestamp: new Date(),
        likes: 0, // 修改为数字类型，支持$inc操作
        comments: [],
        _openid: userInfo?.openid
      };
      
      if (!momentData._openid) {
        wx.showToast({ title: '用户信息获取失败', icon: 'error' });
        return;
      }
      
      await db.collection('ld_moments').add({
        data: momentData
      });
      
      wx.hideLoading();
      wx.showToast({
        title: '发布成功',
        icon: 'success'
      });
      
      // 隐藏发布模态框
      this.hidePublishModal();
      
      // 刷新瞬间列表
      await this.getMoments();
      
      // 清除本地缓存，强制刷新
      const cacheKey = `coupleMoments_${this.data.coupleId}`;
      wx.removeStorageSync(cacheKey);
      
    } catch (error) {
      console.error('发布瞬间失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '发布失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ publishing: false });
    }
  },

  /**
   * 预览瞬间图片
   */
  previewMomentImage(e) {
    const current = e.currentTarget.dataset.src;
    const urls = e.currentTarget.dataset.urls;
    
    wx.previewImage({
      current: current,
      urls: urls
    });
  },

  /**
   * 点赞
   */
  async toggleLike(e) {
    const momentId = e.currentTarget.dataset.id;
    let momentIndex = e.currentTarget.dataset.index;
    
    if (!momentId) return;
    
    // 如果没有传递index，则查找对应的索引
    if (momentIndex === undefined) {
      momentIndex = this.data.moments.findIndex(moment => moment._id === momentId);
    }
    
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 先获取当前文档，检查likes字段类型
      const doc = await db.collection('ld_moments').doc(momentId).get();
      const currentLikes = doc.data.likes;
      
      // 如果likes是数组类型，先重置为0，然后再增加1
      if (Array.isArray(currentLikes)) {
        await db.collection('ld_moments').doc(momentId).update({
          data: {
            likes: 1 // 直接设置为1
          }
        });
      } else {
        // 如果likes是数字类型，正常使用$inc操作
        await db.collection('ld_moments').doc(momentId).update({
          data: {
            likes: _.inc(1)
          }
        });
      }
      
      // 立即更新本地数据
      const moments = this.data.moments;
      if (moments[momentIndex]) {
        // 如果原来是数组类型，重置为1；否则正常加1
        if (Array.isArray(moments[momentIndex].likes)) {
          moments[momentIndex].likes = 1;
        } else {
          moments[momentIndex].likes = (moments[momentIndex].likes || 0) + 1;
        }
        moments[momentIndex].showHearts = true;
        this.setData({ moments });
        
        // 2秒后隐藏心形动画
        setTimeout(() => {
          if (moments[momentIndex]) {
            moments[momentIndex].showHearts = false;
            this.setData({ moments });
          }
        }, 2000);
      }
      
      // 更新本地缓存
      this.updateLocalCache(moments);
      
    } catch (error) {
      console.error('点赞失败:', error);
      wx.showToast({
        title: '点赞失败',
        icon: 'none'
      });
    }
  },

  /**
   * 显示评论输入框
   */
  showCommentInput(e) {
    const momentId = e.currentTarget.dataset.id;
    this.setData({
      showCommentModal: true,
      currentCommentMomentId: momentId,
      commentText: ''
    });
  },

  /**
   * 显示评论模态框
   */
  showCommentModal(e) {
    const momentId = e.currentTarget.dataset.id;
    this.setData({
      showCommentModal: true,
      currentCommentMomentId: momentId,
      commentText: ''
    });
  },

  /**
   * 隐藏评论模态框
   */
  hideCommentModal() {
    this.setData({
      showCommentModal: false,
      currentCommentMomentId: '',
      commentText: ''
    });
  },

  /**
   * 输入评论内容
   */
  onCommentInput(e) {
    this.setData({
      commentText: e.detail.value
    });
  },

  /**
   * 提交评论（wxml中调用的方法）
   */
  async submitComment() {
    await this.publishComment();
  },

  /**
   * 发布评论
   */
  async publishComment() {
    const commentText = this.data.commentText.trim();
    const momentId = this.data.currentCommentMomentId;
    
    if (!commentText) {
      wx.showToast({
        title: '请输入评论内容',
        icon: 'none'
      });
      return;
    }
    
    if (!momentId) {
      wx.showToast({
        title: '评论失败',
        icon: 'none'
      });
      return;
    }
    
    wx.showLoading({
      title: '发布中...'
    });
    
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 评论只存储内容、时间戳和用户openid，用户名和头像在显示时动态获取
      const userInfo = wx.getStorageSync('userInfo');
      const comment = {
        content: commentText,
        timestamp: new Date(),
        _openid: userInfo?.openid
      };
      
      if (!comment._openid) {
        wx.showToast({ title: '用户信息获取失败', icon: 'error' });
        return;
      }
      
      // 更新数据库中的评论
      await db.collection('ld_moments').doc(momentId).update({
        data: {
          comments: _.push(comment)
        }
      });
      
      wx.hideLoading();
      wx.showToast({
        title: '评论成功',
        icon: 'success'
      });
      
      // 隐藏评论模态框
      this.hideCommentModal();
      
      // 刷新瞬间列表
      await this.getMoments();
      
    } catch (error) {
      console.error('发布评论失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '评论失败，请重试',
        icon: 'none'
      });
    }
  },

  /**
   * 删除瞬间
   */
  async deleteMoment(e) {
    const momentId = e.currentTarget.dataset.id;
    let momentIndex = e.currentTarget.dataset.index;
    
    if (!momentId) return;
    
    // 如果没有传递index，则查找对应的索引
    if (momentIndex === undefined) {
      momentIndex = this.data.moments.findIndex(moment => moment._id === momentId);
    }
    
    const result = await new Promise((resolve) => {
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这条瞬间吗？',
        success: (res) => {
          resolve(res.confirm);
        }
      });
    });
    
    if (!result) return;
    
    wx.showLoading({
      title: '删除中...'
    });
    
    try {
      const db = wx.cloud.database();
      
      // 删除数据库中的瞬间
      await db.collection('ld_moments').doc(momentId).remove();
      
      // 删除本地数据
      const moments = this.data.moments;
      moments.splice(momentIndex, 1);
      this.setData({ moments });
      
      // 更新本地缓存
      this.updateLocalCache(moments);
      
      wx.hideLoading();
      wx.showToast({
        title: '删除成功',
        icon: 'success'
      });
      
    } catch (error) {
      console.error('删除瞬间失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '删除失败，请重试',
        icon: 'none'
      });
    }
  },

  /**
   * 格式化时间
   */
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    
    if (diff < minute) {
      return '刚刚';
    } else if (diff < hour) {
      return Math.floor(diff / minute) + '分钟前';
    } else if (diff < day) {
      return Math.floor(diff / hour) + '小时前';
    } else if (diff < 7 * day) {
      return Math.floor(diff / day) + '天前';
    } else {
      return date.toLocaleDateString();
    }
  },


});
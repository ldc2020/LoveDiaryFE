// pages/plan/movie/movie.js
const app = getApp();
const DataManager = require('../../../utils/dataManager');

// 电影计划数据管理器
let movieDataManager = null;

Page({
  /**
   * 页面的初始数据
   */
  data: {
    moviePlans: [], // 电影计划列表
    showAddModal: false, // 是否显示添加弹窗
    showDetailModal: false, // 是否显示详情弹窗
    selectedMovie: null, // 选中的电影详情
    searchKeyword: '', // 搜索关键词
    movieInfo: null, // 搜索到的电影信息
    isSearching: false, // 是否正在搜索
    isAdding: false, // 是否正在添加
    isDeleting: false, // 是否正在删除
    userInfo: null,
    coupleId: '',
    
    // 数据加载状态
    loading: false,
    refreshing: false,
    hasMore: true
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.initPage();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    this.loadMoviePlans();
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    console.log('用户下拉刷新电影计划');
    this.refreshData();
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    console.log('触底加载更多电影计划');
    this.loadMoreData();
  },

  /**
   * 初始化页面
   */
  async initPage() {
    try {
      // 从本地存储获取用户信息和情侣ID
      const userInfo = wx.getStorageSync('userInfo') || app.globalData.userInfo;
      const coupleId = wx.getStorageSync('coupleId');
      const bindStatus = wx.getStorageSync('bindStatus');
      
      console.log('电影计划页面初始化:', { userInfo: !!userInfo, coupleId, bindStatus });
      
      if (!userInfo || !coupleId || bindStatus !== 'bound') {
        console.warn('用户信息不完整，跳转到绑定页面');
        wx.showToast({
          title: '请先完成情侣绑定',
          icon: 'none'
        });
        setTimeout(() => {
          wx.reLaunch({
            url: '/pages/bind/bind'
          });
        }, 1500);
        return;
      }
      
      this.setData({
        userInfo,
        coupleId
      });
      
      // 初始化电影计划数据管理器
      movieDataManager = new DataManager({
        collectionName: 'ld_movie_plans', // 电影计划数据库集合
        cachePrefix: 'moviePlans', // 缓存前缀
        pageSize: 20, // 每页加载20条
        cleanupInterval: 2, // 每2天清理一次
        retentionPeriod: 30, // 保留30天数据

        hasImages: false, // 电影计划不包含图片
        timestampField: 'createTime', // 时间戳字段
        sortField: 'createTime', // 按创建时间排序
        sortOrder: 'desc' // 降序排列
      });
      
      console.log('电影计划数据管理器初始化完成');
      
    } catch (error) {
      console.error('初始化页面失败:', error);
      wx.showToast({
        title: '初始化失败',
        icon: 'error'
      });
    }
  },

  /**
   * 刷新数据
   */
  async refreshData() {
    if (this.data.refreshing || !movieDataManager) {
      console.log('正在刷新中或数据管理器未初始化，跳过重复刷新');
      return;
    }

    this.setData({ 
      refreshing: true,
      moviePlans: []
    });
    
    try {
      console.log('开始刷新电影计划数据');
      
      // 使用dataManager刷新数据
      const moviePlans = await movieDataManager.getData(true, false);
      
      // 格式化时间并更新数据
      const formattedPlans = moviePlans.map(item => ({
        ...item,
        createTime: this.formatTime(item.createTime),
        rating: item.rating || '暂无评分', // 确保有评分字段
        duration: item.duration || '未知',
        genre: item.genre || '未知'
      }));
      
      // 获取分页状态
      const paginationState = movieDataManager.getPaginationState();
      
      this.setData({
        moviePlans: formattedPlans,
        hasMore: paginationState.hasMore
      });
      
      console.log('电影计划数据刷新完成:', formattedPlans.length);
      

      
    } catch (error) {
      console.error('刷新数据失败:', error);
      wx.showToast({
        title: '刷新失败，请重试',
        icon: 'error'
      });
    } finally {
      this.setData({ refreshing: false });
      wx.stopPullDownRefresh();
    }
  },

  /**
   * 加载更多数据
   */
  async loadMoreData() {
    if (this.data.loading || !this.data.hasMore || !movieDataManager) {
      console.log('正在加载中、没有更多数据或数据管理器未初始化');
      return;
    }

    this.setData({ loading: true });
    
    try {
      console.log('开始加载更多电影计划数据');
      
      // 使用dataManager懒加载更多数据
      const moreMoviePlans = await movieDataManager.getData(false, true);
      
      // 格式化时间
      const formattedMorePlans = moreMoviePlans.map(item => ({
        ...item,
        createTime: this.formatTime(item.createTime)
      }));
      
      // 合并到现有数据
      const updatedPlans = [...this.data.moviePlans, ...formattedMorePlans];
      
      // 获取分页状态
      const paginationState = movieDataManager.getPaginationState();
      
      this.setData({
        moviePlans: updatedPlans,
        hasMore: paginationState.hasMore
      });
      
      console.log('加载更多电影计划完成:', formattedMorePlans.length);
      

      
    } catch (error) {
      console.error('加载更多数据失败:', error);
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'error'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 加载电影计划列表
   */
  async loadMoviePlans() {
    if (!movieDataManager) {
      console.warn('数据管理器未初始化，跳过加载');
      return;
    }
    
    try {
      console.log('开始加载电影计划列表');
      
      // 使用dataManager加载数据（自动处理缓存和云端数据）
      const moviePlans = await movieDataManager.getData(false, false);
      
      // 格式化时间并更新数据
      const formattedPlans = moviePlans.map(item => ({
        ...item,
        createTime: this.formatTime(item.createTime),
        rating: item.rating || '暂无评分', // 确保有评分字段
        duration: item.duration || '未知',
        genre: item.genre || '未知'
      }));
      
      // 获取分页状态
      const paginationState = movieDataManager.getPaginationState();
      
      this.setData({
        moviePlans: formattedPlans,
        hasMore: paginationState.hasMore
      });
      
      console.log('电影计划列表加载完成:', formattedPlans.length);
      

      
    } catch (error) {
      console.error('加载电影计划失败:', error);
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'error'
      });
    }
  },

  // 缓存和云端加载逻辑已由dataManager处理

  /**
   * 返回上一页
   */
  goBack() {
    wx.navigateBack();
  },

  /**
   * 显示添加弹窗
   */
  showAddModal() {
    this.setData({ showAddModal: true });
  },

  /**
   * 隐藏添加弹窗
   */
  hideAddModal() {
    this.setData({ 
      showAddModal: false,
      searchKeyword: '',
      movieInfo: null
    });
  },

  /**
   * 搜索输入
   */
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  /**
   * 搜索电影
   */
  async searchMovie() {
    const { searchKeyword, isSearching } = this.data;
    
    // 防止重复搜索
    if (isSearching) {
      return;
    }
    
    if (!searchKeyword.trim()) {
      wx.showToast({
        title: '请输入电影名称',
        icon: 'none'
      });
      return;
    }

    this.setData({ isSearching: true });

    try {
      // 引入电影API服务
      const movieApiService = require('../../../utils/movieApiService.js');
      
      console.log('开始搜索电影:', searchKeyword);
      
      // 调用电影搜索API
      const movieInfo = await movieApiService.searchMovies(searchKeyword.trim());
            
      if (movieInfo) {
        // 获取电影详情信息（导演、主演、简介、时长）
        // 优先从本地缓存获取，缓存没有才从云数据库获取
        let detailInfo = {};
        if (movieInfo.id) {
          try {
            console.log('获取电影详情，ID:', movieInfo.id);
            
            // 1. 先尝试从本地缓存获取详情
            const cacheKey = `movie_detail_${movieInfo.id}`;
            let cachedDetail = null;
            try {
              cachedDetail = wx.getStorageSync(cacheKey);
              if (cachedDetail && cachedDetail.timestamp) {
                const now = Date.now();
                const cacheAge = now - cachedDetail.timestamp;
                // 检查缓存是否过期（24小时）
                if (cacheAge < 24 * 60 * 60 * 1000) {
                  console.log('[Movie] 从本地缓存获取电影详情');
                  detailInfo = cachedDetail.data;
                } else {
                  console.log('[Movie] 本地详情缓存已过期，删除缓存');
                  wx.removeStorageSync(cacheKey);
                  cachedDetail = null;
                }
              }
            } catch (cacheError) {
              console.warn('[Movie] 获取本地详情缓存失败:', cacheError);
            }
            
            // 2. 如果本地缓存没有，则从云数据库获取
            if (!cachedDetail) {
              console.log('[Movie] 电影详情信息本地缓存未命中，从云数据库获取详情');
              detailInfo = await movieApiService.getMovieDetail(movieInfo.id);
              
              // 3. 将获取到的详情缓存到本地
              if (detailInfo) {
                try {
                  const cacheData = {
                    data: detailInfo,
                    timestamp: Date.now(),
                    movieId: movieInfo.id
                  };
                  wx.setStorageSync(cacheKey, cacheData);
                  console.log('[Movie] 电影详情已缓存到本地');
                } catch (cacheError) {
                  console.warn('[Movie] 缓存电影详情到本地失败:', cacheError);
                }
              }
            }
            
            console.log('获取到的详情信息:', detailInfo);
          } catch (detailError) {
            console.warn('获取电影详情失败:', detailError);
          }
        }
        
        // 将API返回的数据格式转换为页面需要的格式
        const formattedMovieInfo = {
          title: movieInfo.title || movieInfo.nm || searchKeyword.trim(),
          director: detailInfo.director || movieInfo.director || '未知导演',
          actors: detailInfo.actors || movieInfo.actors || '未知主演',
          year: movieInfo.year || movieInfo.pubDesc || '未知',
          genre: movieInfo.genre || movieInfo.cat || '未知',
          plot: detailInfo.summary || movieInfo.plot || '暂无简介',
          rating: movieInfo.rating || movieInfo.sc || '暂无评分',
          duration: detailInfo.duration || movieInfo.duration || '未知时长',
          poster: detailInfo.poster || movieInfo.poster || movieInfo.img || null,
          movieId: movieInfo.id || null
        };
        
        console.log('格式化后的电影信息:', formattedMovieInfo);
        
        this.setData({
          movieInfo: formattedMovieInfo,
          isSearching: false
        });
      } else {
        // 没有找到电影信息
        wx.showToast({
          title: '未找到相关电影',
          icon: 'none'
        });
        this.setData({ isSearching: false });
      }

    } catch (error) {
      console.error('搜索电影失败:', error);
      wx.showToast({
        title: '搜索失败，请重试',
        icon: 'error'
      });
      this.setData({ isSearching: false });
    }
  },

  /**
   * 添加电影计划
   */
  async addMoviePlan() {
    const { movieInfo, userInfo, coupleId } = this.data;
    if (!movieInfo) {
      wx.showToast({
        title: '请先搜索电影信息',
        icon: 'none'
      });
      return;
    }

    if (!movieDataManager) {
      console.warn('数据管理器未初始化，无法添加电影计划');
      wx.showToast({
        title: '系统异常，请重试',
        icon: 'error'
      });
      return;
    }

    this.setData({ isAdding: true });

    try {
      // 在添加电影计划时获取详细信息（包括海报）
      let detailInfo = {};
      if (movieInfo.movieId) {
        try {
          console.log('添加计划时获取电影详情，ID:', movieInfo.movieId);
          const movieApiService = require('../../../utils/movieApiService.js');
          detailInfo = await movieApiService.getMovieDetail(movieInfo.movieId);
          console.log('添加时获取到的详情信息:', detailInfo);
        } catch (detailError) {
          console.warn('添加时获取电影详情失败:', detailError);
        }
      }

      // 构建计划数据，优先使用详细信息
      const planData = {
        movieName: movieInfo.title,
        movieInfo: this.formatMovieInfo(movieInfo),
        director: detailInfo.director || movieInfo.director,
        actors: detailInfo.actors || movieInfo.actors,
        summary: detailInfo.summary || movieInfo.plot || movieInfo.summary || '暂无简介',
        releaseTime: movieInfo.year || '上映时间未知',
        rating: movieInfo.rating || '暂无评分',
        duration: detailInfo.duration || movieInfo.duration || '未知',
        genre: movieInfo.genre || '未知',
        poster: detailInfo.poster || movieInfo.poster || null,
        movieId: movieInfo.movieId || null,
        status: 'pending',
        watched: false,
        createTime: new Date(),
        updateTime: new Date(),
        creator: userInfo.openid,
        coupleId: coupleId
      };

      console.log('准备添加电影计划:', planData);
      
      // 使用dataManager发布数据
      const savedPlanData = await movieDataManager.publishData(planData);
      
      console.log('电影计划添加成功，包含_id:', savedPlanData._id);

      // 刷新列表
      await this.refreshData();
      
      // 更新云端统计数据
      await this.updatePlanCountInCloud('movie', 1);

      // 关闭弹窗
      this.hideAddModal();

      wx.showToast({
        title: '添加成功',
        icon: 'success'
      });

    } catch (error) {
      console.error('添加电影计划失败:', error);
      wx.showToast({
        title: '添加失败，请重试',
        icon: 'error'
      });
    } finally {
      this.setData({ isAdding: false });
    }
  },

  /**
   * 显示电影详情
   */
  /**
   * 显示电影详情弹窗
   * @param {Object} e 事件对象
   */
  showMovieDetail(e) {
    const { plan } = e.currentTarget.dataset;
    console.log('显示电影详情:', plan);
    
    this.setData({
      selectedMovie: plan,
      showDetailModal: true
    });
  },

  /**
   * 隐藏电影详情弹窗
   */
  hideDetailModal() {
    this.setData({
      showDetailModal: false,
      selectedMovie: null
    });
  },

  /**
   * 切换观看状态
   */
  async toggleWatchStatus() {
    if (!this.data.selectedMovie) return;
    
    try {
      const movieId = this.data.selectedMovie._id;
      const newWatchedStatus = !this.data.selectedMovie.watched;
      
      // 更新数据库
      await movieDataManager.updateData(movieId, {
        watched: newWatchedStatus
      });
      
      // 更新本地数据
      const updatedPlans = this.data.moviePlans.map(plan => {
        if (plan._id === movieId) {
          return { ...plan, watched: newWatchedStatus };
        }
        return plan;
      });
      
      const updatedSelectedMovie = { ...this.data.selectedMovie, watched: newWatchedStatus };
      
      this.setData({
        moviePlans: updatedPlans,
        selectedMovie: updatedSelectedMovie
      });
      
      wx.showToast({
        title: newWatchedStatus ? '已标记为已看' : '已标记为未看',
        icon: 'success'
      });
      
    } catch (error) {
      console.error('更新观看状态失败:', error);
      wx.showToast({
        title: '更新失败',
        icon: 'error'
      });
    }
  },

  /**
   * 删除电影计划
   */
  async deleteMoviePlan() {
    if (!this.data.selectedMovie) return;
    
    // 显示确认对话框
    const res = await new Promise((resolve) => {
      wx.showModal({
        title: '确认删除',
        content: `确定要删除电影计划《${this.data.selectedMovie.movieName}》吗？`,
        confirmText: '删除',
        confirmColor: '#ff4757',
        success: (result) => resolve(result)
      });
    });
    
    if (!res.confirm) return;
    
    try {
      const movieId = this.data.selectedMovie._id;
      
      console.log('开始删除电影计划:', movieId);
      
      // 使用dataManager删除数据
      await movieDataManager.deleteData(movieId);
      
      console.log('电影计划删除成功');
      
      // 更新本地数据 - 从列表中移除已删除的项目
      const updatedPlans = this.data.moviePlans.filter(plan => plan._id !== movieId);
      
      this.setData({
        moviePlans: updatedPlans,
        showDetailModal: false,
        selectedMovie: null
      });
      
      // 更新云端统计数据
      await this.updatePlanCountInCloud('movie', -1);
      
      wx.showToast({
        title: '删除成功',
        icon: 'success'
      });
      
    } catch (error) {
      console.error('删除电影计划失败:', error);
      wx.showToast({
        title: '删除失败，请重试',
        icon: 'error'
      });
    }
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {
    // 阻止事件冒泡
  },

  /**
   * 格式化电影信息
   * @param {Object} movieInfo 电影信息对象
   * @returns {string} 格式化后的电影信息
   */
  formatMovieInfo(movieInfo) {
    const summary = movieInfo.plot || movieInfo.summary || '暂无简介';
    const rating = movieInfo.rating || '暂无评分';
    const duration = movieInfo.duration || '未知';
    const genre = movieInfo.genre || '未知';
    return `《${movieInfo.title}》\n导演：${movieInfo.director}\n主演：${movieInfo.actors}\n评分：${rating}\n时长：${duration}\n类型：${genre}\n简介：${summary}`;
  },





  /**
   * 更新云端统计数据
   * @param {string} type 计划类型
   * @param {number} change 变化量
   */
  async updatePlanCountInCloud(type, change) {
    try {
      const coupleId = wx.getStorageSync('coupleId');
      if (!coupleId) return;
      
      const db = wx.cloud.database();
      const collection = db.collection('ld_plans_count');
      
      // 查找现有记录
      const existingRecord = await collection
        .where({
          coupleId: coupleId,
          planType: type
        })
        .get();
      
      const now = new Date();
      
      if (existingRecord.data.length > 0) {
        // 更新现有记录
        const record = existingRecord.data[0];
        const oldCount = record.count || 0;
        const newCount = Math.max(0, oldCount + change); // 确保计数不会小于0
        
        console.log(`更新现有记录: ${type}, 原数量: ${oldCount}, 变化: ${change}, 新数量: ${newCount}`);
        
        await collection.doc(record._id).update({
          data: {
            count: newCount,
            updateTime: now
          }
        });
        
        console.log(`云端${type}计划统计更新成功: ${oldCount} -> ${newCount}`);
      } else {
        // 创建新记录
        const newCount = Math.max(0, change); // 确保初始计数不会小于0
        
        console.log(`创建新记录: ${type}, 初始数量: ${newCount}`);
        
        await collection.add({
          data: {
            coupleId: coupleId,
            planType: type,
            count: newCount,
            createTime: now,
            updateTime: now
          }
        });
        
        console.log(`云端${type}计划统计创建成功: ${newCount}`);
      }
    } catch (error) {
      console.error('更新云端统计数据失败:', error);
    }
  },

  /**
   * 格式化时间
   * @param {Date} date 日期对象
   * @returns {string} 格式化后的时间字符串
   */
  formatTime(date) {
    if (!date) return '';
    
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }
});
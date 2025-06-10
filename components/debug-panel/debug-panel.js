// components/debug-panel/debug-panel.js
Component({
  properties: {},

  data: {
    showPanel: false,
    showDebugBtn: false, // 控制调试按钮显示
    cacheInfo: [],
    fileStats: [],
    totalCacheSize: 0,
    totalCacheSizeText: '0 B',
    totalCacheCount: 0, // 缓存文件数统计
    loading: false,
    fileDetails: {}, // 存储每种文件类型的详细文件列表
    showCacheSection: true, // 缓存信息折叠状态
    showFileSection: true // 文件统计折叠状态
  },

  lifetimes: {
    /**
     * 组件实例进入页面节点树时执行
     */
    attached() {
      this.checkUserPermission();
    }
  },

  methods: {
    /**
     * 检查用户权限
     */
    checkUserPermission() {
      const openid = wx.getStorageSync('openid');
      const allowedOpenid = 'o1Yyl7U_-fotprl4226AULS1vvRw';
      
      if (openid === allowedOpenid) {
        this.setData({ showDebugBtn: true });
      }
    },
    /**
     * 切换面板显示状态
     */
    togglePanel() {
      // 检查用户权限
      const openid = wx.getStorageSync('openid');
      const allowedOpenid = 'o1Yyl7U_-fotprl4226AULS1vvRw';
      
      if (openid !== allowedOpenid) {
        console.log('调试面板仅对特定用户开放');
        return;
      }
      
      const show = !this.data.showPanel;
      this.setData({ showPanel: show });
      
      if (show) {
        this.loadDebugInfo();
      }
    },

    /**
     * 关闭面板
     */
    closePanel() {
      this.setData({ showPanel: false });
    },

    /**
     * 刷新调试信息
     */
    refreshInfo() {
      this.loadDebugInfo();
    },

    /**
     * 加载调试信息
     */
    async loadDebugInfo() {
      this.setData({ loading: true });
      
      try {
        // 获取缓存信息
        const cacheInfo = await this.getCacheInfo();
        
        // 获取文件统计信息
        const fileStats = await this.getFileStats();
        
        this.setData({
          cacheInfo,
          fileStats,
          loading: false
        });
      } catch (error) {
        console.error('加载调试信息失败:', error);
        this.setData({ loading: false });
      }
    },

    /**
     * 获取缓存信息
     */
    async getCacheInfo() {
      const cacheInfo = [];
      let totalSize = 0;
      
      try {
        // 获取所有存储的key
        const storageInfo = wx.getStorageInfoSync();
        
        for (const key of storageInfo.keys) {
          try {
            const value = wx.getStorageSync(key);
            const size = this.calculateSize(value);
            totalSize += size;
            
            // 计算元素个数
            let elementCount = '';
            if (Array.isArray(value)) {
              elementCount = `${value.length}个元素`;
            } else if (typeof value === 'object' && value !== null) {
              elementCount = `${Object.keys(value).length}个属性`;
            }
            
            cacheInfo.push({
              key,
              type: this.getKeyType(key),
              size: this.formatSize(size),
              value: this.formatValue(value),
              rawValue: value, // 添加原始值用于展示
              elementCount: elementCount, // 添加元素个数信息
              showDetail: false
            });
          } catch (error) {
            console.error(`获取key ${key} 失败:`, error);
          }
        }
        
        this.setData({ 
          totalCacheSize: totalSize,
          totalCacheSizeText: this.formatSize(totalSize),
          totalCacheCount: cacheInfo.length,
          cacheInfo: cacheInfo.sort((a, b) => this.parseSize(b.size) - this.parseSize(a.size))
        });
        
        return cacheInfo;
      } catch (error) {
        console.error('获取缓存信息失败:', error);
        return [];
      }
    },

    /**
     * 获取保存文件统计信息
     */
    async getFileStats() {
      try {
        const fs = wx.getFileSystemManager();
        
        // 获取保存的文件信息
        try {
          const savedFileList = await new Promise((resolve, reject) => {
            fs.getSavedFileList({
              success: resolve,
              fail: reject
            });
          });
          
          
          if (savedFileList && savedFileList.fileList && savedFileList.fileList.length > 0) {
            
            // 按文件类型分组
            const fileGroups = {};
            let totalSize = 0;
            
            for (const file of savedFileList.fileList) {
              const fileType = this.getFileTypeFromPath(file.filePath);
              
              if (!fileGroups[fileType]) {
                fileGroups[fileType] = { count: 0, size: 0, files: [] };
              }
              fileGroups[fileType].count++;
              fileGroups[fileType].size += file.size || 0;
              
              // 为文件添加格式化的大小字段和存储时间
              const fileWithFormattedSize = {
                ...file,
                sizeFormatted: this.formatSize(file.size || 0),
                createTimeFormatted: file.createTime ? this.formatCreateTime(file.createTime) : '未知',
                createTimeStamp: file.createTime || 0
              };
              fileGroups[fileType].files.push(fileWithFormattedSize);
              totalSize += file.size || 0;
            }
            
            // 对每个文件组内的文件按存储时间倒序排列
            for (const group of Object.values(fileGroups)) {
              group.files.sort((a, b) => (b.createTimeStamp || 0) - (a.createTimeStamp || 0));
            }
            
            
            // 构建结果数组
            const result = [];
            for (const [fileType, group] of Object.entries(fileGroups)) {
              result.push({
                type: fileType,
                count: group.count,
                size: this.formatSize(group.size),
                isDirectory: false,
                children: [],
                expanded: false,
                files: group.files // 保存文件详情用于后续展示
              });
            }
            
            // 按大小排序
            result.sort((a, b) => this.parseSize(b.size) - this.parseSize(a.size));
            
            return result;
            
          } else {
            return [{
              type: '暂无保存文件',
              count: 0,
              size: '0 B',
              isDirectory: false,
              children: [],
              expanded: false
            }];
          }
        } catch (error) {
          console.error('[保存文件统计] 获取保存文件列表失败:', error);
          return [{
            type: '获取失败',
            count: 0,
            size: '0 B',
            isDirectory: false,
            children: [],
            expanded: false
          }];
        }
        
      } catch (error) {
        console.error('[保存文件统计] 获取文件统计失败:', error);
        return [{
          type: '获取失败',
          count: 0,
          size: '0 B',
          isDirectory: false,
          children: [],
          expanded: false
        }];
      }
    },





    /**
     * 根据key获取类型
     */
    getKeyType(key) {
      if (key.includes('moment') || key.includes('Moment')) return 'moment';
      if (key.includes('avatar') || key.includes('Avatar')) return 'avatar';
      if (key.includes('user') || key.includes('User')) return 'user';
      if (key.includes('couple') || key.includes('Couple')) return 'couple';
      if (key.includes('image') || key.includes('Image')) return 'image';
      if (key.includes('cache') || key.includes('Cache')) return 'cache';
      if (key.includes('background') || key.includes('Background')) return 'background';
      return 'other';
    },

    /**
     * 根据文件名获取类型
     */
    getFileType(fileName) {
      const ext = fileName.split('.').pop().toLowerCase();
      
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        if (fileName.includes('moment')) return 'moment-image';
        if (fileName.includes('avatar')) return 'avatar-image';
        if (fileName.includes('background')) return 'background-image';
        return 'image';
      }
      
      if (['mp4', 'mov', 'avi'].includes(ext)) return 'video';
      if (['mp3', 'wav', 'aac'].includes(ext)) return 'audio';
      if (['json', 'txt', 'log'].includes(ext)) return 'data';
      
      return ext || 'unknown';
    },

    /**
     * 根据文件路径获取文件类型（用于保存的文件）
     */
    getFileTypeFromPath(filePath) {
      // 从路径中提取文件名
      const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || '';
      
      // 如果路径包含特定关键词，优先使用关键词分类
      if (filePath.includes('moment') || filePath.includes('Moment')) return 'moment';
      if (filePath.includes('avatar') || filePath.includes('Avatar')) return 'avatar';
      if (filePath.includes('background') || filePath.includes('Background')) return 'background';
      if (filePath.includes('carousel') || filePath.includes('Carousel')) return 'carousel';
      
      // 否则根据文件扩展名分类
      return this.getFileType(fileName);
    },

    /**
     * 计算数据大小
     */
    calculateSize(data) {
      try {
        if (typeof data === 'string') {
          // 尝试使用TextEncoder，如果不支持则使用字符串长度
          if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(data).length;
          } else {
            // 简单估算：中文字符按3字节，英文字符按1字节
            return data.replace(/[\u4e00-\u9fa5]/g, 'xxx').length;
          }
        }
        // 对于非字符串数据，先转换为JSON字符串再计算
        const jsonStr = JSON.stringify(data);
        if (typeof TextEncoder !== 'undefined') {
          return new TextEncoder().encode(jsonStr).length;
        } else {
          return jsonStr.replace(/[\u4e00-\u9fa5]/g, 'xxx').length;
        }
      } catch (error) {
        console.error('计算大小失败:', error);
        // 降级方案：直接返回字符串长度
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        return str.length;
      }
    },

    /**
     * 格式化大小
     */
    formatSize(bytes) {
      if (bytes === 0) return '0 B';
      
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * 格式化创建时间
     */
    formatCreateTime(createTime) {
      try {
        if (!createTime) return '未知';
        
        let timestamp = createTime;
        
        // 如果是秒级时间戳（10位），转换为毫秒级（13位）
        if (typeof timestamp === 'number' && timestamp.toString().length === 10) {
          timestamp = timestamp * 1000;
        }
        
        // 如果时间戳小于等于0或者会导致1970年，返回未知
        if (timestamp <= 0 || timestamp < 946684800000) { // 2000年1月1日的时间戳
          return '未知';
        }
        
        const date = new Date(timestamp);
        
        // 检查日期是否有效
        if (isNaN(date.getTime())) {
          return '未知';
        }
        
        return date.toLocaleString();
      } catch (error) {
        console.error('格式化创建时间失败:', error);
        return '未知';
      }
    },

    /**
     * 解析大小字符串为字节数
     */
    parseSize(sizeStr) {
      const match = sizeStr.match(/([0-9.]+)\s*(B|KB|MB|GB)/i);
      if (!match) return 0;
      
      const value = parseFloat(match[1]);
      const unit = match[2].toUpperCase();
      
      const multipliers = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
      return value * (multipliers[unit] || 1);
    },

    /**
     * 格式化值显示
     */
    formatValue(value) {
      try {
        if (value === null || value === undefined) {
          return String(value);
        }
        
        if (typeof value === 'string') {
          return value.length > 50 ? value.substring(0, 50) + '...' : value;
        }
        
        if (Array.isArray(value)) {
          // 对数组进行详细格式化，使用递归函数处理嵌套对象
          const formatObjectRecursive = (obj, depth = 0, maxDepth = 2) => {
            if (depth > maxDepth) {
              return '[深度限制]';
            }
            
            const preview = {};
            Object.keys(obj).forEach(key => {
              const val = obj[key];
              if (val === null || val === undefined) {
                preview[key] = String(val);
              } else if (typeof val === 'object') {
                if (Array.isArray(val)) {
                  preview[key] = val.length <= 3 ? val : [...val.slice(0, 3), `...还有${val.length - 3}项`];
                } else {
                  preview[key] = formatObjectRecursive(val, depth + 1, maxDepth);
                }
              } else {
                const strVal = String(val);
                preview[key] = strVal.length > 30 ? strVal.substring(0, 30) + '...' : strVal;
              }
            });
            return preview;
          };
          
          const formattedArray = value.map(item => {
            if (typeof item === 'object' && item !== null) {
              return formatObjectRecursive(item);
            }
            return item;
          });
          return JSON.stringify(formattedArray, null, 2);
        }
        
        if (typeof value === 'object' && value !== null) {
          // 对于普通对象，我们递归显示其详细内容
          const formatObjectRecursive = (obj, depth = 0, maxDepth = 3) => {
            if (depth > maxDepth) {
              return '[深度限制]';
            }
            
            const preview = {};
            Object.keys(obj).forEach(key => {
              const val = obj[key];
              if (val === null || val === undefined) {
                preview[key] = String(val);
              } else if (typeof val === 'object') {
                if (Array.isArray(val)) {
                  // 对数组进行格式化，显示前几个元素
                  if (val.length === 0) {
                    preview[key] = '[]';
                  } else if (val.length <= 3) {
                    preview[key] = val.map(item => 
                      typeof item === 'object' && item !== null 
                        ? formatObjectRecursive(item, depth + 1, maxDepth)
                        : item
                    );
                  } else {
                    const firstThree = val.slice(0, 3).map(item => 
                      typeof item === 'object' && item !== null 
                        ? formatObjectRecursive(item, depth + 1, maxDepth)
                        : item
                    );
                    preview[key] = [...firstThree, `...还有${val.length - 3}项`];
                  }
                } else {
                  // 对嵌套对象进行递归格式化
                  preview[key] = formatObjectRecursive(val, depth + 1, maxDepth);
                }
              } else {
                // 对字符串进行长度限制
                const strVal = String(val);
                preview[key] = strVal.length > 50 ? strVal.substring(0, 50) + '...' : strVal;
              }
            });
            return preview;
          };
          
          const formattedValue = formatObjectRecursive(value);
          return JSON.stringify(formattedValue, null, 2);
        }
        
        return String(value);
      } catch (error) {
        console.error('格式化值失败:', error);
        return '[格式化失败]';
      }
    },

    /**
     * 阻止事件冒泡
     */
    stopPropagation() {
      // 阻止事件冒泡到父元素
    },

    /**
     * 切换缓存信息折叠状态
     */
    toggleCacheSection() {
      this.setData({
        showCacheSection: !this.data.showCacheSection
      });
    },

    /**
     * 切换缓存详情显示
     */
    toggleCacheDetail(e) {
      const index = e.currentTarget.dataset.index;
      const cacheInfo = this.data.cacheInfo;
      
      // 更新showDetail状态
      cacheInfo[index].showDetail = !cacheInfo[index].showDetail;
      
      this.setData({
        cacheInfo: cacheInfo
      });
    },

    /**
     * 切换文件统计折叠状态
     */
    toggleFileSection() {
      this.setData({
        showFileSection: !this.data.showFileSection
      });
    },

    /**
     * 测试点击事件
     */
    testClick() {
      console.log('[测试] 测试点击事件被触发');
      wx.showToast({
        title: '点击事件正常',
        icon: 'success'
      });
    },

    /**
     * 预览图片
     */
    async previewImage(e) {
      const src = e.currentTarget ? e.currentTarget.dataset.src : null;
      
      if (!src) {
        console.warn('[图片预览] 图片路径为空');
        wx.showToast({
          title: '图片路径无效',
          icon: 'none',
          duration: 2000
        });
        return;
      }

      try {
        const fs = wx.getFileSystemManager();
        
        // 首先检查文件是否存在
        const fileExists = await new Promise((resolve) => {
          fs.access({
            path: src,
            success: () => resolve(true),
            fail: () => resolve(false)
          });
        });

        if (!fileExists) {
          console.warn('[图片预览] 文件不存在:', src);
          wx.showModal({
            title: '文件不存在',
            content: `图片文件不存在或已被删除\n路径: ${src}`,
            showCancel: false,
            confirmText: '确定'
          });
          return;
        }

        // 获取文件信息
        const fileInfo = await new Promise((resolve, reject) => {
          fs.stat({
            path: src,
            success: resolve,
            fail: reject
          });
        });


        // 如果是图片文件，尝试预览
        if (this.isImageFile(src)) {
          // 尝试直接预览
          wx.previewImage({
            current: src,
            urls: [src],
            fail: async (error) => {
              console.error('[图片预览] 直接预览失败:', error);
              
              // 如果直接预览失败，尝试读取文件并转换为临时路径
              try {
                const tempFilePath = await this.copyToTempFile(src);
                if (tempFilePath) {
                  wx.previewImage({
                    current: tempFilePath,
                    urls: [tempFilePath],
                    success: () => {
                      console.log('[图片预览] 临时文件预览成功');
                    },
                    fail: (tempError) => {
                      console.error('[图片预览] 临时文件预览也失败:', tempError);
                      this.showFileInfo(src, fileInfo);
                    }
                  });
                } else {
                  this.showFileInfo(src, fileInfo);
                }
              } catch (copyError) {
                console.error('[图片预览] 复制到临时文件失败:', copyError);
                this.showFileInfo(src, fileInfo);
              }
            }
          });
        } else {
          // 不是图片文件，显示文件信息
          this.showFileInfo(src, fileInfo);
        }

      } catch (error) {
        console.error('[图片预览] 处理文件时出错:', error);
        wx.showModal({
          title: '文件处理失败',
          content: `处理文件时出错\n路径: ${src}\n错误: ${error.message || error}`,
          showCancel: false,
          confirmText: '确定'
        });
      }
    },

    /**
     * 判断是否为图片文件
     */
    isImageFile(filePath) {
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
      const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
      return imageExtensions.includes(ext);
    },

    /**
     * 复制文件到临时目录
     */
    async copyToTempFile(srcPath) {
      try {
        const fs = wx.getFileSystemManager();
        const tempDir = wx.env.USER_DATA_PATH;
        const fileName = srcPath.substring(srcPath.lastIndexOf('/') + 1);
        const tempPath = `${tempDir}/temp_${Date.now()}_${fileName}`;
        
        await new Promise((resolve, reject) => {
          fs.copyFile({
            srcPath: srcPath,
            destPath: tempPath,
            success: resolve,
            fail: reject
          });
        });
        
        console.log('[图片预览] 文件已复制到临时路径:', tempPath);
        return tempPath;
      } catch (error) {
        console.error('[图片预览] 复制文件失败:', error);
        return null;
      }
    },

    /**
     * 显示文件信息
     */
    showFileInfo(filePath, fileInfo) {
      const sizeStr = this.formatSize(fileInfo.size || 0);
      const modifyTime = fileInfo.lastModifiedTime ? new Date(fileInfo.lastModifiedTime).toLocaleString() : '未知';
      const createTimeStr = fileInfo.createTime ? this.formatCreateTime(fileInfo.createTime) : '未知';
      
      wx.showModal({
        title: '文件信息',
        content: `路径: ${filePath}\n大小: ${sizeStr}\n存储时间: ${createTimeStr}\n修改时间: ${modifyTime}\n\n${this.isImageFile(filePath) ? '图片预览失败，可能是文件格式不支持' : '此文件不是图片格式'}`,
        showCancel: false,
        confirmText: '确定'
      });
    },

    /**
     * 切换文件详情显示状态
     */
    toggleFileDetails(e) {
      const type = e.currentTarget.dataset.type;
      const fileStats = [...this.data.fileStats];
      
      // 查找并切换展开状态
      for (let i = 0; i < fileStats.length; i++) {
        if (fileStats[i].type === type) {
          fileStats[i].expanded = !fileStats[i].expanded;
          
          // 如果是展开状态且没有文件详情，则使用已有的files数据
          if (fileStats[i].expanded && fileStats[i].files) {
            console.log(`[文件详情] 展开 ${type}, 文件数量: ${fileStats[i].files.length}`);
          }
          break;
        }
      }
      
      this.setData({ fileStats });
    },

     /**
     * 加载文件详情
     */
    async loadFileDetails(item, fileType) {
      try {
        const fileDetails = this.data.fileDetails || {};
        
        // 如果已经有详情，不需要重新加载
        if (item.details && item.details.length > 0) {
          return;
        }
        
        // 如果已经缓存了详情，直接使用
        if (fileDetails[fileType]) {
          item.details = fileDetails[fileType];
          this.setData({ fileStats: this.data.fileStats });
          return;
        }
        
        const files = [];
        
        // 根据文件类型加载对应的文件详情
        if (fileType.includes('image') || fileType.includes('moment') || fileType.includes('avatar') || fileType.includes('background') || fileType.includes('carousel')) {
          // 加载保存的文件详情
          await this.loadSavedFileDetails(fileType, files);
        } else if (fileType.includes('本地存储') || fileType.includes('localStorage')) {
          // 加载本地存储详情
          this.loadStorageDetails(files);
        } else if (fileType.includes('页面缓存') || fileType.includes('pageCache')) {
          // 加载页面缓存详情
          this.loadPageCacheDetails(files); 
        } else {
          // 对于其他类型，暂时不加载详情
          files.push({
            path: `${fileType} 类型文件`,
            size: item.size
          });
        }
        
        // 缓存文件详情
        if (!this.data.fileDetails) {
          this.setData({ fileDetails: {} });
        }
        this.data.fileDetails[fileType] = files;
        
        // 更新界面
        item.details = files;
        this.setData({ fileStats: this.data.fileStats });
        
      } catch (error) {
        console.error('加载文件详情失败:', error);
        wx.showToast({
          title: '加载详情失败',
          icon: 'none'
        });
      }
    },

     /**
      * 加载保存文件的详情
      */
     async loadSavedFileDetails(fileType, files) {
       try {
         const fs = wx.getFileSystemManager();
         const savedFileList = await new Promise((resolve, reject) => {
           fs.getSavedFileList({
             success: resolve,
             fail: reject
           });
         });
         
         if (savedFileList && savedFileList.fileList) {
           for (const file of savedFileList.fileList) {
             const detectedType = this.getFileTypeFromPath(file.filePath);
             // 使用包含匹配，支持更灵活的文件类型匹配
             if (detectedType === fileType || 
                 (fileType.includes('image') && detectedType.includes('image')) ||
                 (fileType.includes('moment') && detectedType.includes('moment')) ||
                 (fileType.includes('avatar') && detectedType.includes('avatar')) ||
                 (fileType.includes('background') && detectedType.includes('background'))) {
               files.push({
                 path: file.filePath,
                 size: this.formatSize(file.size || 0)
               });
             }
           }
         }
       } catch (error) {
         console.warn('加载保存文件详情失败:', error);
       }
     },

     /**
      * 加载本地存储详情
      */
     loadStorageDetails(files) {
       try {
         const storageInfo = wx.getStorageInfoSync();
         if (storageInfo && storageInfo.keys) {
           for (const key of storageInfo.keys) {
             try {
               const value = wx.getStorageSync(key);
               const size = this.calculateSize(value);
               files.push({
                 path: `storage://${key}`,
                 size: this.formatSize(size)
               });
             } catch (error) {
               console.warn(`获取存储项 ${key} 失败:`, error);
             }
           }
         }
       } catch (error) {
         console.warn('加载本地存储详情失败:', error);
       }
     },

     /**
      * 加载页面缓存详情
      */
     loadPageCacheDetails(files) {
       try {
         const pages = getCurrentPages();
         if (pages && pages.length > 0) {
           for (let i = 0; i < pages.length; i++) {
             const page = pages[i];
             if (page.data && page.data.imageCache) {
               const cacheMap = page.data.imageCache;
               if (cacheMap && typeof cacheMap.forEach === 'function') {
                 cacheMap.forEach((cacheItem, fileID) => {
                   files.push({
                     path: `page[${i}]://${fileID}`,
                     size: this.formatSize(cacheItem.size || 0)
                   });
                 });
               }
             }
           }
         }
       } catch (error) {
         console.warn('加载页面缓存详情失败:', error);
       }
     },

     /**
      * 加载目录文件详情
      */
     async loadDirectoryFileDetails(fileType, files) {
       try {
         const fs = wx.getFileSystemManager();
         
         // 根据文件类型确定要扫描的目录
         const dirName = fileType.split('_')[0]; // 例如 userData_image -> userData
         const targetFileType = fileType.split('_')[1] || fileType; // 例如 userData_image -> image
         
         // 动态获取存储目录
         const storageDirectories = [];
         
         // 添加根目录
         storageDirectories.push({ name: 'userData', path: wx.env.USER_DATA_PATH });
         
         // 递归扫描所有子目录
         const scanSubDirectories = (basePath, relativePath = '') => {
           try {
             const dirStat = fs.statSync(basePath);
             if (dirStat.isDirectory()) {
               const dirList = fs.readdirSync(basePath);
               for (const item of dirList) {
                 const itemPath = basePath + '/' + item;
                 const itemRelativePath = relativePath ? `${relativePath}/${item}` : item;
                 try {
                   const itemStat = fs.statSync(itemPath);
                   if (itemStat.isDirectory()) {
                     storageDirectories.push({ name: itemRelativePath, path: itemPath });
                     // 递归扫描子目录
                     scanSubDirectories(itemPath, itemRelativePath);
                   }
                 } catch (error) {
                   // 忽略无法访问的目录
                 }
               }
             }
           } catch (error) {
             // 忽略扫描错误
           }
         };
         
         try {
           scanSubDirectories(wx.env.USER_DATA_PATH);
         } catch (error) {
           // 忽略扫描错误
         }
         
         const targetDir = storageDirectories.find(dir => dir.name === dirName);
         if (targetDir) {
           await this.scanDirectoryForDetails(fs, targetDir.path, targetFileType, files);
         }
       } catch (error) {
         console.warn('加载目录文件详情失败:', error);
       }
     },

     /**
      * 扫描目录获取文件详情
      */
     async scanDirectoryForDetails(fs, dirPath, targetFileType, files, maxDepth = 3, currentDepth = 0) {
       if (currentDepth >= maxDepth) return;
       
       try {
         const stat = fs.statSync(dirPath);
         if (!stat.isDirectory()) return;
         
         const fileList = fs.readdirSync(dirPath);
         
         for (const fileName of fileList) {
           try {
             const filePath = `${dirPath}/${fileName}`;
             const fileStat = fs.statSync(filePath);
             
             if (fileStat.isFile()) {
               const fileType = this.getFileType(fileName);
               // 使用更灵活的文件类型匹配
               let shouldInclude = false;
               
               if (fileType === targetFileType) {
                 shouldInclude = true;
               } else if (targetFileType.includes('_')) {
                 // 处理目录前缀类型，如 userData_avatar-image
                 const [dirPrefix, actualType] = targetFileType.split('_');
                 if (actualType.includes('-')) {
                   // 处理复合类型，如 avatar-image
                   const [prefix, suffix] = actualType.split('-');
                   if (fileType === suffix && fileName.toLowerCase().includes(prefix.toLowerCase())) {
                     shouldInclude = true;
                   }
                 } else if (fileType === actualType) {
                   shouldInclude = true;
                 }
               } else if (targetFileType.includes('-')) {
                 // 处理复合类型，如 avatar-image
                 const [prefix, suffix] = targetFileType.split('-');
                 if (fileType === suffix && fileName.toLowerCase().includes(prefix.toLowerCase())) {
                   shouldInclude = true;
                 }
               } else if (targetFileType === 'image' && fileType.includes('image')) {
                 // 通用图片类型匹配
                 shouldInclude = true;
               }
               
               if (shouldInclude) {
                 files.push({
                   path: filePath,
                   size: this.formatSize(fileStat.size || 0)
                 });
               }
             } else if (fileStat.isDirectory()) {
               await this.scanDirectoryForDetails(fs, filePath, targetFileType, files, maxDepth, currentDepth + 1);
             }
           } catch (error) {
             console.warn(`处理文件失败: ${fileName}`, error);
           }
         }
       } catch (error) {
         console.warn(`扫描目录失败: ${dirPath}`, error);
       }
     }
   }
 });
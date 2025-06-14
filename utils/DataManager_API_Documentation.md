# DataManager 数据管理器 API 文档

## 概述

DataManager 是一个通用的数据管理模板类，专为情侣日记小程序的数据管理而设计。它提供了完整的数据存储、缓存、懒加载和智能清理功能，支持文本和图片数据的统一管理。

## 核心特性

- **三层存储架构**：云端数据库 + 本地缓存 + 图片文件缓存
- **智能缓存管理**：自动清理过期数据，优化存储空间
- **懒加载支持**：分页加载，提升性能
- **图片压缩上传**：自动压缩图片，节省存储空间
- **增量更新**：对比云端和本地数据，只更新新增内容

## 构造函数

### `constructor(options = {})`

**功能**：初始化DataManager实例

**参数配置**：

```javascript
const dataManager = new DataManager({
  collectionName: 'ld_movie_plans',    // 数据库集合名
  cachePrefix: 'moviePlans',           // 缓存前缀
  pageSize: 20,                        // 每页加载数量
  cleanupInterval: 2,                  // 清理间隔（天）
  retentionPeriod: 30,                 // 数据保留期（天）
  hasImages: false,                    // 是否包含图片
  timestampField: 'timestamp',         // 时间戳字段名
  sortField: 'timestamp',              // 排序字段
  sortOrder: 'desc'                    // 排序方式
});
```

**调用时机**：页面初始化时，通常在页面的 `onLoad` 或 `onReady` 生命周期中调用

## 核心数据操作方法

### 1. `getData(isRefresh = false, isLoadMore = false, extraQuery = {})`

**功能**：获取数据，支持刷新和懒加载

**参数**：

- `isRefresh`: 是否为刷新操作
- `isLoadMore`: 是否为加载更多操作
- `extraQuery`: 额外的查询条件

**返回值**：`Promise<Array>` - 数据列表

**调用流程**：

1. 检查是否正在加载中，避免重复请求
2. 构建查询条件（包含coupleId和额外条件）
3. 根据操作类型设置分页参数
4. 查询云端数据库
5. 检查是否有新数据（对比时间戳和ID）
6. 如果有新数据，缓存图片（如果启用）并更新本地缓存
7. 如果没有新数据，应用本地图片缓存路径
8. 返回处理后的数据

**调用时机**：

- 页面首次加载：`getData()`
- 下拉刷新：`getData(true)`
- 上拉加载更多：`getData(false, true)`

### 2. `publishData(data)`

**功能**：发布新内容到云端并更新本地缓存

**参数**：

- `data`: 要发布的数据对象

**返回值**：`Promise<Object>` - 发布后的完整数据对象

**调用流程**：

1. 添加基础字段（coupleId、timestamp、_openid）
2. 如果包含图片，先压缩并上传图片
3. 上传数据到云端数据库
4. 获取本地缓存数据
5. 将新数据插入到缓存开头
6. 如果包含图片，缓存图片到本地
7. 更新本地缓存

**调用时机**：用户提交新内容时（如发布新的计划、动态等）

### 3. `updateData(dataId, updateData)`

**功能**：更新指定数据

**参数**：

- `dataId`: 数据ID
- `updateData`: 要更新的数据

**调用流程**：

1. 更新云端数据
2. 更新本地缓存中对应的数据项
3. todo： 好像没有本地图片内容更新

**调用时机**：用户编辑已有内容时

### 4. `deleteData(dataId, dataItem = null)`

**功能**：删除指定数据及其关联资源

**参数**：

- `dataId`: 数据ID
- `dataItem`: 数据项（用于清理关联资源）

**调用流程**：

1. 如果包含图片，删除云端和本地图片文件
2. 删除云端数据
3. 从本地缓存中移除数据

**调用时机**：用户删除内容时

## 缓存管理方法

### 5. `getLocalCachedData()`

**功能**：获取本地缓存的数据

**返回值**：`Array` - 缓存数据数组

**调用流程**：

1. 从本地存储读取缓存数据
2. 验证数据格式，确保是数组类型
3. 按时间戳排序返回

**调用时机**：内部方法，在数据操作时自动调用

### 6. `updateLocalCache(data)`

**功能**：更新本地缓存

**参数**：

- `data`: 要缓存的数据数组

**调用流程**：

1. 限制缓存数据量（最多保留10页数据）
2. 使用wx.setStorageSync保存到本地存储

**调用时机**：数据发生变化时自动调用

### 7. `smartCacheCleanup()`

**功能**: 智能清理过期的缓存数据，并调用smartImageCleanup删除本地图片文件

**参数**: 无

**返回值**: 无

**调用流程**:
1. 计算过期时间（当前时间 - 保留期限）
2. 遍历缓存数据，检查每项数据的最后访问时间
3. 标记过期的数据项进行删除
4. 如果启用了图片功能(hasImages为true)，调用smartImageCleanup方法：
   - 实际删除过期的本地图片文件
   - 清理图片缓存映射
   - 释放本地存储空间
5. 更新本地缓存，只保留未过期的数据
6. 更新清理时间统计
7. 记录清理结果和释放的存储空间

**调用时机**: 定期自动调用或手动触发

**重要更新**: 现在会实际删除本地图片文件，而不仅仅是清理缓存信息

## 图片处理方法（hasImages=true时启用）

### 8. `uploadImages(imagePaths)`

**功能**：上传图片到云存储

**参数**：

- `imagePaths`: 本地图片路径数组

**返回值**：`Promise<Array>` - 云存储文件ID数组

**调用流程**：

1. 遍历图片路径
2. 压缩每张图片
3. 上传到云存储
4. 返回文件ID数组

**调用时机**：发布包含图片的内容时

### 8.1. `smartImageCleanup`

**功能**: 智能清理过期的本地图片缓存文件和图片缓存映射，实际删除本地存储的图片文件

**参数**:
- `expireTime` (number): 过期时间戳

**返回值**: Promise<number> - 清理的文件大小

**调用流程**:
1. 检查是否启用图片功能
2. 遍历图片缓存，找出过期项目
3. 使用wx.getFileSystemManager().unlink()删除本地图片文件
4. 从图片缓存映射中移除过期项
5. 更新缓存统计
6. 记录清理结果和释放的存储空间
7. 返回清理的文件大小

**调用时机**: 由smartCacheCleanup自动调用，当hasImages配置为true时

**重要说明**: 此方法会实际删除设备本地存储的图片文件，释放本地存储空间

### 9. `compressImage(imagePath)`

**功能**：压缩图片

**参数**：

- `imagePath`: 图片路径

**返回值**：`Promise<string>` - 压缩后的图片路径

**调用时机**：上传图片前自动调用

### 10. `smartImageCache(fileID)`

**功能**：智能图片缓存

**参数**：

- `fileID`: 云存储文件ID

**返回值**：`Promise<string>` - 本地缓存路径

**调用流程**：

1. 检查是否已缓存且文件存在
2. 如果已缓存，更新访问时间并返回本地路径
3. 如果未缓存，下载图片到本地
4. 保存文件并添加到缓存映射
5. 更新缓存统计信息

**调用时机**：显示图片时自动调用

### 11. `getCachedImagePath(fileID)`

**功能**：获取缓存的图片路径

**参数**：

- `fileID`: 云存储文件ID

**返回值**：`string` - 本地缓存路径或原始路径

**调用时机**：显示图片时调用

## 辅助方法

### 12. `checkForNewData(cloudData, cachedData)`

**功能**：检查是否有新数据

**参数**：

- `cloudData`: 云端数据
- `cachedData`: 缓存数据

**返回值**：`boolean` - 是否有新数据

**检查逻辑**：

1. 如果本地无缓存，返回true
2. 比较最新数据的时间戳
3. 比较数据ID集合

### 13. `mergeWithCachedData(newData, cachedData)`

**功能**：合并新数据和缓存数据

**参数**：

- `newData`: 新数据
- `cachedData`: 缓存数据

**返回值**：`Array` - 合并后的数据

**合并逻辑**：

1. 创建新数据ID集合
2. 过滤掉缓存中已存在的数据
3. 新数据在前，旧数据在后

### 14. `resetPagination()`

**功能**：重置分页状态

**调用时机**：刷新数据时

### 15. `getPaginationState()`

**功能**：获取当前分页状态

**返回值**：包含currentSkip、hasMore、loading、pageSize的对象

### 16. `getCacheStats()`

**功能**：获取缓存统计信息

**返回值**：包含缓存大小、图片数量、使用率等信息的对象

### 17. `manualCacheCleanup(force = false)`

**功能**：手动清理缓存

**参数**：

- `force`: 是否强制清理所有缓存

**调用时机**：用户主动清理缓存或系统维护时

## 典型使用场景

### 场景1：页面初始化加载数据

```javascript
// 页面onLoad生命周期
onLoad() {
  this.dataManager = new DataManager({
    collectionName: 'ld_movie_plans',
    cachePrefix: 'moviePlans',
    pageSize: 20
  });
  
  this.loadData();
},

async loadData() {
  try {
    const data = await this.dataManager.getData();
    this.setData({ planList: data });
  } catch (error) {
    console.error('加载数据失败', error);
  }
}
```

### 场景2：下拉刷新

```javascript
async onPullDownRefresh() {
  try {
    const data = await this.dataManager.getData(true); // isRefresh = true
    this.setData({ planList: data });
    wx.stopPullDownRefresh();
  } catch (error) {
    wx.stopPullDownRefresh();
    console.error('刷新失败', error);
  }
}
```

### 场景3：上拉加载更多

```javascript
async onReachBottom() {
  const { hasMore, loading } = this.dataManager.getPaginationState();
  if (!hasMore || loading) return;
  
  try {
    const moreData = await this.dataManager.getData(false, true); // isLoadMore = true
    const currentList = this.data.planList;
    this.setData({ 
      planList: [...currentList, ...moreData] 
    });
  } catch (error) {
    console.error('加载更多失败', error);
  }
}
```

### 场景4：发布新内容

```javascript
async publishPlan(planData) {
  try {
    const newPlan = await this.dataManager.publishData(planData);
    const currentList = this.data.planList;
    this.setData({ 
      planList: [newPlan, ...currentList] 
    });
  } catch (error) {
    console.error('发布失败', error);
  }
}
```

## 注意事项

1. **数据库命名规范**：集合名必须以 `ld_`开头，如 `ld_movie_plans`
2. **缓存清理**：系统会自动清理过期缓存，默认每2天清理1个月前的数据
3. **图片压缩**：所有上传的图片都会自动压缩，质量设为80%
4. **分页加载**：默认每页20条数据，可通过pageSize配置
5. **错误处理**：所有方法都包含完善的错误处理和日志记录
6. **性能优化**：使用智能缓存和懒加载，避免一次性加载大量数据

## 配置建议

### 计划类数据（不含图片）

```javascript
const planDataManager = new DataManager({
  collectionName: 'ld_movie_plans',
  cachePrefix: 'moviePlans',
  pageSize: 20,
  cleanupInterval: 2,
  retentionPeriod: 30,
  hasImages: false
});
```

### 动态类数据（含图片）

```javascript
const spaceDataManager = new DataManager({
  collectionName: 'ld_couple_space',
  cachePrefix: 'coupleSpace',
  pageSize: 10,
  cleanupInterval: 1,
  retentionPeriod: 60,
  hasImages: true
});
```

这份文档涵盖了DataManager的所有核心功能和使用方法，可以作为开发团队的参考手册。

# 情侣计划统计功能重构文档

## 概述
本次重构将情侣计划的统计功能从本地缓存统计改为云端数据库统计，提高数据一致性和可靠性。

## 重构内容

### 1. 删除的功能

#### 1.1 plan.js 中删除的方法
- `loadPlanCounts()` - 从缓存加载计划数量统计
- `updatePlanCounts()` - 更新计划统计数量
- 删除了 `data` 中的计划列表数组（moviePlans, cookingPlans等）
- 删除了 `onShow()` 中的缓存统计检查逻辑

#### 1.2 movie.js 中删除的方法
- `updateCouplePlansCache()` - 更新情侣计划页面的统一缓存
- `removeFromCouplePlansCache()` - 从情侣计划页面的统一缓存中移除电影计划
- `notifyPlanPageUpdate()` - 通知情侣计划页面更新统计数据
- 删除了所有调用 `notifyPlanPageUpdate()` 的代码

### 2. 新增的功能

#### 2.1 云端统计表结构
**表名**: `ld_plans_count`

**字段说明**:
- `coupleId` (string) - 情侣ID
- `planType` (string) - 计划类型 (movie, cooking, exercise, travel, memo, shop)
- `count` (number) - 统计数量
- `createTime` (Date) - 创建时间
- `updateTime` (Date) - 更新时间

#### 2.2 直接数据库操作（已移除云函数）
**说明**: 原计划使用云函数 `updatePlanCount`，但根据用户需求，改为直接操作数据库

**操作方式**: 在小程序端直接使用 `wx.cloud.database()` 操作 `ld_plans_count` 表

**优势**:
- 减少云函数调用开销
- 简化部署流程
- 提高响应速度
- 降低维护成本

#### 2.3 新增的方法

**plan.js**:
- `loadPlanCountsFromCloud()` - 从云端数据库加载计划统计数据

**movie.js**:
- `updatePlanCountInCloud(type, change)` - 更新云端统计数据

### 3. 修改的功能

#### 3.1 数据结构调整
**plan.js data 结构变更**:
```javascript
// 删除
moviePlans: [],
cookingPlans: [],
exercisePlans: [],
travelPlans: [],
memoPlans: [],
shopPlans: [],

// 新增
planCounts: {
  movie: 0,
  cooking: 0,
  exercise: 0,
  travel: 0,
  memo: 0,
  shop: 0
}
```

#### 3.2 页面模板更新
**plan.wxml 变更**:
```html
<!-- 原来 -->
<text class="card-count">{{moviePlans.length}}</text>

<!-- 现在 -->
<text class="card-count">{{planCounts.movie}}</text>
```

#### 3.3 统计更新时机
**movie.js 中的更新调用**:
- 添加计划后: `await this.updatePlanCountInCloud('movie', 1)`
- 删除计划后: `await this.updatePlanCountInCloud('movie', -1)`

### 4. 工作流程

#### 4.1 统计数据加载流程
1. 用户进入情侣计划页面
2. 调用 `loadPlanCountsFromCloud()`
3. 查询 `ld_plans_count` 表
4. 更新页面显示的统计数据

#### 4.2 统计数据更新流程
1. 用户在具体计划页面添加/删除计划
2. 调用 `updatePlanCountInCloud(type, change)`
3. 直接操作数据库更新 `ld_plans_count` 表中的对应记录

### 5. 优势

1. **数据一致性**: 统计数据直接存储在云端，避免本地缓存不同步问题
2. **实时性**: 统计数据实时更新，无需手动刷新
3. **可靠性**: 云端数据库保证数据持久性和可靠性
4. **性能优化**: 减少本地缓存操作，提高页面响应速度
5. **维护简化**: 统一的统计数据管理，减少代码复杂度

### 6. 注意事项

1. **数据库权限**: 确保小程序有 `ld_plans_count` 表的读写权限
2. **错误处理**: 统计更新失败时的降级处理
3. **数据迁移**: 如果已有缓存数据，需要考虑数据迁移策略
4. **网络异常**: 处理网络异常情况下的数据一致性

### 7. 后续扩展

1. **其他计划类型**: 可以轻松扩展到其他计划类型的统计
2. **统计分析**: 可以基于统计数据进行更深入的数据分析
3. **实时同步**: 可以考虑使用数据库监听实现实时统计同步

## 部署步骤

1. 在云开发控制台创建 `ld_plans_count` 集合
2. 设置适当的数据库权限（确保小程序可读写）
3. 测试统计功能是否正常工作
4. 验证数据库直接操作的性能和稳定性

## 测试建议

1. 测试添加计划后统计数据是否正确更新
2. 测试删除计划后统计数据是否正确减少
3. 测试多用户并发操作的数据一致性
4. 测试网络异常情况下的错误处理
# 数据库集合初始化指南

## 需要创建的集合

根据情侣计划页面的需求，需要在微信云开发数据库中创建以下集合：

### 1. ld_movie_plans (电影计划)

```json
{
  "_id": "自动生成",
  "movieName": "电影名称",
  "movieInfo": "电影信息",
  "watched": false,
  "status": "pending",
  "createTime": "创建时间",
  "coupleId": "情侣ID",
  "createdBy": "创建者openid",
  "originalText": "原始输入文本"
}
```

### 2. ld_cooking_plans (烹饪计划)

```json
{
  "_id": "自动生成",
  "ingredients": ["食材列表"],
  "portions": ["用量列表"],
  "tried": false,
  "rating": 0,
  "status": "pending",
  "createTime": "创建时间",
  "coupleId": "情侣ID",
  "createdBy": "创建者openid",
  "originalText": "原始输入文本"
}
```

### 3. ld_exercise_plans (运动打卡)

```json
{
  "_id": "自动生成",
  "targetWeight": 0,
  "currentWeight": 0,
  "weightHistory": [],
  "status": "pending",
  "createTime": "创建时间",
  "coupleId": "情侣ID",
  "createdBy": "创建者openid",
  "originalText": "原始输入文本"
}
```

### 4. ld_travel_plans (旅游计划)

```json
{
  "_id": "自动生成",
  "itinerary": "行程信息",
  "travelDate": "旅行日期",
  "visited": false,
  "status": "pending",
  "createTime": "创建时间",
  "coupleId": "情侣ID",
  "createdBy": "创建者openid",
  "originalText": "原始输入文本"
}
```

### 5. ld_memo_plans (临时备忘)

```json
{
  "_id": "自动生成",
  "memo": "备忘内容",
  "category": "general",
  "status": "pending",
  "createTime": "创建时间",
  "coupleId": "情侣ID",
  "createdBy": "创建者openid",
  "originalText": "原始输入文本"
}
```

### 6. ld_shop_plans (探店计划)

```json
{
  "_id": "自动生成",
  "region": "地区",
  "shopName": "店铺名称",
  "visited": false,
  "status": "pending",
  "createTime": "创建时间",
  "coupleId": "情侣ID",
  "createdBy": "创建者openid",
  "originalText": "原始输入文本"
}
```

## 创建步骤

1. 打开微信开发者工具
2. 进入云开发控制台
3. 选择数据库
4. 点击"新建集合"
5. 分别创建上述6个集合
6. 设置适当的权限（建议设置为"仅创建者可读写"）

## 权限设置建议

```json
{
  "read": "doc.coupleId == auth.custom.coupleId",
  "write": "doc.coupleId == auth.custom.coupleId"
}
```

## 索引建议

为提高查询性能，建议为以下字段创建索引：

- coupleId (所有集合)
- createTime (所有集合)
- status (所有集合)

// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 初始化数据库集合
 * @description 创建情侣计划功能所需的所有数据库集合
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  console.log('开始初始化数据库集合', {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID
  })
  
  try {
    // 支持外部传参
    const collectionNames = Array.isArray(event.collectionNames) && event.collectionNames.length > 0
      ? event.collectionNames
      : [
          'ld_memo_plans',
          'ld_exercise_plans', 
          'ld_travel_plans',
          'ld_movie_plans',
          'ld_cooking_plans',
          'ld_shop_plans'
        ];

    const results = [];
    
    // 遍历每个集合名称
    for (const collectionName of collectionNames) {
      try {
        console.log(`--------------------------`);

        console.log(`正在创建集合---------: ${collectionName}`);
        
        // 使用正确的方法创建集合
        const createResult = await db.createCollection(collectionName);
        
        console.log(`集合 ${collectionName} 创建成功:`, createResult);
        
        results.push({
          collection: collectionName,
          success: true,
          message: '集合创建成功'
        });
        
      } catch (error) {
        console.error(`集合 ${collectionName} 创建失败:`, error);
        
        // 如果是集合已存在的错误，也算作成功
        if (error.message && error.message.includes('already exists')) {
          results.push({
            collection: collectionName,
            success: true,
            message: '集合已存在'
          });
        } else {
          results.push({
            collection: collectionName,
            success: false,
            error: error.message
          });
        }
      }
    }
    
    console.log('数据库集合初始化完成', { results })
    
    return {
      success: true,
      message: '数据库集合初始化完成',
      results: results,
      timestamp: new Date()
    }
    
  } catch (error) {
    console.error('数据库初始化失败', { error: error.message })
    
    return {
      success: false,
      error: error.message,
      timestamp: new Date()
    }
  }
}

/**
 * 修改集合权限
 * @param {string} collectionName 集合名
 * @param {object} rule 权限规则
 */
exports.setCollectionPermission = async (event, context) => {
  const { collectionName, rule } = event
  if (!collectionName || !rule) {
    return { success: false, message: '缺少参数' }
  }
  try {
    // 设置集合权限
    await db.collection(collectionName).setAcl(rule)
    return { success: true, message: '权限修改成功' }
  } catch (error) {
    return { success: false, message: error.message }
  }
}
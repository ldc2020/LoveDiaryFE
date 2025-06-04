// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const { userId, coupleId, partnerId } = event
  
  console.log('解绑云函数开始执行:', { userId, coupleId, partnerId })
  
  try {
    // 参数验证
    if (!userId || !coupleId || !partnerId) {
      return {
        success: false,
        message: '缺少必要参数'
      }
    }
    
    // 开始事务操作
    const transaction = await db.startTransaction()
    
    try {
      // 1. 更新当前用户的绑定状态
      await transaction.collection('ld_user_info').where({
        $or: [
          { openid: userId },
          { _openid: userId },
          { userId: userId }
        ]
      }).update({
        data: {
          coupleId: null,
          partnerId: null,
          bindTime: null,
          bindStatus: 'unbound'
        }
      })
      
      console.log('当前用户绑定状态已清除:', userId)
      
      // 2. 更新伴侣的绑定状态
      await transaction.collection('ld_user_info').where({
        $or: [
          { openid: partnerId },
          { _openid: partnerId },
          { userId: partnerId }
        ]
      }).update({
        data: {
          coupleId: null,
          partnerId: null,
          bindTime: null,
          bindStatus: 'unbound'
        }
      })
      
      console.log('伴侣绑定状态已清除:', partnerId)
      
      // 3. 删除或更新情侣绑定记录
      const coupleRecord = await transaction.collection('ld_couples').where({
        coupleId: coupleId
      }).get()
      
      if (coupleRecord.data && coupleRecord.data.length > 0) {
        await transaction.collection('ld_couples').where({
          coupleId: coupleId
        }).update({
          data: {
            status: 'unbound',
            unbindTime: new Date(),
            unbindBy: userId
          }
        })
        
        console.log('情侣绑定记录已更新为解绑状态:', coupleId)
      }
      
      // 提交事务
      await transaction.commit()
      
      console.log('解绑操作成功完成')
      
      return {
        success: true,
        message: '解绑成功',
        data: {
          userId,
          partnerId,
          coupleId,
          unbindTime: new Date()
        }
      }
      
    } catch (transactionError) {
      // 回滚事务
      await transaction.rollback()
      console.error('事务执行失败，已回滚:', transactionError)
      throw transactionError
    }
    
  } catch (error) {
    console.error('解绑操作失败:', error)
    return {
      success: false,
      message: error.message || '解绑操作失败',
      error: error
    }
  }
}
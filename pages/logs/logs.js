// 引入工具函数
const util = require('../../../utils/util.js')
const StorageManager = require('../../../utils/storageManager.js')

Page({
  data: {
    logs: []
  },
  onLoad() {
    this.setData({
      logs: (StorageManager.getStorage('logs') || []).map(log => {
        return {
          date: util.formatTime(new Date(log)),
          timeStamp: log
        }
      })
    })
  }
})
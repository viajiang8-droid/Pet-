const { contextBridge, ipcRenderer } = require('electron');

// 「创建我的宠物」弹窗的桥：读取已存的宠物信息、保存、取消。
contextBridge.exposeInMainWorld('createPetAPI', {
  get: () => ipcRenderer.invoke('create-pet:get'),
  save: (data) => ipcRenderer.send('create-pet:save', data),
  cancel: () => ipcRenderer.send('create-pet:cancel'),
});

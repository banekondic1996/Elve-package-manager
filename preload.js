const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  searchPackages: (query) => ipcRenderer.invoke('search-packages', query),
  listInstalled: () => ipcRenderer.invoke('list-installed'),
  checkInstalled: (packages) => ipcRenderer.invoke('check-installed', packages),
  installPackages: (packages, password) => ipcRenderer.invoke('install-packages', packages, password),
  checkUninstall: (packages) => ipcRenderer.invoke('check-uninstall', packages),
  uninstallPackages: (packages, password) => ipcRenderer.invoke('uninstall-packages', packages, password)
});
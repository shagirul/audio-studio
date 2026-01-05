import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  selectAudio: () => ipcRenderer.invoke('selectAudio'),
  readFileBase64: (payload: { filePath: string }) => ipcRenderer.invoke('readFileBase64', payload),
  chooseExportPath: (payload: { defaultName: string }) => ipcRenderer.invoke('chooseExportPath', payload),
  exportAudio: (payload: any) => ipcRenderer.invoke('exportAudio', payload),
  renderWaveform: (payload: any) => ipcRenderer.invoke('renderWaveform', payload),
  renderPreview: (payload: any) => ipcRenderer.invoke('renderPreview', payload)
});

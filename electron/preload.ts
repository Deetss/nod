import { contextBridge, ipcRenderer } from 'electron';
import type { NodBridge } from '../shared/bridge';
import type { NotifyTarget } from '../shared/notify-rules';

const bridge: NodBridge = {
  notify: (items) => ipcRenderer.invoke('notify', items),
  testNotify: () => ipcRenderer.invoke('notify:test'),
  onOpen: (cb) => {
    const handler = (_event: unknown, target: NotifyTarget) => cb(target);
    ipcRenderer.on('open', handler);
    return () => {
      ipcRenderer.removeListener('open', handler);
    };
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
};

contextBridge.exposeInMainWorld('nod', bridge);

import { NativeModules, Platform } from 'react-native';

interface DeviceActions {
  pinWidget(id: string): Promise<boolean>;
  checkReachability(id: string): Promise<boolean>;
  configureQuickTile(id: string): Promise<string>;
  openBackup(): Promise<boolean>;
}

export const deviceActions = (): DeviceActions => {
  if (Platform.OS !== 'android' || !NativeModules.DeviceActions) {
    throw new Error('These features require Android.');
  }
  return NativeModules.DeviceActions as DeviceActions;
};

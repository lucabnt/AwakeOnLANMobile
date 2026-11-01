import { NativeModules, Platform } from 'react-native';
import NativeModule from '../../specs/NativeModule';
import { DeviceType } from '../types/device';

interface ProtectedStorage {
  load(): Promise<string | null>;
  save(json: string): Promise<void>;
}

const storage = (): ProtectedStorage => {
  if (Platform.OS !== 'android' || !NativeModules.DeviceStorage) {
    throw new Error(
      'Protected device storage is currently available on Android only.',
    );
  }
  return NativeModules.DeviceStorage as ProtectedStorage;
};

export const validateDevices = (value: unknown): DeviceType[] => {
  if (!Array.isArray(value) || value.length > 1000) {
    throw new Error('Invalid device archive.');
  }
  const ids = new Set<string>();
  return value.map(item => {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.id !== 'string' ||
      !item.id ||
      item.id.includes('\0') ||
      item.id.length > 128 ||
      ids.has(item.id) ||
      typeof item.macAddr !== 'string' ||
      item.macAddr.includes('\0') ||
      !NativeModule.ValidMac(item.macAddr)
    ) {
      throw new Error('Invalid device archive.');
    }
    ids.add(item.id);
    const fields = [
      'name',
      'ipAddr',
      'port',
      'passwd',
      'statusIp',
      'statusPort',
    ] as const;
    for (const field of fields) {
      if (
        item[field] !== undefined &&
        (typeof item[field] !== 'string' ||
          item[field].length > 1024 ||
          item[field].includes('\0'))
      ) {
        throw new Error('Invalid device archive.');
      }
    }
    if (
      (item.ipAddr && !NativeModule.ValidIp(item.ipAddr)) ||
      (item.statusIp && !NativeModule.ValidIp(item.statusIp)) ||
      (item.statusPort &&
        (!/^\d{1,5}$/.test(item.statusPort) ||
          Number(item.statusPort) < 1 ||
          Number(item.statusPort) > 65535)) ||
      (item.port &&
        (!/^\d{1,5}$/.test(item.port) ||
          Number(item.port) < 1 ||
          Number(item.port) > 65535))
    ) {
      throw new Error('Invalid device archive.');
    }
    // Count UTF-8 bytes, matching both native senders (JS length counts UTF-16).
    let passwordBytes = 0;
    for (const character of item.passwd || '') {
      const code = character.codePointAt(0)!;
      passwordBytes +=
        code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    }
    if (passwordBytes > 1024) throw new Error('Invalid device archive.');
    // Explicitly select known fields; never persist arbitrary properties from an archive.
    return {
      id: item.id,
      macAddr: item.macAddr,
      name: item.name || '',
      ipAddr: item.ipAddr || '',
      port: item.port || '',
      passwd: item.passwd || '',
      statusIp: item.statusIp || '',
      statusPort: item.statusPort || '',
    };
  });
};

export const loadDevices = async (): Promise<DeviceType[]> => {
  const backend = storage();
  const json = await backend.load();
  if (json === null) {
    return [];
  }
  const devices = validateDevices(JSON.parse(json));
  // This also completes/retries legacy migration. A failed migration blocks edits.
  await backend.save(JSON.stringify(devices));
  return devices;
};

export const saveDevices = async (devices: DeviceType[]): Promise<void> => {
  await storage().save(JSON.stringify(validateDevices(devices)));
};

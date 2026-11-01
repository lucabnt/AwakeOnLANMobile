import { NativeModules, Platform } from 'react-native';
import {
  loadDevices,
  saveDevices,
  validateDevices,
} from '../src/storage/deviceStorage';

jest.mock('../specs/NativeModule', () => ({
  __esModule: true,
  default: {
    ValidMac: (value: string) =>
      /^(?:[a-f\d]{12}|(?:[a-f\d]{2}:){5}[a-f\d]{2})$/i.test(value),
    ValidIp: (value: string) => value === '192.168.1.255',
  },
}));

const device = { id: 'pc', macAddr: '001122334455', passwd: ' private ' };
const backend = { load: jest.fn(), save: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
  NativeModules.DeviceStorage = backend;
  backend.save.mockResolvedValue(undefined);
});

test('validates legacy data before committing encrypted migration and preserves password spaces', async () => {
  backend.load.mockResolvedValue(JSON.stringify([device]));
  const loaded = await loadDevices();
  expect(loaded[0].passwd).toBe(' private ');
  expect(JSON.parse(backend.save.mock.calls[0][0])).toEqual(loaded);
});

test.each([
  '{}',
  '[null]',
  '[{"id":"pc","macAddr":"bad"}]',
  JSON.stringify([device, device]),
])('does not overwrite an invalid archive: %s', async json => {
  backend.load.mockResolvedValue(json);
  await expect(loadDevices()).rejects.toThrow();
  expect(backend.save).not.toHaveBeenCalled();
});

test('does not silently load an empty list after decryption failure', async () => {
  backend.load.mockRejectedValue(new Error('Decryption failed'));
  await expect(loadDevices()).rejects.toThrow();
  expect(backend.save).not.toHaveBeenCalled();
});

test('does not permit edits if migration cannot finish', async () => {
  backend.load.mockResolvedValue(JSON.stringify([device]));
  backend.save.mockRejectedValue(new Error('Disk full'));
  await expect(loadDevices()).rejects.toThrow('Disk full');
});

test('rejects invalid ports, NUL characters, extra fields, and duplicate ids', () => {
  for (const port of ['0', '65536', '9abc', '-1']) {
    expect(() => validateDevices([{ ...device, port }])).toThrow();
  }
  expect(() =>
    validateDevices([{ ...device, passwd: 'bad\0password' }]),
  ).toThrow();
  expect(
    validateDevices([{ ...device, arbitrary: 'discard' }])[0],
  ).not.toHaveProperty('arbitrary');
});

test('surfaces save errors and never uses plaintext storage on an unsupported platform', async () => {
  backend.save.mockRejectedValue(new Error('Disk full'));
  await expect(saveDevices([device])).rejects.toThrow('Disk full');
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  backend.save.mockClear();
  await expect(saveDevices([device])).rejects.toThrow('Android only');
  expect(backend.save).not.toHaveBeenCalled();
});

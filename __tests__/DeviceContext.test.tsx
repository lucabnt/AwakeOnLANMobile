import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  DeviceProvider,
  useDeviceContext,
} from '../src/contexts/DeviceContext';
import { loadDevices, saveDevices } from '../src/storage/deviceStorage';
import { DeviceContextType } from '../src/types/device';

jest.mock('../src/storage/deviceStorage', () => ({
  loadDevices: jest.fn(),
  saveDevices: jest.fn(),
}));
const load = loadDevices as jest.MockedFunction<typeof loadDevices>;
const save = saveDevices as jest.MockedFunction<typeof saveDevices>;
let state: DeviceContextType;
const Probe = () => {
  state = useDeviceContext();
  return null;
};
let tree: ReactTestRenderer.ReactTestRenderer;
const pc = { id: 'pc', macAddr: '001122334455' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  load.mockResolvedValue([pc]);
  save.mockResolvedValue(undefined);
});
afterEach(async () => {
  if (tree) await act(() => tree.unmount());
});
const mount = async () => {
  await act(async () => {
    tree = ReactTestRenderer.create(
      <DeviceProvider>
        <Probe />
      </DeviceProvider>,
    );
  });
};

test('blocks writes when loading fails and allows retry without overwriting the original', async () => {
  load.mockRejectedValueOnce(new Error('Invalid key'));
  await mount();
  expect(state.storageError).toBeTruthy();
  await expect(state.addDevice(pc)).rejects.toThrow();
  expect(save).not.toHaveBeenCalled();
  await act(async () => {
    await state.retryLoad();
  });
  expect(state.devices).toEqual([pc]);
  expect(state.storageError).toBeNull();
});

test('keeps the list unchanged after a failed write and only confirms durable saves', async () => {
  await mount();
  save.mockRejectedValueOnce(new Error('Disk full'));
  await act(async () => {
    await expect(state.addDevice({ ...pc, id: 'other' })).rejects.toThrow();
  });
  expect(state.devices).toEqual([pc]);
  expect(Alert.alert).not.toHaveBeenCalled();
  await act(async () => {
    await state.addDevice({ ...pc, id: 'other' });
  });
  expect(state.devices).toHaveLength(2);
  expect(Alert.alert).toHaveBeenCalledTimes(1);
});

test('serializes concurrent updates without losing an addition', async () => {
  await mount();
  await act(async () => {
    await Promise.all([
      state.addDevice({ ...pc, id: 'second' }),
      state.addDevice({ ...pc, id: 'third' }),
    ]);
  });
  expect(state.devices.map(item => item.id)).toEqual(['pc', 'second', 'third']);
  expect(save.mock.calls.map(([devices]) => devices.length)).toEqual([2, 3]);
});

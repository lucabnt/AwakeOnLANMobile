import React from 'react';
import { Alert, Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { DeviceFlatList } from '../src/components/DeviceFlatList';
import NativeModule from '../specs/NativeModule';
import { CustomButton } from '../src/components/CustomButton';

jest.mock('../specs/NativeModule', () => ({
  __esModule: true,
  default: { SendWOL: jest.fn() },
}));
jest.mock('../src/contexts/DeviceContext', () => ({
  useDeviceContext: () => ({
    devices: [
      {
        id: 'pc',
        name: 'My PC',
        macAddr: '001122334455',
        passwd: 'secret-value',
      },
    ],
    deleteDevice: jest.fn(),
  }),
}));
jest.mock('../src/styles/flatList', () => ({
  useDeviceFlatListStyles: () => ({}),
}));

test('never displays passwords and confirms only successful sends', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(() => {
    tree = ReactTestRenderer.create(
      <DeviceFlatList setEditingDevice={() => {}} />,
    );
  });
  expect(
    JSON.stringify(
      tree.root.findAllByType(Text).map(node => node.props.children),
    ),
  ).not.toContain('secret-value');
  const wake = tree.root
    .findAllByType(CustomButton)
    .find(button => button.props.title === 'Wake')!;
  (NativeModule.SendWOL as jest.Mock).mockImplementationOnce(() => {
    throw new Error('Network error');
  });
  act(() => wake.props.onPress());
  expect(alert).toHaveBeenCalledTimes(1);
  expect(alert.mock.calls[0][0]).toBe('Wake On LAN failed');
  alert.mockClear();
  act(() => wake.props.onPress());
  expect(alert.mock.calls[0][0]).toContain('packet sent');
  expect(JSON.stringify(alert.mock.calls)).not.toContain('secret-value');
  await act(() => tree.unmount());
  alert.mockRestore();
});

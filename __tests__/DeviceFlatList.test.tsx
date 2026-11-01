import React from 'react';
import { Alert, Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { DeviceFlatList } from '../src/components/DeviceFlatList';
import NativeModule from '../specs/NativeModule';
import { CustomButton } from '../src/components/CustomButton';
import { deviceActions } from '../src/services/deviceActions';

jest.mock('../src/services/deviceActions', () => ({
  deviceActions: jest.fn(),
}));

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

test('shows uncertainty for unconfirmed status and sends only device IDs to native shortcuts', async () => {
  const actions = {
    checkReachability: jest.fn().mockResolvedValue(false),
    pinWidget: jest.fn().mockResolvedValue(true),
    configureQuickTile: jest.fn().mockResolvedValue('manual'),
  };
  (deviceActions as jest.Mock).mockReturnValue(actions);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(() => {
    tree = ReactTestRenderer.create(
      <DeviceFlatList setEditingDevice={() => {}} />,
    );
  });
  const button = (title: string) =>
    tree.root
      .findAllByType(CustomButton)
      .find(node => node.props.title === title)!;
  await act(async () => {
    await button('Status').props.onPress();
  });
  expect(alert.mock.calls.at(-1)?.[0]).toBe('Not verified');
  expect(actions.checkReachability).toHaveBeenCalledWith('pc');
  act(() => button('More').props.onPress());
  let choices = alert.mock.calls.at(-1)?.[2];
  await act(async () => {
    await choices?.find(choice => choice.text === 'Add widget')?.onPress?.();
  });
  expect(actions.pinWidget).toHaveBeenCalledWith('pc');
  act(() => button('More').props.onPress());
  choices = alert.mock.calls.at(-1)?.[2];
  await act(async () => {
    await choices
      ?.find(choice => choice.text === 'Use for Quick Settings')
      ?.onPress?.();
  });
  expect(actions.configureQuickTile).toHaveBeenCalledWith('pc');
  expect(JSON.stringify(alert.mock.calls)).not.toContain('secret-value');
  await act(() => tree.unmount());
  alert.mockRestore();
});

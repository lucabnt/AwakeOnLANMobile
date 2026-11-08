import React from 'react';
import { Alert, Button, Text, Platform } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { ScanHostsScreen } from '../src/screens/ScanHostsScreen';
import { DeviceToolsModal } from '../src/components/DeviceToolsModal';
import { AddDeviceScreen } from '../src/screens/AddDeviceScreen';
import { CustomButton } from '../src/components/CustomButton';
import NativeModule from '../specs/NativeModule';
import { deviceActions } from '../src/services/deviceActions';

const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockDevice = {
  id: 'pc',
  macAddr: '001122334455',
  ipAddr: '192.168.1.255',
  statusIp: '192.168.1.2',
};
jest.mock('../src/contexts/DeviceContext', () => ({
  useDeviceContext: () => ({ devices: [mockDevice], updateDevice: mockUpdate }),
}));
jest.mock('../src/screens/AddDeviceScreen', () => ({
  AddDeviceScreen: () => null,
}));
jest.mock('../src/styles/base', () => ({
  useBaseStyles: () => ({}),
  useColors: () => ({}),
  fonts: {},
}));
jest.mock('../src/styles/flatList', () => ({
  useDeviceFlatListStyles: () => ({}),
}));
jest.mock('../src/services/deviceActions', () => ({
  deviceActions: jest.fn(),
}));
jest.mock('../specs/NativeModule', () => ({
  __esModule: true,
  default: {
    ScanHosts: jest.fn(),
    ScanProgress: jest.fn(),
    CancelScan: jest.fn(),
  },
}));
const bridge = {
  currentSubnet: jest
    .fn()
    .mockResolvedValue(
      JSON.stringify({ cidr: '192.168.1.0/24', broadcast: '192.168.1.255' }),
    ),
  recoverIp: jest.fn(),
  diagnose: jest.fn(),
  diagnosticProgress: jest.fn().mockResolvedValue('{}'),
  cancelDiagnostics: jest.fn().mockResolvedValue(true),
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(28);
  (deviceActions as jest.Mock).mockReturnValue(bridge);
});
afterEach(() => jest.restoreAllMocks());
const texts = (tree: Renderer.ReactTestRenderer) =>
  JSON.stringify(
    tree.root.findAllByType(Text).map(node => node.props.children),
  );

test('detects the Wi-Fi subnet and opens a prefilled device from scan results', async () => {
  (NativeModule.ScanHosts as jest.Mock).mockResolvedValue([
    ['192.168.1.8', ''],
  ]);
  (NativeModule.ScanProgress as jest.Mock).mockReturnValue([
    ['256', '256', 'complete'],
    ['192.168.1.8', ''],
  ]);
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<ScanHostsScreen />);
  });
  await act(async () => {
    await tree.root
      .findAllByType(CustomButton)
      .find(node => node.props.title === 'Scan')!
      .props.onPress();
  });
  expect(NativeModule.ScanHosts).toHaveBeenCalledWith('192.168.1.0/24', 'Ping');
  act(() =>
    tree.root
      .findAllByType(CustomButton)
      .find(node => node.props.title === 'Add device')!
      .props.onPress(),
  );
  expect(
    tree.root.findByType(AddDeviceScreen).props.initialDevice,
  ).toMatchObject({
    statusIp: '192.168.1.8',
    ipAddr: '192.168.1.255',
    macAddr: '',
  });
  await act(async () => tree.unmount());
});

test('recovery only changes the status IP after explicit confirmation', async () => {
  bridge.recoverIp.mockResolvedValue(
    JSON.stringify({ status: 'found', ip: '192.168.1.8' }),
  );
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <DeviceToolsModal device={mockDevice} onClose={() => {}} />,
    );
  });
  expect(
    tree.root
      .findAllByType(Button)
      .some(node => node.props.title === 'Find changed IP by MAC'),
  ).toBe(false);
  act(() =>
    tree.root
      .findAllByType(Button)
      .find(node => node.props.title === 'Older Android options')!
      .props.onPress(),
  );
  await act(async () => {
    await tree.root
      .findAllByType(Button)
      .find(node => node.props.title === 'Find changed IP by MAC')!
      .props.onPress();
  });
  expect(mockUpdate).not.toHaveBeenCalled();
  await act(async () => {
    await alert.mock.calls[0][2]![1].onPress!();
  });
  expect(mockUpdate).toHaveBeenCalledWith('pc', {
    ...mockDevice,
    statusIp: '192.168.1.8',
  });
  await act(async () => tree.unmount());
  alert.mockRestore();
});

test('Android 10 and newer keep unsupported MAC recovery out of diagnostics', async () => {
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(29);
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <DeviceToolsModal device={mockDevice} onClose={() => {}} />,
    );
  });
  const titles = tree.root.findAllByType(Button).map(node => node.props.title);
  expect(titles).toContain('Run ten probes');
  expect(titles).not.toContain('Find changed IP by MAC');
  expect(titles).not.toContain('Older Android options');
  expect(bridge.recoverIp).not.toHaveBeenCalled();
  expect(mockUpdate).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

test('diagnostics display ten measured probes, loss and average', async () => {
  bridge.diagnose.mockResolvedValue(
    JSON.stringify({
      probes: [{ number: 1, reachable: true, elapsedMs: 5 }],
      sent: 10,
      lossPercent: 20,
      averageMs: 5,
      elapsedMs: 2000,
      cancelled: false,
    }),
  );
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <DeviceToolsModal device={mockDevice} onClose={() => {}} />,
    );
  });
  await act(async () => {
    await tree.root
      .findAllByType(Button)
      .find(node => node.props.title === 'Run ten probes')!
      .props.onPress();
  });
  expect(texts(tree)).toContain('Ten probes completed');
  expect(texts(tree)).toContain('5.0 ms');
  await act(async () => tree.unmount());
});

test('a delayed progress response cannot replace the final diagnostic report', async () => {
  jest.useFakeTimers();
  let finish!: (value: string) => void;
  let progress!: (value: string) => void;
  bridge.diagnose.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  bridge.diagnosticProgress.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        progress = resolve;
      }),
  );
  let tree!: Renderer.ReactTestRenderer;
  try {
    await act(async () => {
      tree = Renderer.create(
        <DeviceToolsModal device={mockDevice} onClose={() => {}} />,
      );
    });
    let operation!: Promise<void>;
    act(() => {
      operation = tree.root
        .findAllByType(Button)
        .find(node => node.props.title === 'Run ten probes')!
        .props.onPress();
    });
    act(() => jest.advanceTimersByTime(250));
    const report = {
      probes: [],
      sent: 10,
      lossPercent: 0,
      averageMs: 9,
      elapsedMs: 100,
      cancelled: false,
    };
    await act(async () => {
      finish(JSON.stringify(report));
      await operation;
    });
    await act(async () => {
      progress(JSON.stringify({ ...report, sent: 1, averageMs: 1 }));
    });
    expect(texts(tree)).toContain('9.0 ms');
    expect(texts(tree)).not.toContain('1.0 ms');
  } finally {
    if (tree) await act(async () => tree.unmount());
    jest.useRealTimers();
  }
});

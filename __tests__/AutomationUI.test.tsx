import React from 'react';
import { Alert, Text, TextInput } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { AutomationEditor } from '../src/components/AutomationEditor';
import {
  AutomationButton,
  AutomationToggle,
} from '../src/components/AutomationControls';
import { AutomationScreen } from '../src/screens/AutomationScreen';
import { automation, newRule } from '../src/services/automation';

jest.mock('../src/services/automation', () => ({
  ...jest.requireActual('../src/services/automation'),
  automation: jest.fn(),
}));
jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
// RN 0.80's Jest setup references a RefreshControl mock absent from its npm package.
jest.mock(
  'react-native/Libraries/Components/RefreshControl/RefreshControl',
  () => ({
    __esModule: true,
    default: 'RefreshControl',
  }),
);
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    require('react').useEffect(callback, [callback]);
  },
}));
jest.mock('../src/styles/base', () => {
  const actual = jest.requireActual('../src/styles/base');
  return {
    ...actual,
    useColors: () => actual.lightTheme,
    useBaseStyles: () => ({}),
  };
});
jest.mock('../src/contexts/DeviceContext', () => ({
  useDeviceContext: () => ({
    devices: [{ id: 'pc', name: 'Office PC', macAddr: '001122334455' }],
    isLoading: false,
    storageError: null,
  }),
}));
jest.mock('../src/screens/AddDeviceScreen', () => ({
  AddDeviceScreen: () => null,
}));

function button(tree: ReactTestRenderer.ReactTestRenderer, title: string) {
  return tree.root
    .findAllByType(AutomationButton)
    .find(item => item.props.title === title)!;
}
function text(tree: ReactTestRenderer.ReactTestRenderer) {
  return JSON.stringify(
    tree.root.findAllByType(Text).map(item => item.props.children),
  );
}
function field(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  return tree.root
    .findAllByType(TextInput)
    .find(item => item.props.accessibilityLabel === label)!;
}

test('guides a schedule through three steps, validates time and only saves after explicit activation', async () => {
  const save = jest.fn().mockResolvedValue(undefined);
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(
      <AutomationEditor
        rule={newRule('pc')}
        exactAllowed
        globallyEnabled={false}
        onSave={save}
        onCancel={() => {}}
      />,
    );
  });
  expect(text(tree)).toContain('Which PC should wake?');
  act(() => button(tree, 'Continue').props.onPress());
  act(() => field(tree, 'Time on this phone').props.onChangeText('29:30'));
  act(() => button(tree, 'Continue').props.onPress());
  expect(text(tree)).toContain('Enter a time as HH:MM');
  expect(save).not.toHaveBeenCalled();
  act(() => field(tree, 'Time on this phone').props.onChangeText('09:15'));
  act(() => button(tree, 'Continue').props.onPress());
  expect(text(tree)).toContain('Review your automation');
  expect(text(tree)).toContain('Automatic wakes are currently paused');
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0); // Advanced fields start collapsed.
  const toggle = tree.root
    .findAllByType(AutomationToggle)
    .find(item => item.props.title === 'Enable this automation')!;
  expect(toggle.props.value).toBe(false);
  act(() => toggle.props.onChange(true));
  await act(async () => {
    await button(tree, 'Save automation').props.onPress();
  });
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'Wake Office PC',
      deviceId: 'pc',
      enabled: true,
      hour: 9,
      minute: 15,
      days: [1, 2, 3, 4, 5],
    }),
  );
  await act(async () => tree.unmount());
});

test('editing keeps hidden filters and preserves the draft after a failed save', async () => {
  const rule = {
    ...newRule('pc'),
    name: 'Night shift',
    windowStart: 1320,
    windowEnd: 360,
    windowDays: [1],
    cooldownSeconds: 120,
  };
  const save = jest
    .fn()
    .mockRejectedValueOnce(new Error('private native details'))
    .mockResolvedValue(undefined);
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(
      <AutomationEditor
        rule={rule}
        exactAllowed
        globallyEnabled
        onSave={save}
        onCancel={() => {}}
      />,
    );
  });
  act(() => field(tree, 'Name (optional)').props.onChangeText('New name'));
  act(() => button(tree, 'Continue').props.onPress());
  act(() => button(tree, 'Continue').props.onPress());
  await act(async () => {
    await button(tree, 'Save automation').props.onPress();
  });
  expect(text(tree)).toContain('Your changes are still here');
  expect(text(tree)).not.toContain('private native details');
  await act(async () => {
    await button(tree, 'Save automation').props.onPress();
  });
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({
      name: 'New name',
      windowStart: 1320,
      windowEnd: 360,
      windowDays: [1],
      cooldownSeconds: 120,
    }),
  );
  await act(async () => tree.unmount());
});

test('cancelling never saves a rule', async () => {
  const save = jest.fn();
  const cancel = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(
      <AutomationEditor
        rule={newRule('pc')}
        exactAllowed
        globallyEnabled
        onSave={save}
        onCancel={cancel}
      />,
    );
  });
  act(() => button(tree, 'Continue').props.onPress());
  act(() => button(tree, 'Cancel').props.onPress());
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(save).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

test('explains global pause, hides irrelevant alarm prompts and requires confirmation before test wakes', async () => {
  const rule = {
    ...newRule('pc'),
    name: 'Desk event',
    trigger: 'external',
    enabled: true,
    lastResult: 'skipped: cooldown',
  };
  const api = {
    load: jest.fn().mockResolvedValue(
      JSON.stringify({
        enabled: false,
        exactAllowed: false,
        rules: [rule],
        history: [],
      }),
    ),
    test: jest.fn().mockResolvedValue('disabled'),
  };
  (automation as jest.Mock).mockReturnValue(api);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(<AutomationScreen />);
  });
  expect(text(tree)).toContain('Paused by the main switch');
  expect(text(tree)).toContain('too soon after the previous attempt');
  expect(text(tree)).not.toContain('skipped: cooldown');
  expect(
    tree.root
      .findAllByType(AutomationButton)
      .some(item => item.props.title === 'Allow alarms'),
  ).toBe(false);
  act(() => button(tree, 'How to use').props.onPress());
  expect(text(tree)).toContain('Both switches must be on');
  act(() => button(tree, 'More').props.onPress());
  act(() => button(tree, 'Test wake now').props.onPress());
  expect(api.test).not.toHaveBeenCalled();
  await act(async () => {
    alert.mock.calls
      .at(-1)?.[2]
      ?.find(choice => choice.text === 'Send wake')
      ?.onPress?.();
  });
  expect(api.test).toHaveBeenCalledWith(rule.id);
  await act(async () => tree.unmount());
  alert.mockRestore();
});

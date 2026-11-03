import React from 'react';
import { AppState, AppStateStatus } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useDeviceStatus } from '../src/services/useDeviceStatus';
import { deviceActions } from '../src/services/deviceActions';

jest.mock('../src/services/deviceActions', () => ({
  deviceActions: jest.fn(),
}));

function pending() {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

test('bounds concurrency, prioritizes post-wake, ignores cancelled results and stops on blur', async () => {
  const jobs = [pending(), pending(), pending(), pending(), pending()];
  const actions = {
    monitorReachability: jest.fn(),
    cancelMonitor: jest.fn().mockResolvedValue(true),
  };
  jobs.forEach(job =>
    actions.monitorReachability.mockImplementationOnce(() => job.promise),
  );
  (deviceActions as jest.Mock).mockReturnValue(actions);
  let hook!: ReturnType<typeof useDeviceStatus>;
  const devices = ['a', 'b', 'c'].map(id => ({ id, macAddr: '001122334455' }));
  function Harness({ visible }: { visible: boolean }) {
    hook = useDeviceStatus(devices, visible);
    return null;
  }
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(<Harness visible />);
  });
  expect(actions.monitorReachability.mock.calls.map(call => call[0])).toEqual([
    'a',
    'b',
  ]);
  act(() => hook.request('a', true));
  expect(actions.cancelMonitor).toHaveBeenCalledWith(
    actions.monitorReachability.mock.calls[0][1],
  );
  // Completion of B must not discard the queued replacement of A while A is still cancelling.
  await act(async () => {
    jobs[1].resolve(JSON.stringify({ state: 'timeout' }));
  });
  expect(actions.monitorReachability.mock.calls[2][0]).toBe('c');
  await act(async () => {
    jobs[0].resolve(JSON.stringify({ state: 'reachable' }));
  });
  expect(actions.monitorReachability.mock.calls[3]).toEqual([
    'a',
    expect.any(String),
    true,
  ]);
  expect(hook.statuses.a.state).toBe('checking');
  await act(async () => {
    tree.update(<Harness visible={false} />);
  });
  expect(actions.cancelMonitor).toHaveBeenCalledWith(
    actions.monitorReachability.mock.calls[3][1],
  );
  await act(async () => {
    jobs[2].resolve(JSON.stringify({ state: 'reachable' }));
    jobs[3].resolve(JSON.stringify({ state: 'reachable' }));
  });
  expect(hook.statuses.a.state).toBe('checking'); // Hidden results cannot update UI.
  expect(actions.monitorReachability).toHaveBeenCalledTimes(4);
  await act(async () => {
    tree.unmount();
  });
});

test('cancels native probes when the app backgrounds and refreshes only once on return', async () => {
  const first = pending();
  const second = pending();
  const actions = {
    monitorReachability: jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise),
    cancelMonitor: jest.fn().mockResolvedValue(true),
  };
  (deviceActions as jest.Mock).mockReturnValue(actions);
  let changed!: (state: AppStateStatus) => void;
  const listener = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      changed = callback;
      return { remove: jest.fn() };
    });
  function Harness() {
    useDeviceStatus([{ id: 'a', macAddr: '001122334455' }], true);
    return null;
  }
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(<Harness />);
  });
  act(() => changed('background'));
  expect(actions.cancelMonitor).toHaveBeenCalledTimes(1);
  await act(async () => {
    changed('active');
    changed('active');
  });
  expect(actions.monitorReachability).toHaveBeenCalledTimes(2);
  await act(async () => {
    first.resolve(JSON.stringify({ state: 'cancelled' }));
    second.resolve(JSON.stringify({ state: 'reachable' }));
  });
  await act(async () => {
    tree.unmount();
  });
  listener.mockRestore();
});

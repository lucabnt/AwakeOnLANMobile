import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { DeviceType } from '../types/device';
import { deviceActions } from './deviceActions';

export interface DeviceStatus {
  state: 'checking' | 'reachable' | 'timeout' | 'error' | 'cancelled';
  checkedAt?: number;
}

/** UI owns sessions; Android owns the bounded probes. No monitoring while the list is hidden. */
export function useDeviceStatus(devices: DeviceType[], visible: boolean) {
  const [statuses, setStatuses] = useState<Record<string, DeviceStatus>>({});
  const active = useRef(false);
  const sessions = useRef(new Map<string, string>());
  const queue = useRef<{ id: string; postWake: boolean }[]>([]);
  const counter = useRef(0);
  const generation = useRef(0);
  const cancelled = useRef(new Set<string>());
  const pump = useRef(() => {});
  const deviceKey = JSON.stringify(
    devices.map(({ id, ipAddr, statusIp, statusPort, statusMethod }) => ({
      id,
      ipAddr,
      statusIp,
      statusPort,
      statusMethod,
    })),
  );
  pump.current = () => {
    while (
      active.current &&
      sessions.current.size < 2 &&
      queue.current.length
    ) {
      const index = queue.current.findIndex(
        item => !sessions.current.has(item.id),
      );
      if (index < 0) return;
      const [work] = queue.current.splice(index, 1);
      const session = `status-${Date.now()}-${++counter.current}`;
      const epoch = generation.current;
      sessions.current.set(work.id, session);
      setStatuses(previous => ({
        ...previous,
        [work.id]: { state: 'checking' },
      }));
      const update = (status: DeviceStatus) => {
        if (
          active.current &&
          generation.current === epoch &&
          sessions.current.get(work.id) === session &&
          !cancelled.current.has(session)
        ) {
          setStatuses(previous => ({ ...previous, [work.id]: status }));
        }
      };
      Promise.resolve()
        .then(() => {
          if (!active.current || generation.current !== epoch)
            return JSON.stringify({ state: 'cancelled' });
          return deviceActions().monitorReachability(
            work.id,
            session,
            work.postWake,
          );
        })
        .then(json => update(JSON.parse(json)))
        .catch(() => update({ state: 'error', checkedAt: Date.now() }))
        .finally(() => {
          if (sessions.current.get(work.id) === session)
            sessions.current.delete(work.id);
          cancelled.current.delete(session);
          if (generation.current === epoch) pump.current();
        });
    }
  };
  const cancel = useCallback((id: string) => {
    queue.current = queue.current.filter(item => item.id !== id);
    const session = sessions.current.get(id);
    if (session) {
      cancelled.current.add(session);
      try {
        deviceActions()
          .cancelMonitor(session)
          .catch(() => {});
      } catch {}
    }
    setStatuses(previous => ({
      ...previous,
      [id]: { state: 'cancelled', checkedAt: Date.now() },
    }));
  }, []);
  const request = useCallback((id: string, postWake = false) => {
    if (!active.current) return;
    if (sessions.current.has(id)) {
      // A post-wake request supersedes a short refresh when it completes cancellation.
      if (postWake) {
        const session = sessions.current.get(id)!;
        cancelled.current.add(session);
        try {
          deviceActions()
            .cancelMonitor(session)
            .catch(() => {});
        } catch {}
        queue.current = queue.current.filter(item => item.id !== id);
        queue.current.unshift({ id, postWake });
      }
      return;
    }
    queue.current = queue.current.filter(item => item.id !== id);
    queue.current.unshift({ id, postWake });
    pump.current();
  }, []);
  useEffect(() => {
    const stop = () => {
      active.current = false;
      generation.current++;
      queue.current = [];
      sessions.current.forEach(session => {
        try {
          deviceActions()
            .cancelMonitor(session)
            .catch(() => {});
        } catch {}
      });
      sessions.current.clear();
    };
    const start = () => {
      if (!visible || active.current) return;
      active.current = true;
      queue.current = (JSON.parse(deviceKey) as { id: string }[]).map(
        device => ({ id: device.id, postWake: false }),
      );
      pump.current();
    };
    if (
      AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive'
    )
      start();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') start();
      else stop();
    });
    return () => {
      subscription.remove();
      stop();
    };
  }, [deviceKey, visible]);
  return { statuses, request, cancel };
}

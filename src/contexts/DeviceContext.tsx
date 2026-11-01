import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { Alert } from 'react-native';
import { DeviceType, DeviceContextType } from '../types/device';
import { loadDevices, saveDevices } from '../storage/deviceStorage';
import { deviceActions } from '../services/deviceActions';

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

export const useDeviceContext = () => {
  const context = useContext(DeviceContext);
  if (!context)
    throw new Error('useDeviceContext must be used within a DeviceProvider');
  return context;
};

export const DeviceProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [devices, setDevices] = useState<DeviceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const current = useRef<DeviceType[]>([]);
  const ready = useRef(false);
  const mounted = useRef(false);
  const loading = useRef(false);
  const writes = useRef<Promise<void>>(Promise.resolve());

  const retryLoad = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    ready.current = false;
    setIsLoading(true);
    setStorageError(null);
    try {
      const saved = await loadDevices();
      if (mounted.current) {
        current.current = saved;
        setDevices(saved);
        ready.current = true;
      }
    } catch {
      if (mounted.current)
        setStorageError(
          'Could not open protected device storage. Your saved data has not been replaced. Retry or check the installation.',
        );
    } finally {
      loading.current = false;
      if (mounted.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    retryLoad();
    return () => {
      mounted.current = false;
      ready.current = false;
    };
  }, [retryLoad]);

  const persist = (
    change: (previous: DeviceType[]) => DeviceType[],
  ): Promise<void> => {
    if (!ready.current)
      return Promise.reject(new Error('Device storage is not ready.'));
    const operation = writes.current.then(async () => {
      if (!ready.current) throw new Error('Device storage is not ready.');
      const updated = change(current.current);
      await saveDevices(updated);
      current.current = updated;
      if (mounted.current) setDevices(updated);
    });
    // A failed write must not poison subsequent retries or alter the in-memory list.
    writes.current = operation.catch(() => {});
    return operation;
  };

  const addDevice = async (device: DeviceType) => {
    await persist(previous => [...previous, device]);
    Alert.alert('Device saved successfully!');
  };
  const updateDevice = (id: string, device: DeviceType) =>
    persist(previous =>
      previous.map(item => (item.id === id ? { ...device, id } : item)),
    );
  const deleteDevice = (id: string) =>
    persist(previous => previous.filter(item => item.id !== id));

  const manageBackup = (): Promise<void> => {
    if (!ready.current)
      return Promise.reject(new Error('Device storage is not ready.'));
    const operation = writes.current.then(async () => {
      ready.current = false;
      if (mounted.current) setIsLoading(true);
      try {
        await deviceActions().openBackup();
      } finally {
        // Native import and JS writes share this barrier. Reload even after cancellation.
        await retryLoad();
      }
    });
    writes.current = operation.catch(() => {});
    return operation;
  };

  return (
    <DeviceContext.Provider
      value={{
        devices,
        isLoading,
        storageError,
        retryLoad,
        manageBackup,
        addDevice,
        updateDevice,
        deleteDevice,
      }}
    >
      {children}
    </DeviceContext.Provider>
  );
};

export type DeviceType = {
  id: string;
  name?: string;
  macAddr: string;
  ipAddr?: string;
  port?: string;
  passwd?: string;
};

export type DeviceContextType = {
  devices: DeviceType[];
  isLoading: boolean;
  storageError: string | null;
  retryLoad: () => Promise<void>;
  addDevice: (device: DeviceType) => Promise<void>;
  updateDevice: (id: string, updatedDevice: DeviceType) => Promise<void>;
  deleteDevice: (id: string) => Promise<void>;
};

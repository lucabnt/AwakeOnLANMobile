import React from 'react';
import { SafeAreaView, Text } from 'react-native';
import { useDeviceContext } from '../contexts/DeviceContext';
import { DeviceForm } from '../components/DeviceForm';
import { useBaseStyles } from '../styles/base';
import { DeviceType } from '../types/device';

export const AddDeviceScreen = ({
  initialDevice,
  onClose,
  onSaved,
}: {
  initialDevice?: DeviceType;
  onClose?: () => void;
  onSaved?: (device: DeviceType) => void;
}) => {
  const { addDevice, isLoading, storageError } = useDeviceContext();
  const styles = useBaseStyles();

  return (
    <SafeAreaView style={styles.container}>
      {storageError && <Text style={styles.text}>{storageError}</Text>}
      <DeviceForm
        initialDevice={initialDevice}
        onSubmit={async device => {
          await addDevice(device);
          onSaved?.(device);
        }}
        onCancel={onClose}
        title={'Add Device'}
        disabled={isLoading || !!storageError}
      />
    </SafeAreaView>
  );
};

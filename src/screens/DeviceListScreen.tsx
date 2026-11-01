import React, { useState } from 'react';
import { SafeAreaView, Text, ActivityIndicator } from 'react-native';
import { DeviceType } from '../types/device';
import { CustomButton } from '../components/CustomButton';
import { useDeviceContext } from '../contexts/DeviceContext';
import { DeviceFlatList } from '../components/DeviceFlatList';
import { EditDeviceModal } from '../components/EditDeviceModal';
import { useBaseStyles } from '../styles/base';

export const DeviceListScreen = () => {
  const [editingDevice, setEditingDevice] = useState<DeviceType | null>(null);
  const { devices, isLoading, storageError, retryLoad } = useDeviceContext();
  const styles = useBaseStyles();

  return (
    <SafeAreaView style={styles.container}>
      {isLoading ? (
        <ActivityIndicator accessibilityLabel="Loading devices" />
      ) : storageError ? (
        <>
          <Text style={styles.text}>{storageError}</Text>
          <CustomButton
            title="Retry"
            onPress={() => {
              retryLoad();
            }}
          />
        </>
      ) : devices.length === 0 ? (
        <Text style={[styles.text, { fontSize: 24, fontWeight: 'bold' }]}>
          No devices saved
        </Text>
      ) : (
        <>
          <DeviceFlatList setEditingDevice={setEditingDevice} />
          <EditDeviceModal
            editingDevice={editingDevice}
            setEditingDevice={setEditingDevice}
          />
        </>
      )}
    </SafeAreaView>
  );
};

import React from 'react';
import { SafeAreaView, Text } from 'react-native';
import { useDeviceContext } from '../contexts/DeviceContext';
import { DeviceForm } from '../components/DeviceForm';
import { useBaseStyles } from '../styles/base';

export const AddDeviceScreen = () => {
  const { addDevice, isLoading, storageError } = useDeviceContext();
  const styles = useBaseStyles();

  return (
    <SafeAreaView style={styles.container}>
      {storageError && <Text style={styles.text}>{storageError}</Text>}
      <DeviceForm
        onSubmit={addDevice}
        title={'Add Device'}
        disabled={isLoading || !!storageError}
      />
    </SafeAreaView>
  );
};

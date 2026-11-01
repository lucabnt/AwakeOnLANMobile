import React from 'react';
import { View, Modal } from 'react-native';
import { useDeviceContext } from '../contexts/DeviceContext';
import { DeviceForm } from './DeviceForm';
import { useBaseStyles } from '../styles/base';
import { DeviceType } from '../types/device';

interface EditDeviceModalProps {
  editingDevice: DeviceType | null;
  setEditingDevice: (device: DeviceType | null) => void;
}

export const EditDeviceModal = ({
  editingDevice,
  setEditingDevice,
}: EditDeviceModalProps) => {
  const { updateDevice } = useDeviceContext();
  const styles = useBaseStyles();

  return (
    <Modal
      visible={!!editingDevice}
      animationType="slide"
      onRequestClose={() => setEditingDevice(null)}
    >
      <View style={styles.container}>
        {editingDevice && (
          <DeviceForm
            initialDevice={editingDevice}
            onSubmit={async device => {
              await updateDevice(device.id, device);
              setEditingDevice(null);
            }}
            onCancel={() => setEditingDevice(null)}
            title={'Edit Device'}
          />
        )}
      </View>
    </Modal>
  );
};

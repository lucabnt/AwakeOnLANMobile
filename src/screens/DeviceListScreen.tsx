import React, { useState } from 'react';
import {
  SafeAreaView,
  Text,
  ActivityIndicator,
  Modal,
  View,
} from 'react-native';
import { AddDeviceScreen } from './AddDeviceScreen';
import { useIsFocused } from '@react-navigation/native';
import { DeviceType } from '../types/device';
import { CustomButton } from '../components/CustomButton';
import { useDeviceContext } from '../contexts/DeviceContext';
import { DeviceFlatList } from '../components/DeviceFlatList';
import { EditDeviceModal } from '../components/EditDeviceModal';
import { useBaseStyles, useColors } from '../styles/base';

export const DeviceListScreen = () => {
  const [editingDevice, setEditingDevice] = useState<DeviceType | null>(null);
  const [adding, setAdding] = useState(false);
  const [savedId, setSavedId] = useState<string>();
  const focused = useIsFocused();
  const { devices, isLoading, storageError, retryLoad } = useDeviceContext();
  const styles = useBaseStyles();
  const colors = useColors();

  return (
    <SafeAreaView style={[styles.container, { justifyContent: 'flex-start' }]}>
      <View style={{ width: '100%', alignItems: 'flex-end', marginBottom: 12 }}>
        <CustomButton
          title="+"
          accessibilityLabel="Add device"
          buttonStyle={[
            styles.button,
            { minWidth: 48, backgroundColor: colors.primary },
          ]}
          buttonTextStyle={[styles.buttonText, { fontSize: 24 }]}
          disabled={isLoading || !!storageError}
          onPress={() => setAdding(true)}
        />
      </View>
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
          No devices saved. Tap + to add your first device.
        </Text>
      ) : (
        <>
          <DeviceFlatList
            setEditingDevice={setEditingDevice}
            highlightedId={savedId}
            active={focused && !adding && !editingDevice}
          />
          <EditDeviceModal
            editingDevice={editingDevice}
            setEditingDevice={setEditingDevice}
          />
        </>
      )}
      <Modal
        visible={adding}
        animationType="slide"
        onRequestClose={() => setAdding(false)}
      >
        <AddDeviceScreen
          onClose={() => setAdding(false)}
          onSaved={device => {
            setSavedId(device.id);
            setAdding(false);
          }}
        />
      </Modal>
    </SafeAreaView>
  );
};

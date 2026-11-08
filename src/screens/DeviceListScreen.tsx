import React, { useState } from 'react';
import {
  SafeAreaView,
  Text,
  ActivityIndicator,
  Modal,
  View,
  StyleSheet,
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
    <SafeAreaView style={[styles.container, layout.screen]}>
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
        <Text style={[styles.text, layout.emptyMessage]}>
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
      <View style={layout.floatingAction}>
        <CustomButton
          title="+"
          accessibilityLabel="Add device"
          buttonStyle={[layout.fab, { backgroundColor: colors.primary }]}
          buttonTextStyle={[styles.buttonText, layout.plus]}
          disabled={isLoading || !!storageError}
          onPress={() => setAdding(true)}
        />
      </View>
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

const layout = StyleSheet.create({
  emptyMessage: { fontSize: 24, fontWeight: 'bold' },
  screen: { justifyContent: 'flex-start' },
  floatingAction: { position: 'absolute', right: 20, bottom: 20 },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  plus: { fontSize: 30, lineHeight: 36 },
});

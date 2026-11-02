import React from 'react';
import {
  View,
  Text,
  FlatList,
  Alert,
  Platform,
  ToastAndroid,
} from 'react-native';
import { useDeviceContext } from '../contexts/DeviceContext';
import { CustomButton } from './CustomButton';
import { useDeviceFlatListStyles } from '../styles/flatList';
import NativeModule from '../../specs/NativeModule';
import { DeviceType } from '../types/device';
import { deviceActions } from '../services/deviceActions';
import { useDeviceStatus } from '../services/useDeviceStatus';

interface DeviceFlatListProps {
  setEditingDevice: (device: DeviceType | null) => void;
  highlightedId?: string;
  active?: boolean;
}

export const DeviceFlatList = ({
  setEditingDevice,
  highlightedId,
  active = true,
}: DeviceFlatListProps) => {
  const { devices, deleteDevice } = useDeviceContext(); // Destructure only the necessary functions from useDeviceContext() hook
  const styles = useDeviceFlatListStyles();
  const { statuses, request, cancel } = useDeviceStatus(devices, active);

  const moreActions = (item: DeviceType) =>
    Alert.alert(item.name || 'Saved device', 'Device actions', [
      {
        text: 'Add widget',
        onPress: async () => {
          try {
            const requested = await deviceActions().pinWidget(item.id);
            Alert.alert(
              requested ? 'Confirm on your launcher' : 'Add widget manually',
              requested
                ? 'Confirm the widget placement. Your selected PC will be linked automatically.'
                : 'Open Widgets on your home screen and choose AwakeOnLANMobile, then select this PC.',
            );
          } catch {
            Alert.alert(
              'Widget unavailable',
              'Could not request the widget. Try adding it from your home screen.',
            );
          }
        },
      },
      {
        text: 'Use for Quick Settings',
        onPress: async () => {
          try {
            const result = await deviceActions().configureQuickTile(item.id);
            Alert.alert(
              'Quick Settings target saved',
              result === 'manual'
                ? 'Edit your Quick Settings panel and add the Wake PC tile. Tapping it will wake this device.'
                : result === 'added'
                ? 'The Wake PC tile is ready for this device.'
                : 'The target is saved. If the tile was not added, add Wake PC by editing Quick Settings.',
            );
          } catch {
            Alert.alert(
              'Quick Settings unavailable',
              'Could not configure the shortcut. Please retry.',
            );
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const checkStatus = async (item: DeviceType) => {
    const status = statuses[item.id];
    Alert.alert(
      status?.state === 'reachable' ? 'Reachable now' : 'Not verified',
      `${
        status?.checkedAt
          ? `Last check: ${new Date(status.checkedAt).toLocaleString()}. `
          : ''
      }` +
        `${
          status?.state === 'error'
            ? 'Check Status IP: use the actual PC address, not broadcast. '
            : ''
        }` +
        'Two matching probes stabilize the indicator. No response does not prove the PC is off; a response does not prove the desktop is ready.',
      [
        { text: 'Close', style: 'cancel' },
        status?.state === 'checking'
          ? { text: 'Cancel check', onPress: () => cancel(item.id) }
          : { text: 'Check now', onPress: () => request(item.id) },
      ],
    );
  };

  const wakeButton = (item: DeviceType) => {
    try {
      NativeModule.SendWOL(
        item.macAddr,
        item.ipAddr || '',
        item.port || '',
        item.passwd || '',
      );
    } catch {
      Alert.alert(
        'Wake On LAN failed',
        'The packet could not be sent. Check the device settings and network.',
      );
      return;
    }

    if (Platform.OS === 'android') {
      ToastAndroid.show(
        'Wake packet sent · startup not verified',
        ToastAndroid.SHORT,
      );
      request(item.id, true);
    }
  };

  const deleteButton = (item: DeviceType) => {
    Alert.alert(
      'Confirm Delete',
      `Are you sure you want to delete ${item.name || 'this device'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              await deleteDevice(item.id);
            } catch {
              Alert.alert(
                'Delete failed',
                'The device could not be deleted. Please retry.',
              );
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: DeviceType }) => (
    <View
      style={[
        styles.itemContainer,
        item.id === highlightedId && { borderWidth: 2 },
      ]}
    >
      <View style={styles.textContainer}>
        <Text style={styles.name}>{item.name || 'Saved device'}</Text>
        <Text
          style={styles.text}
          accessibilityLiveRegion="none"
          numberOfLines={1}
        >
          {statuses[item.id]?.state === 'checking'
            ? '◷ Checking…'
            : statuses[item.id]?.state === 'reachable'
            ? '✓ Reachable'
            : '○ Not verified'}
        </Text>
        <Text style={styles.text}>MAC: {item.macAddr}</Text>
        <Text style={styles.text}>
          IP: {item.ipAddr || 'Default broadcast'} · UDP {item.port || '9'}
        </Text>
        <Text style={styles.text}>
          Password: {item.passwd ? 'Configured' : 'Not configured'}
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <CustomButton
          title="Wake"
          onPress={() => wakeButton(item)}
          buttonStyle={styles.wakeButton}
          buttonTextStyle={styles.wakeText}
        />

        <CustomButton
          title="Status"
          onPress={() => checkStatus(item)}
          buttonStyle={styles.editOrSubmitButton}
          buttonTextStyle={styles.buttonText}
        />
        <CustomButton
          title="More"
          onPress={() => moreActions(item)}
          buttonStyle={styles.editOrSubmitButton}
          buttonTextStyle={styles.buttonText}
        />
        <CustomButton
          title="Edit"
          onPress={() => setEditingDevice(item)}
          buttonStyle={styles.editOrSubmitButton}
          buttonTextStyle={styles.buttonText}
        />

        <CustomButton
          title="Delete"
          onPress={() => deleteButton(item)}
          buttonStyle={styles.deleteButton}
          buttonTextStyle={styles.deleteText}
        />
      </View>
    </View>
  );

  return (
    <FlatList
      data={devices}
      renderItem={renderItem}
      keyExtractor={item => item.id}
      style={styles.list}
    />
  );
};

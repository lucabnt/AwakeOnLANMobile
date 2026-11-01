import React, { useState } from 'react';
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

interface DeviceFlatListProps {
  setEditingDevice: (device: DeviceType | null) => void;
}

export const DeviceFlatList = ({ setEditingDevice }: DeviceFlatListProps) => {
  const { devices, deleteDevice } = useDeviceContext(); // Destructure only the necessary functions from useDeviceContext() hook
  const styles = useDeviceFlatListStyles();
  const [checking, setChecking] = useState(false);

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
    if (checking) return;
    setChecking(true);
    try {
      const reachable = await deviceActions().checkReachability(item.id);
      Alert.alert(
        reachable ? 'Reachable now' : 'Not verified',
        reachable
          ? 'The PC address responded to the TCP probe. This does not verify that the desktop is ready.'
          : 'No response was confirmed. The PC may be asleep, or the selected TCP port may be filtered.',
      );
    } catch {
      Alert.alert(
        'Status unavailable',
        'Set Status IP to the actual PC address and choose a TCP service port in Edit. Broadcast addresses cannot identify one PC.',
      );
    } finally {
      setChecking(false);
    }
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
    <View style={styles.itemContainer}>
      <View style={styles.textContainer}>
        <Text style={styles.name}>{item.name || 'Saved device'}</Text>
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
          title={checking ? 'Checking…' : 'Status'}
          disabled={checking}
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

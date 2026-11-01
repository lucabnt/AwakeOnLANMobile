import React, { useState, useEffect, useRef } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  View,
  Text,
  TextInput,
  Platform,
  Keyboard,
  StyleSheet,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DeviceType } from '../types/device';
import { CustomButton } from '../components/CustomButton';
import { fonts, useColors, Colors, useBaseStyles } from '../styles/base';
import NativeModule from '../../specs/NativeModule';

const useDeviceFormStyles = () => {
  const colors: Colors = useColors();
  const baseStyles = useBaseStyles();

  return StyleSheet.create({
    input: baseStyles.input,
    title: baseStyles.title,
    buttonText: baseStyles.buttonText,
    outerContainer: {
      flex: 1,
      borderRadius: 8,
      backgroundColor: colors.background,
      width: '100%',
    },
    scrollContainer: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingBottom: 20,
    },
    formContainer: {
      paddingVertical: 8,
      paddingHorizontal: 4,
      width: '100%',
      maxWidth: 600, // Limit width on larger screens
    },
    label: {
      fontSize: fonts.mediumFontSize,
      marginBottom: 5,
      color: colors.text,
    },
    buttonContainer: {
      paddingVertical: 8,
      flexDirection: 'row',
      justifyContent: 'space-evenly',
    },
    editButton: {
      ...baseStyles.button,
      width: 120,
      backgroundColor: colors.saveOrEditButtonColor,
    },
    deleteButton: {
      ...baseStyles.button,
      width: 120,
      backgroundColor: colors.deleteOrCancelButtonColor,
    },
    errorInput: {
      borderColor: colors.deleteOrCancelButtonColor,
      borderRadius: 2,
    },
    errorText: {
      color: colors.deleteOrCancelButtonColor,
      fontSize: fonts.mediumFontSize,
      fontWeight: 'bold',
      marginBottom: 10,
    },
  });
};

interface DeviceFormProps {
  initialDevice?: DeviceType;
  onSubmit: (device: DeviceType) => Promise<void>;
  onCancel?: () => void;
  title?: string;
  disabled?: boolean;
}

export const DeviceForm = ({
  initialDevice,
  onSubmit,
  onCancel,
  title,
  disabled = false,
}: DeviceFormProps) => {
  const [name, setName] = useState<string>(initialDevice?.name || '');
  const [macAddr, setMacAddr] = useState<string>(initialDevice?.macAddr || '');
  const [macAddrError, setMacAddrError] = useState<string | null>(null);
  const [ipAddr, setIpAddr] = useState<string>(initialDevice?.ipAddr || '');
  const [ipAddrError, setIpAddrError] = useState<string | null>(null);
  const [port, setPort] = useState<string>(initialDevice?.port || '');
  const [passwd, setPasswd] = useState<string>(initialDevice?.passwd || '');
  const [statusIp, setStatusIp] = useState(initialDevice?.statusIp || '');
  const [statusPort, setStatusPort] = useState(initialDevice?.statusPort || '');
  const [isSaving, setIsSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const styles = useDeviceFormStyles();
  const colors = useColors();

  // Reset scroll position when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }, []),
  );

  // Listen for keyboard show/hide events
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => {
        setKeyboardHeight(e.endCoordinates.height);
      },
    );
    const keyboardDidHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      },
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  const handleSubmit = async () => {
    if (disabled || isSaving) return;
    if (!macAddr.trim()) {
      setMacAddrError('MAC Address is required');
      return;
    }

    const validMac = NativeModule.ValidMac(macAddr.trim());
    if (!validMac) {
      setMacAddrError(
        'Invalid MAC Address, valid: AB-CD-EF-01-23-45, abcdef012345, or ab:cd:ef:01:23:45',
      );
    } else {
      setMacAddrError(null);
    }

    const validIp = NativeModule.ValidIp(ipAddr.trim());
    if (ipAddr && !validIp) {
      setIpAddrError('Invalid IPv4 or IPv6 address');
    } else {
      setIpAddrError(null);
    }

    if (!validMac || (ipAddr && !validIp)) {
      return;
    }
    if (
      (statusIp.trim() && !NativeModule.ValidIp(statusIp.trim())) ||
      (statusPort &&
        (!/^\d{1,5}$/.test(statusPort) ||
          Number(statusPort) < 1 ||
          Number(statusPort) > 65535))
    ) {
      Alert.alert(
        'Invalid status settings',
        'Enter a numeric PC IP address and a TCP port between 1 and 65535.',
      );
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit({
        id: initialDevice?.id || Date.now().toString(),
        name: name.trim() || '',
        macAddr: macAddr.trim(),
        ipAddr: ipAddr.trim() || '',
        port: port.trim() || '',
        passwd,
        statusIp: statusIp.trim(),
        statusPort,
      });

      setName('');
      setMacAddr('');
      setMacAddrError(null);
      setIpAddr('');
      setIpAddrError(null);
      setPort('');
      setPasswd('');
      setStatusIp('');
      setStatusPort('');
    } catch {
      Alert.alert(
        'Save failed',
        'The device could not be saved securely. Your changes are still in the form. Please retry.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handlePortInput = (text: string) => {
    if (text === '') {
      setPort('');
      return;
    }

    if (/^\d+$/.test(text)) {
      const num = parseInt(text, 10);
      if ((text.startsWith('0') && text.length > 1) || num > 65535) {
        return;
      }
      if (num >= 1 && num <= 65535) {
        setPort(text);
      }
    }
  };

  const handleIpAddrInput = (text: string) => {
    setIpAddr(text);
    if (text.trim() === '') {
      setIpAddrError(null);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
      style={styles.outerContainer}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[
          styles.scrollContainer,
          { paddingBottom: Math.max(keyboardHeight, 20) }, // Ensure enough padding for keyboard or content
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.formContainer}>
          {title && <Text style={styles.title}>{title}</Text>}
          <Text style={styles.label}>Name (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor={colors.placeholderText}
            value={name}
            maxLength={1024}
            onChangeText={setName}
            placeholder="Enter Name"
          />
          <Text style={styles.label}>MAC Address (Required)</Text>
          <TextInput
            style={[styles.input, macAddrError && styles.errorInput]}
            placeholderTextColor={colors.placeholderText}
            value={macAddr}
            onChangeText={setMacAddr}
            maxLength={17}
            placeholder="Enter MAC Address"
          />
          {macAddrError && <Text style={styles.errorText}>{macAddrError}</Text>}
          <Text style={styles.label}>IP Address (Optional)</Text>
          <TextInput
            style={[styles.input, ipAddrError && styles.errorInput]}
            placeholderTextColor={colors.placeholderText}
            value={ipAddr}
            onChangeText={handleIpAddrInput}
            maxLength={40}
            placeholder="Enter IPv4 or IPv6 Address"
          />
          {ipAddrError && <Text style={styles.errorText}>{ipAddrError}</Text>}
          <Text style={styles.label}>Port (Optional)</Text>
          <TextInput
            style={styles.input}
            inputMode={'numeric'}
            placeholderTextColor={colors.placeholderText}
            value={port}
            onChangeText={handlePortInput}
            maxLength={5}
            placeholder="Enter Port (1-65535)"
          />
          <Text style={styles.label}>Password (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor={colors.placeholderText}
            value={passwd}
            secureTextEntry
            autoComplete="off"
            importantForAutofill="no"
            autoCorrect={false}
            autoCapitalize="none"
            maxLength={256}
            onChangeText={setPasswd}
            placeholder="Enter Password"
          />
          <Text style={styles.label}>
            Status IP (Optional, actual PC address)
          </Text>
          <TextInput
            style={styles.input}
            placeholderTextColor={colors.placeholderText}
            value={statusIp}
            onChangeText={setStatusIp}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={45}
            placeholder="Use when WOL targets a broadcast address"
          />
          <Text style={styles.label}>
            Status TCP port (Optional, default 443)
          </Text>
          <TextInput
            style={styles.input}
            placeholderTextColor={colors.placeholderText}
            value={statusPort}
            onChangeText={setStatusPort}
            inputMode="numeric"
            maxLength={5}
            placeholder="An available service on your PC"
          />
          <View style={styles.buttonContainer}>
            <CustomButton
              title="Save"
              disabled={disabled || isSaving}
              onPress={handleSubmit}
              buttonStyle={styles.editButton}
              buttonTextStyle={styles.buttonText}
            />
            {onCancel && (
              <CustomButton
                title="Cancel"
                disabled={isSaving}
                onPress={onCancel}
                buttonStyle={styles.deleteButton}
                buttonTextStyle={styles.buttonText}
              />
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  FlatList,
  ActivityIndicator,
  Keyboard,
  Modal,
} from 'react-native';
import { CustomButton } from '../components/CustomButton';
import { CustomRadioButton } from '../components/CustomRadioButton';
import { fonts, useColors, Colors, useBaseStyles } from '../styles/base';
import { useDeviceFlatListStyles } from '../styles/flatList';
import NativeModule from '../../specs/NativeModule';
import { deviceActions } from '../services/deviceActions';
import { AddDeviceScreen } from './AddDeviceScreen';
import { DeviceType } from '../types/device';

interface ScanResult {
  host: string;
  items: string[][];
}

const useDynamicStyles = () => {
  const colors: Colors = useColors();
  const baseStyles = useBaseStyles();
  const flatListStyles = useDeviceFlatListStyles();

  return {
    baseContainer: baseStyles.container,
    input: baseStyles.input,
    list: flatListStyles.list,
    itemContainer: flatListStyles.itemContainer,
    textContainer: flatListStyles.textContainer,
    text: flatListStyles.text,
    placeholderTextColor: colors.placeholderText,
    container: {
      flex: 1,
      padding: 15,
      borderRadius: 8,
      backgroundColor: colors.background,
      width: '100%',
    },
    radioButtonStyle: {
      radioGroup: {
        flexDirection: 'row' as const,
        justifyContent: 'space-around' as const,
        marginVertical: 5,
      },
      radioContainer: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
      },
      radioCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: colors.secondary,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        marginRight: 10,
      },
      radioSelected: {
        backgroundColor: colors.primary,
      },
      radioInnerCircle: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: colors.text,
      },
      radioText: {
        fontSize: fonts.mediumFontSize,
        color: colors.text,
      },
    },
    buttonContainer: {
      paddingTop: 15,
      flexDirection: 'row' as const,
      justifyContent: 'space-evenly' as const,
    },
    buttonText: {
      ...baseStyles.buttonText,
      fontSize: fonts.mediumFontSize,
    },
    scanButton: {
      ...baseStyles.button,
      width: 120,
      backgroundColor: colors.saveOrEditButtonColor,
    },
    subnetButton: {
      alignSelf: 'center',
      alignItems: 'center',
      maxWidth: '100%',
      minHeight: 48,
      paddingHorizontal: 20,
      paddingVertical: 10,
      marginBottom: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderColor,
      backgroundColor: colors.surface,
    },
    subnetButtonText: {
      ...flatListStyles.buttonText,
      textAlign: 'center',
    },
    clearResultsButtonActive: {
      ...baseStyles.button,
      width: 120,
      backgroundColor: colors.deleteOrCancelButtonColor,
    },
    clearResultsButtonDisabled: {
      ...baseStyles.button,
      width: 120,
      backgroundColor: colors.borderColor,
    },
    inputError: {
      borderColor: colors.deleteOrCancelButtonColor,
      borderWidth: 2,
    },
    errorText: {
      color: colors.deleteOrCancelButtonColor,
      fontSize: fonts.mediumFontSize,
      fontWeight: 'bold',
      marginBottom: 10,
    },
    spinner: {
      marginTop: 20,
      color: colors.secondary,
    },
    resultsHeader: {
      fontSize: fonts.largeFontSize,
      color: colors.text,
      fontWeight: 'bold',
      marginTop: 20,
      marginBottom: 10,
    },
    noResults: {
      fontSize: fonts.mediumFontSize,
      color: colors.text,
      textAlign: 'center' as const,
      marginTop: 20,
    },
  } as const;
};

export const ScanHostsScreen = () => {
  const radioOptions = ['Ping', 'TCP Connect'];
  const [selectedOption, setSelectedOption] = useState<string>(radioOptions[0]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<DeviceType | null>(null);
  const [progress, setProgress] = useState('');
  const [local, setLocal] = useState<{ cidr: string; broadcast: string }>();
  const scanning = useRef(false);
  const detectSubnet = async () => {
    try {
      const value = JSON.parse(await deviceActions().currentSubnet());
      if (mounted.current) {
        setLocal(value);
        setInputValue(value.cidr);
        setError(null);
      }
    } catch {
      if (mounted.current)
        setError('Could not detect a Wi-Fi IPv4 subnet. Enter it manually.');
    }
  };
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    detectSubnet();
    return () => {
      mounted.current = false;
      if (scanning.current) NativeModule.CancelScan();
    };
  }, []);

  const styles = useDynamicStyles();

  const handleScanButtonPress = async (): Promise<void> => {
    if (scanning.current) return;
    Keyboard.dismiss(); // Close the keyboard
    if (!inputValue.trim()) {
      setError('Enter a valid IP Address');
      return;
    }

    scanning.current = true;
    setIsLoading(true);
    setError(null);
    setScanResult({ host: inputValue, items: [] });
    setProgress('Starting - ');
    const refresh = () => {
      if (!mounted.current) return;
      const [state, ...items] = NativeModule.ScanProgress();
      if (state) {
        setProgress(`${state[0]}/${state[1]} checked  -  ${state[2]}`);
        setScanResult({ host: inputValue, items });
      }
    };
    const poll = setInterval(refresh, 250);
    try {
      const results: string[][] = await NativeModule.ScanHosts(
        inputValue.trim(),
        selectedOption,
      );
      if (mounted.current) {
        setScanResult({ host: inputValue, items: results });
        refresh();
      }
    } catch (scanError) {
      refresh();
      if (mounted.current)
        setError(
          scanError instanceof Error ? scanError.message : String(scanError),
        );
    } finally {
      clearInterval(poll);
      scanning.current = false;
      if (mounted.current) setIsLoading(false);
    }
  };

  const handleClearButtonPress = (): void => {
    setScanResult(null);
    setError(null);
  };

  const renderItem = ({ item }: { item: string[] }) => (
    <View style={styles.itemContainer}>
      <View style={styles.textContainer}>
        <Text style={styles.text}>IP: {item[0]}</Text>
        {!!item[1] && <Text style={styles.text}>Hostname: {item[1]}</Text>}
      </View>
      <CustomButton
        title="Add device"
        buttonStyle={styles.scanButton}
        buttonTextStyle={styles.buttonText}
        onPress={() =>
          setAdding({
            id: '',
            name: item[1] || '',
            macAddr: '',
            ipAddr:
              scanResult?.host === local?.cidr ? local?.broadcast : item[0],
            statusIp: item[0],
          })
        }
      />
    </View>
  );

  const isClearButtonActive: boolean =
    (scanResult?.items?.length ?? 0) > 0 && isLoading === false;

  return (
    <SafeAreaView style={styles.baseContainer}>
      <View style={styles.container}>
        <TextInput
          style={[styles.input, error && styles.inputError]}
          value={inputValue}
          onChangeText={setInputValue}
          editable={!isLoading}
          maxLength={18}
          placeholder="IPv4 or subnet (/22 to /32)"
          placeholderTextColor={styles.placeholderTextColor}
        />
        {error && <Text style={styles.errorText}>{error}</Text>}
        <CustomButton
          title="Use current Wi-Fi subnet"
          disabled={isLoading}
          onPress={detectSubnet}
          buttonStyle={styles.subnetButton}
          buttonTextStyle={styles.subnetButtonText}
        />
        <Text style={styles.text}>
          Maximum 1,024 addresses, 16 parallel probes and 30 seconds.
          Interrupted scans keep partial results. MAC addresses must be entered
          manually.
        </Text>
        <Text style={styles.text} accessibilityLiveRegion="polite">
          {progress}
        </Text>
        <CustomRadioButton
          options={radioOptions}
          selectedOption={selectedOption}
          setSelectedOption={setSelectedOption}
          radioButtonStyle={styles.radioButtonStyle}
        />
        <View style={styles.buttonContainer}>
          <CustomButton
            title={isLoading ? 'Cancel scan' : 'Scan'}
            onPress={
              isLoading
                ? () => NativeModule.CancelScan()
                : handleScanButtonPress
            }
            buttonStyle={styles.scanButton}
            buttonTextStyle={styles.buttonText}
          />
          <CustomButton
            title="Clear Results"
            onPress={handleClearButtonPress}
            buttonStyle={
              isClearButtonActive
                ? styles.clearResultsButtonActive
                : styles.clearResultsButtonDisabled
            }
            buttonTextStyle={styles.buttonText}
            disabled={!isClearButtonActive}
          />
        </View>
        {isLoading && (
          <ActivityIndicator
            size="large"
            color={styles.spinner.color}
            style={styles.spinner}
          />
        )}
        {scanResult && (
          <>
            <Text style={styles.resultsHeader}>
              Results for {scanResult.host}:
            </Text>
            {scanResult.items?.length > 0 ? (
              <FlatList
                data={scanResult.items}
                renderItem={renderItem}
                keyExtractor={(item, index) => index.toString()}
                style={styles.list}
              />
            ) : (
              <Text style={styles.noResults}>No results found.</Text>
            )}
          </>
        )}
      </View>
      <Modal
        visible={!!adding}
        animationType="slide"
        onRequestClose={() => setAdding(null)}
      >
        {adding && (
          <AddDeviceScreen
            initialDevice={adding}
            onClose={() => setAdding(null)}
            onSaved={() => setAdding(null)}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
};

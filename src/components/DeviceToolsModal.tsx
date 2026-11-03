import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  Text,
  Button,
  SafeAreaView,
  StyleSheet,
  Platform,
} from 'react-native';
import { DeviceType } from '../types/device';
import { deviceActions } from '../services/deviceActions';
import { useDeviceContext } from '../contexts/DeviceContext';
import { useBaseStyles } from '../styles/base';

type Report = {
  probes: { number: number; reachable: boolean; elapsedMs: number }[];
  sent: number;
  lossPercent: number;
  averageMs: number | null;
  elapsedMs: number;
  cancelled: boolean;
};
export function DeviceToolsModal({
  device,
  onClose,
}: {
  device: DeviceType;
  onClose: () => void;
}) {
  const { updateDevice, devices } = useDeviceContext();
  const latest = useRef(devices);
  latest.current = devices;
  const styles = useBaseStyles();
  const [report, setReport] = useState<Report>();
  const [operation, setOperation] = useState<'diagnostics' | 'recovery' | null>(
    null,
  );
  const busy = operation !== null;
  const [message, setMessage] = useState('');
  const [legacyOptions, setLegacyOptions] = useState(false);
  const supportsMacRecovery =
    Platform.OS === 'android' &&
    Number(Platform.Version) >= 24 &&
    Number(Platform.Version) < 29;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      deviceActions()
        .cancelDiagnostics()
        .catch(() => {});
    };
  }, []);
  const diagnose = async () => {
    if (busy) return;
    setOperation('diagnostics');
    setReport(undefined);
    setMessage('Running ten probes...');
    let polling = true;
    const poll = setInterval(() => {
      deviceActions()
        .diagnosticProgress()
        .then(json => {
          const value = JSON.parse(json);
          if (alive.current && polling && value.probes) setReport(value);
        })
        .catch(() => {});
    }, 250);
    try {
      const result = JSON.parse(await deviceActions().diagnose(device.id));
      polling = false;
      if (alive.current) {
        setReport(result);
        setMessage(
          result.cancelled
            ? 'Cancelled: partial results'
            : 'Ten probes completed',
        );
      }
    } catch (error) {
      if (alive.current) setMessage(String(error));
    } finally {
      polling = false;
      clearInterval(poll);
      if (alive.current) setOperation(null);
    }
  };
  const recover = async () => {
    if (busy) return;
    setOperation('recovery');
    setMessage('Looking for a verified MAC/IP association...');
    try {
      const result = JSON.parse(await deviceActions().recoverIp(device.id));
      if (!alive.current) return;
      if (result.status !== 'found') {
        setMessage(
          result.status === 'unsupported'
            ? 'Android 10 and newer prevent reliable MAC/IP discovery through the ARP table. No address has been changed.'
            : 'No unique, reachable MAC/IP association was verified. No address has been changed.',
        );
        return;
      }
      setMessage(`Verified candidate: ${result.ip}`);
      const update = async (wake: boolean) => {
        try {
          const current = latest.current.find(item => item.id === device.id);
          if (!alive.current || !current || current.macAddr !== device.macAddr)
            throw new Error('Device changed; retry recovery.');
          await updateDevice(device.id, {
            ...current,
            statusIp: result.ip,
            ...(wake ? { ipAddr: result.ip } : {}),
          });
          if (alive.current)
            setMessage(
              wake ? 'Status and wake IP updated.' : 'Status IP updated.',
            );
        } catch {
          if (alive.current)
            setMessage('Could not update this device. Retry recovery.');
        }
      };
      Alert.alert(
        'Update PC address?',
        `MAC ${device.macAddr} was found at ${result.ip}. Update Status IP only to preserve the broadcast wake destination, or update both addresses if wakes target this PC directly.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Update status IP', onPress: () => update(false) },
          { text: 'Update both IPs', onPress: () => update(true) },
        ],
      );
    } catch (error) {
      if (alive.current) setMessage(String(error));
    } finally {
      if (alive.current) setOperation(null);
    }
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <ScrollView
          style={layout.scroll}
          contentContainerStyle={layout.content}
        >
          <Text style={styles.title}>{device.name || 'PC'} diagnostics</Text>
          <Text style={styles.text}>
            Method: {device.statusMethod || 'tcp'} -{' '}
            {device.statusIp || device.ipAddr || 'Configure Status IP'} - port{' '}
            {device.statusPort || '443'}. Times measure the complete probe
            operation, not ICMP round-trip time. A timeout does not prove the PC
            is off.
          </Text>
          <Button title="Run ten probes" disabled={busy} onPress={diagnose} />
          {operation === 'diagnostics' && (
            <Button
              title="Cancel probes"
              onPress={() => {
                deviceActions()
                  .cancelDiagnostics()
                  .catch(() => {});
              }}
            />
          )}
          <Text style={styles.text} accessibilityLiveRegion="polite">
            {message}
          </Text>
          {report && (
            <>
              <Text style={styles.text}>
                {report.sent}/10 probes - loss {report.lossPercent.toFixed(0)}%
                - mean{' '}
                {report.averageMs === null
                  ? ' - '
                  : `${report.averageMs.toFixed(1)} ms`}{' '}
                - elapsed {report.elapsedMs} ms
              </Text>
              {report.probes.map(probe => (
                <Text style={styles.text} key={probe.number}>
                  #{probe.number}:{' '}
                  {probe.reachable ? 'Response' : 'No response'} -{' '}
                  {probe.elapsedMs.toFixed(1)} ms
                </Text>
              ))}
            </>
          )}
          {supportsMacRecovery && (
            <>
              <Button
                title={
                  legacyOptions
                    ? 'Hide older Android options'
                    : 'Older Android options'
                }
                disabled={busy}
                onPress={() => setLegacyOptions(!legacyOptions)}
              />
              {legacyOptions && (
                <>
                  <Text style={styles.text}>
                    IP recovery by MAC is available only on Android 7-9 where
                    access to the local network table is permitted.
                  </Text>
                  <Button
                    title="Find changed IP by MAC"
                    disabled={busy}
                    onPress={recover}
                  />
                </>
              )}
            </>
          )}
          <Button title="Close" onPress={onClose} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const layout = StyleSheet.create({
  scroll: { alignSelf: 'stretch' },
  content: { paddingBottom: 24 },
});

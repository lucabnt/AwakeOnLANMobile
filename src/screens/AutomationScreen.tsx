import React, { useCallback, useState } from 'react';
import {
  Alert,
  AppState,
  Modal,
  PermissionsAndroid,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  automation,
  AutomationRule,
  AutomationState,
  newRule,
  ruleSummary,
} from '../services/automation';
import { useDeviceContext } from '../contexts/DeviceContext';
import { useBaseStyles, useColors } from '../styles/base';
import { CustomButton } from '../components/CustomButton';
import { AddDeviceScreen } from './AddDeviceScreen';

export const AutomationScreen = () => {
  const styles = useBaseStyles();
  const colors = useColors();
  const { devices, isLoading, storageError } = useDeviceContext();
  const [state, setState] = useState<AutomationState | null>(null);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState<AutomationRule | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [time, setTime] = useState('08:30');
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const [integration, setIntegration] = useState<{
    id: string;
    token: string;
  } | null>(null);

  const reload = useCallback(async () => {
    try {
      setState(JSON.parse(await automation().load()));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      reload();
      const subscription = AppState.addEventListener('change', next => {
        setIntegration(null); // Hide secrets on lock, background and re-entry.
        if (next === 'active') reload();
      });
      return () => {
        subscription.remove();
        setIntegration(null);
      };
    }, [reload]),
  );

  const run = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
      await reload();
    } catch {
      Alert.alert(
        'Automation unavailable',
        'Check the rule settings and retry. Existing data has been preserved.',
      );
    } finally {
      setBusy(false);
    }
  };
  const button = (title: string, action: () => void, label?: string) => (
    <CustomButton
      title={title}
      accessibilityLabel={label}
      disabled={busy || isLoading || !!storageError}
      onPress={action}
      buttonStyle={[
        styles.button,
        { backgroundColor: colors.primary, marginVertical: 4 },
      ]}
      buttonTextStyle={styles.buttonText}
    />
  );
  const edit = (rule: AutomationRule) => {
    setDraft({ ...rule });
    setTime(
      `${String(rule.hour).padStart(2, '0')}:${String(rule.minute).padStart(
        2,
        '0',
      )}`,
    );
    const format = (value: number) =>
      value < 0
        ? ''
        : `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(
            value % 60,
          ).padStart(2, '0')}`;
    setWindowStart(format(rule.windowStart));
    setWindowEnd(format(rule.windowEnd));
  };
  const minutes = (value: string) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
      throw new Error('Invalid time');
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  };
  const save = () =>
    run(async () => {
      if (!draft) return;
      const value = minutes(time);
      await automation().saveRule(
        JSON.stringify({
          ...draft,
          name: draft.name.trim(),
          hour: Math.floor(value / 60),
          minute: value % 60,
          windowStart: windowStart ? minutes(windowStart) : -1,
          windowEnd: windowEnd ? minutes(windowEnd) : -1,
        }),
      );
      setDraft(null);
    });
  const details = (rule: AutomationRule, rotate = false) =>
    run(async () => {
      const data = JSON.parse(await automation().integration(rule.id, rotate));
      setIntegration({ id: data.rule_id, token: data.token });
    });
  const input = (
    label: string,
    value: string,
    change: (text: string) => void,
    maxLength = 120,
  ) => (
    <View>
      <Text style={styles.text}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={styles.input}
        placeholderTextColor={colors.placeholderText}
        value={value}
        onChangeText={change}
        maxLength={maxLength}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        { alignItems: 'stretch', justifyContent: 'flex-start' },
      ]}
    >
      <Text style={styles.title}>Automation</Text>
      {error && (
        <Text style={styles.text}>
          Protected automation storage unavailable.
        </Text>
      )}
      {button('Refresh', () => {
        reload();
      })}
      {state && !error && (
        <ScrollView>
          <Text style={styles.text}>
            Automatic wakes can run while your phone is locked after its first
            unlock. Keep a trusted LAN or VPN connection.
          </Text>
          <Text style={styles.text}>Enable automatic wakes</Text>
          <Switch
            accessibilityLabel="Enable automatic wakes"
            value={state.enabled}
            disabled={busy}
            onValueChange={enabled => {
              run(() => automation().setEnabled(enabled));
            }}
          />
          {!state.exactAllowed && (
            <>
              <Text style={styles.text}>
                Exact rules are suspended until Alarms &amp; reminders access is
                allowed.
              </Text>
              {button('Allow exact alarms', () => {
                run(() => automation().requestExactAccess());
              })}
            </>
          )}
          {button(
            '+',
            () => edit(newRule(devices[0]?.id || '')),
            'Add automation',
          )}
          {state.rules.length === 0 && (
            <Text style={styles.text}>
              No rules yet. Add a schedule or link an external event.
            </Text>
          )}
          {state.rules.map(rule => (
            <View
              key={rule.id}
              style={{
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderColor: colors.borderColor,
              }}
            >
              <Text style={[styles.text, { fontWeight: 'bold' }]}>
                {rule.name}
              </Text>
              <Text style={styles.text}>
                {devices.find(d => d.id === rule.deviceId)?.name ||
                  'Saved device'}{' '}
                · {ruleSummary(rule)}
              </Text>
              <Text style={styles.text}>
                {!state.enabled
                  ? 'Globally paused'
                  : !rule.enabled
                  ? 'Disabled'
                  : rule.suspended ||
                    (rule.nextAt
                      ? `Next: ${new Date(rule.nextAt).toLocaleString()}`
                      : 'Waiting for linked event')}
              </Text>
              <Text style={styles.text}>
                Last: {rule.lastResult || 'No executions'}
              </Text>
              <Switch
                accessibilityLabel={`Enable ${rule.name}`}
                disabled={busy}
                value={rule.enabled}
                onValueChange={enabled => {
                  run(() =>
                    automation().saveRule(JSON.stringify({ ...rule, enabled })),
                  );
                }}
              />
              {button('Edit', () => edit(rule))}
              {button('Test now — sends a wake', () =>
                Alert.alert('Send a real wake?', rule.name, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Send wake',
                    onPress: () => {
                      run(async () =>
                        Alert.alert(
                          'Submission result',
                          await automation().test(rule.id),
                        ),
                      );
                    },
                  },
                ]),
              )}
              {rule.enabled &&
                rule.trigger === 'external' &&
                button('Integration details', () => {
                  details(rule);
                })}
              {button('Delete', () =>
                Alert.alert('Delete rule?', rule.name, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                      run(() => automation().remove(rule.id));
                    },
                  },
                ]),
              )}
            </View>
          ))}
          {button(showHistory ? 'Hide history' : 'Show history', () =>
            setShowHistory(!showHistory),
          )}
          {showHistory &&
            state.history
              .slice()
              .reverse()
              .map((entry, index) => (
                <Text key={index} style={styles.text}>
                  {new Date(entry.time).toLocaleString()} ·{' '}
                  {state.rules.find(r => r.id === entry.ruleId)?.name ||
                    'Deleted rule'}{' '}
                  · {entry.result}
                </Text>
              ))}
        </ScrollView>
      )}
      <Modal
        visible={!!draft}
        onRequestClose={() => {
          if (!busy) setDraft(null);
        }}
        animationType="slide"
      >
        <View style={[styles.container, { alignItems: 'stretch' }]}>
          {draft && (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.title}>Automation rule</Text>
              {input('Name', draft.name, name => setDraft({ ...draft, name }))}
              <Text style={styles.text}>Device</Text>
              {devices.map(device => (
                <View key={device.id}>
                  {button(
                    `${draft.deviceId === device.id ? '✓ ' : ''}${
                      device.name || device.macAddr
                    }`,
                    () => setDraft({ ...draft, deviceId: device.id }),
                  )}
                </View>
              ))}
              {button('Add device', () => setAdding(true))}
              <Text style={styles.text}>Trigger</Text>
              {(['once', 'weekly', 'external'] as const).map(trigger => (
                <View key={trigger}>
                  {button(
                    `${draft.trigger === trigger ? '✓ ' : ''}${
                      {
                        once: 'One time',
                        weekly: 'Weekly',
                        external: 'External event',
                      }[trigger]
                    }`,
                    () => setDraft({ ...draft, trigger }),
                  )}
                </View>
              ))}
              {draft.trigger !== 'external' && (
                <>
                  {input('Local time (HH:MM)', time, setTime, 5)}
                  {draft.trigger === 'once' &&
                    input(
                      'Date (YYYY-MM-DD)',
                      draft.date,
                      date => setDraft({ ...draft, date }),
                      10,
                    )}
                  {draft.trigger === 'weekly' &&
                    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(
                      (day, i) => (
                        <View key={day}>
                          <Text style={styles.text}>{day}</Text>
                          <Switch
                            accessibilityLabel={day}
                            disabled={busy}
                            value={draft.days.includes(i + 1)}
                            onValueChange={selected =>
                              setDraft({
                                ...draft,
                                days: selected
                                  ? [...draft.days, i + 1].sort()
                                  : draft.days.filter(d => d !== i + 1),
                              })
                            }
                          />
                        </View>
                      ),
                    )}
                  <Text style={styles.text}>
                    Exact timing (requires Android access)
                  </Text>
                  <Switch
                    accessibilityLabel="Exact timing"
                    value={draft.precision === 'exact'}
                    disabled={busy}
                    onValueChange={exact =>
                      setDraft({
                        ...draft,
                        precision: exact ? 'exact' : 'flexible',
                        toleranceMinutes: exact ? 5 : 60,
                      })
                    }
                  />
                  <Text style={styles.text}>
                    Flexible alarms can be delayed by Android beyond the
                    tolerance and skipped.
                  </Text>
                  {input(
                    'Late tolerance in minutes (5–1440)',
                    String(draft.toleranceMinutes),
                    value =>
                      setDraft({ ...draft, toleranceMinutes: Number(value) }),
                    4,
                  )}
                </>
              )}
              {input(
                'Minimum seconds between attempts (1–86400)',
                String(draft.cooldownSeconds),
                value => setDraft({ ...draft, cooldownSeconds: Number(value) }),
                5,
              )}
              {input(
                'Allowed from (HH:MM, optional)',
                windowStart,
                setWindowStart,
                5,
              )}
              {input(
                'Allowed until (HH:MM, optional)',
                windowEnd,
                setWindowEnd,
                5,
              )}
              <Text style={styles.text}>
                Both limits are required for a time filter. Overnight windows
                are supported.
              </Text>
              <Text style={styles.text}>
                Allowed days (none selected = every day; overnight filters
                belong to their starting day)
              </Text>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(
                (day, i) => (
                  <View key={`window-${day}`}>
                    <Text style={styles.text}>{day}</Text>
                    <Switch
                      accessibilityLabel={`Allow on ${day}`}
                      disabled={busy}
                      value={draft.windowDays?.includes(i + 1) || false}
                      onValueChange={selected =>
                        setDraft({
                          ...draft,
                          windowDays: selected
                            ? [...(draft.windowDays || []), i + 1].sort()
                            : (draft.windowDays || []).filter(d => d !== i + 1),
                        })
                      }
                    />
                  </View>
                ),
              )}
              <Text style={styles.text}>
                Notify after each attempt (optional)
              </Text>
              <Switch
                accessibilityLabel="Notify after each attempt"
                value={draft.notify || false}
                disabled={busy}
                onValueChange={async notify => {
                  if (
                    notify &&
                    Platform.OS === 'android' &&
                    Number(Platform.Version) >= 33
                  ) {
                    const result = await PermissionsAndroid.request(
                      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
                    );
                    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
                      Alert.alert(
                        'Notifications disabled',
                        'Rules still run without notifications.',
                      );
                      return;
                    }
                  }
                  setDraft({ ...draft, notify });
                }}
              />
              <Text style={styles.text}>{ruleSummary(draft)}</Text>
              <Text style={styles.text}>
                Enable this rule (allows automatic wakes)
              </Text>
              <Switch
                accessibilityLabel="Enable this rule"
                disabled={busy}
                value={draft.enabled}
                onValueChange={enabled => setDraft({ ...draft, enabled })}
              />
              {button('Save rule', () => {
                save();
              })}
              {button('Cancel', () => setDraft(null))}
            </ScrollView>
          )}
        </View>
      </Modal>
      <Modal
        visible={adding}
        onRequestClose={() => setAdding(false)}
        animationType="slide"
      >
        <AddDeviceScreen
          onClose={() => setAdding(false)}
          onSaved={device => {
            if (draft) setDraft({ ...draft, deviceId: device.id });
            setAdding(false);
          }}
        />
      </Modal>
      <Modal
        visible={!!integration}
        onRequestClose={() => setIntegration(null)}
      >
        <View style={[styles.container, { alignItems: 'stretch' }]}>
          <ScrollView>
            <Text style={styles.title}>MacroDroid · Send Intent</Text>
            <Text style={styles.text}>
              Keep this token private. Anyone holding it can request this rule.
              Use a unique event_id for each event; reuse it only when retrying
              the same event.
            </Text>
            <Text selectable style={styles.text}>
              Target: Broadcast{'\n'}Action:
              com.awakeonlanmobile.AUTOMATION_EVENT{'\n'}Package:
              com.awakeonlanmobile{'\n'}Class:
              com.awakeonlanmobile.AutomationEventReceiver{'\n'}String extras:
              {'\n'}rule_id: {integration?.id}
              {'\n'}token: {integration?.token}
              {'\n'}event_id: [unique event identifier]
            </Text>
            {button('Revoke and replace token', () => {
              const rule = state?.rules.find(r => r.id === integration?.id);
              if (rule) details(rule, true);
            })}
            {button('Close', () => setIntegration(null))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

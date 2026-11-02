import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  automation,
  AutomationRule,
  AutomationState,
  automationResult,
  newRule,
  ruleSummary,
} from '../services/automation';
import { useDeviceContext } from '../contexts/DeviceContext';
import { useAutomationStyles } from '../styles/automation';
import {
  AutomationButton,
  AutomationToggle,
} from '../components/AutomationControls';
import { AutomationEditor } from '../components/AutomationEditor';

export const AutomationScreen = () => {
  const styles = useAutomationStyles();
  const { devices, isLoading, storageError } = useDeviceContext();
  const [state, setState] = useState<AutomationState | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [draft, setDraft] = useState<AutomationRule | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [actions, setActions] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
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
        setIntegration(null);
        if (next === 'active') reload();
      });
      return () => {
        subscription.remove();
        setIntegration(null);
        setActions(null);
      };
    }, [reload]),
  );
  const perform = async (work: () => Promise<unknown>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await work();
      await reload();
    } catch {
      Alert.alert(
        'Could not update automation',
        'Your saved settings have been preserved. Please retry.',
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const refresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };
  const connect = (rule: AutomationRule, rotate = false) => {
    setActions(null);
    if (!rule.enabled) {
      Alert.alert(
        'Enable this rule first',
        'Turn on the switch beside this automation, then open Connect MacroDroid again.',
      );
      return;
    }
    perform(async () => {
      const data = JSON.parse(await automation().integration(rule.id, rotate));
      setIntegration({ id: data.rule_id, token: data.token });
    });
  };
  const selectedRule = state?.rules.find(rule => rule.id === actions);
  const exactBlocked =
    state?.rules.some(
      rule =>
        rule.enabled &&
        rule.trigger !== 'external' &&
        rule.precision === 'exact',
    ) && !state?.exactAllowed;
  const disabled = busy || isLoading || !!storageError;
  const deviceName = (id: string) => {
    const device = devices.find(item => item.id === id);
    return device?.name || device?.macAddr || 'Device no longer saved';
  };
  const ruleStatus = (rule: AutomationRule) => {
    if (!rule.enabled) return 'Off';
    if (!state?.enabled) return 'Paused by the main switch';
    if (rule.suspended === 'Exact alarm access required')
      return 'Waiting for alarm permission';
    if (rule.suspended === 'No future occurrence')
      return 'No future date — edit the schedule';
    if (rule.suspended) return 'Needs attention — edit this rule';
    return rule.nextAt
      ? `Next wake: ${new Date(rule.nextAt).toLocaleString()}`
      : 'Ready for a linked event';
  };
  const closeDraft = () => {
    if (!savingDraft) setDraft(null);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              refresh();
            }}
          />
        }
      >
        <View style={styles.row}>
          <Text style={styles.title}>Automation</Text>
          <AutomationButton
            title="How to use"
            tone="link"
            onPress={() => setShowHelp(!showHelp)}
          />
        </View>
        <Text style={styles.muted}>
          Wake a saved PC on a schedule or when a linked app sends an event.
        </Text>
        {showHelp && (
          <View style={styles.card}>
            <Text style={styles.heading}>Set it up in three steps</Text>
            <Text style={styles.text}>
              1. Add an automation and choose the PC to wake.
            </Text>
            <Text style={styles.text}>
              2. Choose a one-time date, weekly schedule or event from
              MacroDroid.
            </Text>
            <Text style={styles.text}>
              3. Enable the rule and save. Automatic wakes turns on too. Both
              switches must be on for a rule to run.
            </Text>
            <Text style={styles.muted}>
              The phone must be on a trusted LAN or VPN. Wakes can run while
              locked after the first unlock following a reboot. Force-stop
              pauses delivery until you reopen the app.
            </Text>
            <AutomationButton
              title="Got it"
              tone="link"
              onPress={() => setShowHelp(false)}
            />
          </View>
        )}
        {!state && !error && (
          <ActivityIndicator accessibilityLabel="Loading automations" />
        )}
        {(error || storageError) && (
          <View style={styles.card}>
            <Text style={styles.heading}>Automations are unavailable</Text>
            <Text style={styles.muted}>
              {storageError ||
                'Could not open the protected automation archive. Your saved rules have not been replaced.'}
            </Text>
            <AutomationButton
              title="Try again"
              onPress={() => {
                reload();
              }}
            />
          </View>
        )}
        {state && !error && !storageError && (
          <>
            <View style={styles.card}>
              <AutomationToggle
                title="Automatic wakes"
                description={
                  state.enabled
                    ? 'Running: enabled rules can send wake packets.'
                    : 'Paused: no rule will send a wake packet.'
                }
                value={state.enabled}
                disabled={disabled}
                onChange={enabled => {
                  perform(() => automation().setEnabled(enabled));
                }}
              />
              <Text style={styles.muted}>
                Use this switch to pause or resume all rules. Enabling a rule
                also resumes Automatic wakes and the other enabled rules.
              </Text>
            </View>
            {!!exactBlocked && (
              <View style={styles.notice}>
                <Text style={styles.text}>
                  Some schedules need alarm permission
                </Text>
                <Text style={styles.muted}>
                  On-time rules wait until Alarms &amp; reminders access is
                  allowed. Other rules can still run.
                </Text>
                <AutomationButton
                  title="Allow alarms"
                  disabled={disabled}
                  onPress={() => {
                    perform(() => automation().requestExactAccess());
                  }}
                />
              </View>
            )}
            <AutomationButton
              title="Add automation"
              tone="primary"
              disabled={disabled}
              onPress={() => setDraft(newRule(devices[0]?.id || ''))}
            />
            {state.rules.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.heading}>Your first automatic wake</Text>
                <Text style={styles.text}>
                  For example: wake your office PC Monday to Friday at 08:30.
                </Text>
                <Text style={styles.muted}>
                  Start with Add automation. Choose a PC, pick when it should
                  wake, then review and enable the rule.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.heading}>
                  Your rules · {state.rules.length}
                </Text>
                {state.rules.map(rule => (
                  <View key={rule.id} style={styles.card}>
                    <AutomationToggle
                      title={rule.name}
                      description={deviceName(rule.deviceId)}
                      value={rule.enabled}
                      disabled={disabled}
                      onChange={enabled => {
                        perform(() =>
                          automation().saveRule(
                            JSON.stringify({ ...rule, enabled }),
                          ),
                        );
                      }}
                    />
                    <Text style={styles.text}>{ruleSummary(rule)}</Text>
                    <Text style={styles.muted}>{ruleStatus(rule)}</Text>
                    <View style={styles.divider}>
                      <Text style={styles.muted}>
                        Last attempt: {automationResult(rule.lastResult)}
                      </Text>
                      {!!rule.lastAttempt && (
                        <Text style={styles.muted}>
                          {new Date(rule.lastAttempt).toLocaleString()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.actions}>
                      <AutomationButton
                        title="Edit"
                        disabled={disabled}
                        onPress={() => setDraft(rule)}
                      />
                      <AutomationButton
                        title="More"
                        disabled={disabled}
                        onPress={() => setActions(rule.id)}
                      />
                    </View>
                  </View>
                ))}
              </>
            )}
            <View style={styles.row}>
              <AutomationButton
                title={showHistory ? 'Hide activity' : 'Recent activity'}
                tone="link"
                onPress={() => setShowHistory(!showHistory)}
              />
              <AutomationButton
                title="Refresh"
                tone="link"
                disabled={busy || refreshing}
                onPress={() => {
                  refresh();
                }}
              />
            </View>
            {showHistory && (
              <View style={styles.card}>
                <Text style={styles.heading}>Recent activity</Text>
                {state.history.length === 0 && (
                  <Text style={styles.muted}>
                    No attempts yet. Results will appear here when a rule runs.
                  </Text>
                )}
                {state.history
                  .slice()
                  .reverse()
                  .map((entry, index) => (
                    <View
                      key={index}
                      style={index ? styles.divider : styles.stack}
                    >
                      <Text style={styles.text}>
                        {state.rules.find(rule => rule.id === entry.ruleId)
                          ?.name || 'Deleted rule'}
                      </Text>
                      <Text style={styles.muted}>
                        {automationResult(entry.result)}
                      </Text>
                      <Text style={styles.muted}>
                        {new Date(entry.time).toLocaleString()}
                      </Text>
                    </View>
                  ))}
                <Text style={styles.muted}>
                  A sent packet does not confirm that the PC started. The latest
                  100 attempts are kept on this phone.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
      <Modal
        visible={!!draft}
        animationType="slide"
        onRequestClose={closeDraft}
      >
        {draft && (
          <AutomationEditor
            key={draft.id}
            rule={draft}
            exactAllowed={state?.exactAllowed || false}
            globallyEnabled={state?.enabled || false}
            onCancel={closeDraft}
            onSave={async rule => {
              setSavingDraft(true);
              try {
                await automation().saveRule(JSON.stringify(rule));
                setDraft(null);
                await reload();
              } finally {
                setSavingDraft(false);
              }
            }}
          />
        )}
      </Modal>
      <Modal
        visible={!!selectedRule}
        transparent
        animationType="slide"
        onRequestClose={() => setActions(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            {selectedRule && (
              <>
                <Text style={styles.heading}>{selectedRule.name}</Text>
                <Text style={styles.muted}>
                  Test this rule, manage its connection or remove it.
                </Text>
                <AutomationButton
                  title="Test wake now"
                  disabled={disabled}
                  onPress={() => {
                    const rule = selectedRule;
                    setActions(null);
                    Alert.alert(
                      'Send a real wake packet?',
                      'This test uses the rule’s switches, time filters and minimum interval. The PC may turn on.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Send wake',
                          onPress: () => {
                            perform(async () =>
                              Alert.alert(
                                'Test result',
                                automationResult(
                                  await automation().test(rule.id),
                                ),
                              ),
                            );
                          },
                        },
                      ],
                    );
                  }}
                />
                {selectedRule.trigger === 'external' && (
                  <AutomationButton
                    title="Connect MacroDroid"
                    disabled={disabled}
                    onPress={() => connect(selectedRule)}
                  />
                )}
                <AutomationButton
                  title="Delete automation"
                  tone="danger"
                  disabled={disabled}
                  onPress={() => {
                    const rule = selectedRule;
                    setActions(null);
                    Alert.alert('Delete automation?', rule.name, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => {
                          perform(() => automation().remove(rule.id));
                        },
                      },
                    ]);
                  }}
                />
                <AutomationButton
                  title="Close"
                  tone="link"
                  onPress={() => setActions(null)}
                />
              </>
            )}
          </View>
        </View>
      </Modal>
      <Modal
        visible={!!integration}
        animationType="slide"
        onRequestClose={() => setIntegration(null)}
      >
        <View style={styles.screen}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>Connect MacroDroid</Text>
            <Text style={styles.text}>
              1. Create a macro with the event you want to use.
            </Text>
            <Text style={styles.text}>
              2. Add Send Intent and enter the fields below. All extras are
              strings.
            </Text>
            <View style={styles.card}>
              {[
                ['Target', 'Broadcast'],
                ['Action', 'com.awakeonlanmobile.AUTOMATION_EVENT'],
                ['Package', 'com.awakeonlanmobile'],
                ['Class', 'com.awakeonlanmobile.AutomationEventReceiver'],
                ['Extra: rule_id', integration?.id],
                ['Extra: token', integration?.token],
                [
                  'Extra: event_id',
                  'A unique ID for each event, e.g. desk-001',
                ],
              ].map(([label, value]) => (
                <View key={label}>
                  <Text style={styles.label}>{label}</Text>
                  <Text selectable style={styles.code}>
                    {value}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={styles.text}>
              3. Enable the macro, this rule and Automatic wakes. Trigger the
              event and check Recent activity.
            </Text>
            <Text style={styles.muted}>
              Use a new event_id for each event and reuse it only when retrying
              the same event. IDs can contain letters, numbers, dots, colons,
              hyphens and underscores.
            </Text>
            <View style={styles.notice}>
              <Text style={styles.text}>
                Keep the token private. It allows the connected app to request
                this rule. Replacing it immediately disconnects the old macro
                until you update its token.
              </Text>
            </View>
            <AutomationButton
              title="Replace connection token"
              tone="danger"
              disabled={busy}
              onPress={() => {
                const rule = state?.rules.find(
                  item => item.id === integration?.id,
                );
                if (rule)
                  Alert.alert(
                    'Replace this token?',
                    'The existing macro will stop working until you update it with the new token.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Replace', onPress: () => connect(rule, true) },
                    ],
                  );
              }}
            />
          </ScrollView>
          <View style={styles.footer}>
            <AutomationButton
              title="Done"
              tone="primary"
              onPress={() => setIntegration(null)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

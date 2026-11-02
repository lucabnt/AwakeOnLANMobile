import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  PermissionsAndroid,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AutomationRule,
  automation,
  ruleSummary,
} from '../services/automation';
import { useDeviceContext } from '../contexts/DeviceContext';
import { useBaseStyles, useColors } from '../styles/base';
import { useAutomationStyles } from '../styles/automation';
import {
  AutomationButton,
  AutomationChoice,
  AutomationDays,
  AutomationToggle,
} from './AutomationControls';
import { AddDeviceScreen } from '../screens/AddDeviceScreen';

function parseTime(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new Error('Enter a time as HH:MM, for example 08:30.');
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}
function formatTime(value: number) {
  return value < 0
    ? ''
    : `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(
        value % 60,
      ).padStart(2, '0')}`;
}

export function AutomationEditor({
  rule,
  exactAllowed,
  globallyEnabled,
  onSave,
  onCancel,
}: {
  rule: AutomationRule;
  exactAllowed: boolean;
  globallyEnabled: boolean;
  onSave: (rule: AutomationRule) => Promise<void>;
  onCancel: () => void;
}) {
  const styles = useAutomationStyles();
  const base = useBaseStyles();
  const colors = useColors();
  const { devices, isLoading, storageError } = useDeviceContext();
  const [draft, setDraft] = useState({ ...rule });
  const [step, setStep] = useState(0);
  const [time, setTime] = useState(formatTime(rule.hour * 60 + rule.minute));
  const [windowStart, setWindowStart] = useState(formatTime(rule.windowStart));
  const [windowEnd, setWindowEnd] = useState(formatTime(rule.windowEnd));
  const [adding, setAdding] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const device = devices.find(item => item.id === draft.deviceId);
  const deviceName = device?.name || device?.macAddr || 'your PC';
  const disabled = saving || isLoading || !!storageError;

  const scheduledDraft = () => {
    const minutes =
      draft.trigger === 'external'
        ? draft.hour * 60 + draft.minute
        : parseTime(time);
    if (draft.trigger === 'weekly' && !draft.days.length)
      throw new Error('Choose at least one weekday.');
    if (draft.trigger === 'once') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date))
        throw new Error(
          'Enter the date as YYYY-MM-DD, for example 2026-11-03.',
        );
      const [year, month, day] = draft.date.split('-').map(Number);
      const date = new Date(
        year,
        month - 1,
        day,
        Math.floor(minutes / 60),
        minutes % 60,
      );
      if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
      )
        throw new Error('Choose a valid calendar date.');
      if (
        date.getHours() !== Math.floor(minutes / 60) ||
        date.getMinutes() !== minutes % 60
      )
        throw new Error(
          'This local time does not exist because the clocks change. Choose another time.',
        );
      if (date.getTime() <= Date.now())
        throw new Error('Choose a date and time in the future.');
    }
    return { ...draft, hour: Math.floor(minutes / 60), minute: minutes % 60 };
  };
  const next = () => {
    setError('');
    try {
      if (!device) throw new Error('Choose a saved device, or add one first.');
      if (step === 1) setDraft(scheduledDraft());
      setStep(step + 1);
    } catch (problem) {
      setError((problem as Error).message);
    }
  };
  const save = async () => {
    setError('');
    let configured: AutomationRule;
    try {
      if (!device)
        throw new Error(
          'The selected device is no longer saved. Go back and choose another.',
        );
      configured = scheduledDraft();
      if (!!windowStart !== !!windowEnd)
        throw new Error('Set both allowed-time limits, or leave both empty.');
      const start = windowStart ? parseTime(windowStart) : -1;
      const end = windowEnd ? parseTime(windowEnd) : -1;
      if (start >= 0 && start === end)
        throw new Error(
          'Choose different start and end times, or leave both empty for all day.',
        );
      if (
        !Number.isInteger(draft.toleranceMinutes) ||
        draft.toleranceMinutes < 5 ||
        draft.toleranceMinutes > 1440
      )
        throw new Error(
          'Late tolerance must be a whole number from 5 to 1440 minutes.',
        );
      if (
        !Number.isInteger(draft.cooldownSeconds) ||
        draft.cooldownSeconds < 1 ||
        draft.cooldownSeconds > 86400
      )
        throw new Error(
          'The minimum interval must be a whole number from 1 to 86400 seconds.',
        );
      configured = {
        ...configured,
        name: draft.name.trim() || `Wake ${deviceName}`.slice(0, 120),
        windowStart: start,
        windowEnd: end,
      };
    } catch (problem) {
      setError((problem as Error).message);
      return;
    }
    setSaving(true);
    try {
      await onSave(configured);
    } catch {
      setError(
        'Could not save the automation. Your changes are still here; please retry.',
      );
    } finally {
      setSaving(false);
    }
  };
  const field = (
    label: string,
    value: string,
    change: (value: string) => void,
    placeholder?: string,
    maxLength = 120,
    numeric = false,
  ) => (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={base.input}
        value={value}
        onChangeText={change}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholderText}
        maxLength={maxLength}
        keyboardType={numeric ? 'number-pad' : 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
      />
    </View>
  );
  const allowExact = async () => {
    try {
      await automation().requestExactAccess();
    } catch {
      setError(
        'Open Alarms & reminders in Android settings and allow this app.',
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.editorHeader}>
        <View style={styles.row}>
          <Text style={styles.eyebrow}>
            STEP {step + 1} OF 3 · {['DEVICE', 'WHEN', 'REVIEW'][step]}
          </Text>
          <AutomationButton
            title="Cancel"
            tone="link"
            disabled={saving}
            onPress={onCancel}
          />
        </View>
        <View style={styles.progress}>
          {[0, 1, 2].map(index => (
            <View
              key={index}
              style={[
                styles.progressPart,
                index <= step && styles.progressActive,
              ]}
            />
          ))}
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title} accessibilityLiveRegion="polite">
          {
            [
              'Which PC should wake?',
              'When should it wake?',
              'Review your automation',
            ][step]
          }
        </Text>
        {step === 0 && (
          <>
            <Text style={styles.muted}>
              One automation wakes one saved device. You can give it a name to
              find it later.
            </Text>
            {devices.length === 0 && (
              <Text style={styles.text}>
                Add your first device to get started. You will return to this
                setup after saving it.
              </Text>
            )}
            {devices.map(item => (
              <AutomationChoice
                key={item.id}
                title={item.name || 'Saved device'}
                description={item.macAddr}
                selected={draft.deviceId === item.id}
                disabled={disabled}
                onPress={() => setDraft({ ...draft, deviceId: item.id })}
              />
            ))}
            <AutomationButton
              title="Add a device"
              disabled={disabled}
              onPress={() => setAdding(true)}
            />
            {field(
              'Name (optional)',
              draft.name,
              name => setDraft({ ...draft, name }),
              `Wake ${deviceName}`,
            )}
          </>
        )}
        {step === 1 && (
          <>
            <Text style={styles.muted}>
              Choose one way to start this automation.
            </Text>
            {(
              [
                [
                  'weekly',
                  'Every week',
                  'Choose weekdays and a time, such as workdays at 08:30.',
                ],
                ['once', 'Just once', 'Choose a future date and time.'],
                [
                  'external',
                  'From another app',
                  'Connect a MacroDroid event after saving this automation.',
                ],
              ] as const
            ).map(([trigger, title, description]) => (
              <AutomationChoice
                key={trigger}
                title={title}
                description={description}
                selected={draft.trigger === trigger}
                disabled={disabled}
                onPress={() => {
                  setDraft({ ...draft, trigger });
                  setError('');
                }}
              />
            ))}
            {draft.trigger === 'external' ? (
              <View style={styles.notice}>
                <Text style={styles.text}>
                  After saving, enable this rule and open More → Connect
                  MacroDroid. An event in that app will request a wake for{' '}
                  {deviceName}.
                </Text>
              </View>
            ) : (
              <>
                {draft.trigger === 'once' &&
                  field(
                    'Date',
                    draft.date,
                    date => setDraft({ ...draft, date }),
                    'YYYY-MM-DD',
                    10,
                  )}
                {field(
                  'Time on this phone',
                  time,
                  setTime,
                  'HH:MM — for example 08:30',
                  5,
                )}
                {draft.trigger === 'weekly' && (
                  <View style={styles.stack}>
                    <Text style={styles.label}>Repeat on</Text>
                    <AutomationDays
                      label="Repeat on"
                      value={draft.days}
                      disabled={disabled}
                      onChange={days => setDraft({ ...draft, days })}
                    />
                  </View>
                )}
                <Text style={styles.heading}>Timing</Text>
                <AutomationChoice
                  title="On time"
                  description="Uses Android’s exact-alarm access. If access is missing, this rule waits for permission."
                  selected={draft.precision === 'exact'}
                  disabled={disabled}
                  onPress={() =>
                    setDraft({
                      ...draft,
                      precision: 'exact',
                      toleranceMinutes: 5,
                    })
                  }
                />
                <AutomationChoice
                  title="Flexible"
                  description="No special alarm access. Android may delay or skip the wake, especially in battery-saving mode."
                  selected={draft.precision === 'flexible'}
                  disabled={disabled}
                  onPress={() =>
                    setDraft({
                      ...draft,
                      precision: 'flexible',
                      toleranceMinutes: 60,
                    })
                  }
                />
                {draft.precision === 'exact' && !exactAllowed && (
                  <View style={styles.notice}>
                    <Text style={styles.text}>
                      Allow Alarms &amp; reminders to run this schedule on time.
                      You can also save it now and grant access later.
                    </Text>
                    <AutomationButton
                      title="Allow alarms"
                      disabled={disabled}
                      onPress={() => {
                        allowExact();
                      }}
                    />
                  </View>
                )}
              </>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <View style={styles.card}>
              <Text style={styles.eyebrow}>WAKE</Text>
              <Text style={styles.heading}>{deviceName}</Text>
              <Text style={styles.text}>{ruleSummary(draft)}</Text>
              {draft.trigger !== 'external' && (
                <Text style={styles.muted}>
                  {draft.precision === 'exact'
                    ? 'On-time schedule'
                    : 'Flexible schedule'}{' '}
                  · phone’s local time
                </Text>
              )}
              {(windowStart || windowEnd || draft.windowDays?.length > 0) && (
                <Text style={styles.muted}>
                  Allowed:{' '}
                  {draft.windowDays?.length
                    ? draft.windowDays
                        .slice()
                        .sort()
                        .map(
                          day =>
                            ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][
                              day - 1
                            ],
                        )
                        .join(', ')
                    : 'every day'}
                  {windowStart && windowEnd
                    ? ` · ${windowStart}–${windowEnd}`
                    : ' · all day'}
                </Text>
              )}
            </View>
            <AutomationToggle
              title="Enable this automation"
              description="Turn this on to make the rule ready. Leave it off to save it for later."
              value={draft.enabled}
              disabled={disabled}
              onChange={enabled => setDraft({ ...draft, enabled })}
            />
            {!globallyEnabled && (
              <View style={styles.notice}>
                <Text style={styles.text}>
                  {draft.enabled && !rule.enabled
                    ? 'Saving this enabled automation also turns on Automatic wakes. Other enabled rules will resume too.'
                    : draft.enabled
                    ? 'Automatic wakes are paused. Editing this already-enabled rule keeps the pause; use the main switch to resume all enabled rules.'
                    : 'Automatic wakes are currently paused. Enable this automation and save to turn them on too.'}
                </Text>
              </View>
            )}
            {draft.enabled &&
              draft.trigger !== 'external' &&
              draft.precision === 'exact' &&
              !exactAllowed && (
                <Text style={styles.muted}>
                  This rule will also need Alarms &amp; reminders access before
                  it can run.
                </Text>
              )}
            <AutomationToggle
              title="Notify me after an attempt"
              description="Optional. The history records results even when notifications are off."
              value={draft.notify || false}
              disabled={disabled}
              onChange={async notify => {
                if (
                  notify &&
                  Platform.OS === 'android' &&
                  Number(Platform.Version) >= 33
                ) {
                  const result = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
                  );
                  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
                    setError(
                      'Notification permission was not granted. You can still save and run this rule.',
                    );
                    return;
                  }
                }
                setDraft(previous => ({ ...previous, notify }));
              }}
            />
            <AutomationButton
              title={advanced ? 'Hide advanced options' : 'Advanced options'}
              tone="link"
              onPress={() => setAdvanced(!advanced)}
            />
            {!advanced && (
              <Text style={styles.muted}>
                Optional day/hour filters, late tolerance and minimum interval.
                Open to review or customize these settings.
              </Text>
            )}
            {advanced && (
              <View style={styles.card}>
                <Text style={styles.heading}>
                  Only allow wakes at these times
                </Text>
                <Text style={styles.muted}>
                  These are filters, not extra triggers. Leave both times blank
                  for all day. A 22:00–06:00 window continues into the next
                  morning.
                </Text>
                {field(
                  'Allowed from (optional)',
                  windowStart,
                  setWindowStart,
                  'HH:MM',
                  5,
                )}
                {field(
                  'Allowed until (optional)',
                  windowEnd,
                  setWindowEnd,
                  'HH:MM',
                  5,
                )}
                <Text style={styles.label}>Allowed days</Text>
                <AutomationDays
                  label="Allowed day"
                  value={draft.windowDays || []}
                  disabled={disabled}
                  onChange={windowDays => setDraft({ ...draft, windowDays })}
                />
                <Text style={styles.muted}>
                  None selected means every day. An overnight window belongs to
                  the day it starts.
                </Text>
                {draft.trigger !== 'external' && (
                  <>
                    {field(
                      'Skip if more than this many minutes late',
                      String(draft.toleranceMinutes),
                      value =>
                        setDraft({ ...draft, toleranceMinutes: Number(value) }),
                      '5–1440 minutes',
                      4,
                      true,
                    )}
                    <Text style={styles.muted}>
                      Late delivery does not cause a catch-up wake after this
                      limit.
                    </Text>
                  </>
                )}
                {field(
                  'Minimum seconds between attempts',
                  String(draft.cooldownSeconds),
                  value =>
                    setDraft({ ...draft, cooldownSeconds: Number(value) }),
                  '1–86400 seconds',
                  5,
                  true,
                )}
              </View>
            )}
            <Text style={styles.muted}>
              Enabled rules may send wakes while the phone is locked, after its
              first unlock following a reboot. Keep the phone on a trusted LAN
              or VPN. Sending a packet does not confirm PC startup.
            </Text>
          </>
        )}
      </ScrollView>
      <View style={styles.footer}>
        {!!(error || storageError) && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error || storageError}
          </Text>
        )}
        <View style={styles.row}>
          {step > 0 && (
            <View style={styles.grow}>
              <AutomationButton
                title="Back"
                disabled={saving}
                onPress={() => {
                  setError('');
                  setStep(step - 1);
                }}
              />
            </View>
          )}
          <View style={styles.grow}>
            <AutomationButton
              title={
                saving ? 'Saving…' : step === 2 ? 'Save automation' : 'Continue'
              }
              tone="primary"
              disabled={disabled}
              onPress={
                step === 2
                  ? () => {
                      save();
                    }
                  : next
              }
            />
          </View>
        </View>
      </View>
      <Modal
        visible={adding}
        animationType="slide"
        onRequestClose={() => setAdding(false)}
      >
        <AddDeviceScreen
          onClose={() => setAdding(false)}
          onSaved={item => {
            setDraft(previous => ({ ...previous, deviceId: item.id }));
            setAdding(false);
          }}
        />
      </Modal>
    </KeyboardAvoidingView>
  );
}

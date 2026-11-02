import { NativeModules, Platform } from 'react-native';

export interface AutomationRule {
  version: 1;
  id: string;
  name: string;
  deviceId: string;
  enabled: boolean;
  trigger: 'once' | 'weekly' | 'external';
  date: string;
  hour: number;
  minute: number;
  days: number[];
  precision: 'exact' | 'flexible';
  toleranceMinutes: number;
  cooldownSeconds: number;
  windowStart: number;
  windowEnd: number;
  windowDays: number[];
  notify: boolean;
  nextAt?: number;
  suspended?: string;
  lastResult?: string;
  lastAttempt?: number;
}

export interface AutomationState {
  enabled: boolean;
  exactAllowed: boolean;
  rules: AutomationRule[];
  history: { ruleId: string; time: number; result: string }[];
}

interface AutomationBridge {
  load(): Promise<string>;
  saveRule(json: string): Promise<string>;
  remove(id: string): Promise<string>;
  setEnabled(enabled: boolean): Promise<string>;
  test(id: string): Promise<string>;
  integration(id: string, rotate: boolean): Promise<string>;
  requestExactAccess(): Promise<boolean>;
}
export function automation(): AutomationBridge {
  if (Platform.OS !== 'android' || !NativeModules.Automation) {
    throw new Error('Automations require Android.');
  }
  return NativeModules.Automation as AutomationBridge;
}

export function newRule(deviceId: string): AutomationRule {
  const now = new Date();
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  return {
    version: 1,
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name: '',
    deviceId,
    enabled: false,
    trigger: 'weekly',
    date: `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(
      2,
      '0',
    )}-${String(tomorrow.getDate()).padStart(2, '0')}`,
    hour: 8,
    minute: 30,
    days: [1, 2, 3, 4, 5],
    precision: 'exact',
    toleranceMinutes: 5,
    cooldownSeconds: 60,
    windowStart: -1,
    windowEnd: -1,
    windowDays: [],
    notify: false,
  };
}

export function ruleSummary(rule: AutomationRule): string {
  if (rule.trigger === 'external') return 'When a linked app sends an event';
  const time = `${String(rule.hour).padStart(2, '0')}:${String(
    rule.minute,
  ).padStart(2, '0')}`;
  return `${
    rule.trigger === 'once'
      ? rule.date
      : rule.days
          .slice()
          .sort()
          .map(d => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d - 1])
          .join(', ')
  } at ${time}`;
}

export function automationResult(result?: string): string {
  const labels: Record<string, string> = {
    sent: 'Wake packet sent',
    disabled: 'Paused — no packet sent',
    rejected: 'Event not accepted',
    duplicate: 'Repeated event ignored',
    'pending: delivery uncertain': 'Delivery not confirmed',
    'skipped: late occurrence': 'Skipped: arrived too late',
    'skipped: outside time window':
      'Skipped: outside the allowed days or hours',
    'skipped: cooldown': 'Skipped: too soon after the previous attempt',
    'skipped: device removed': 'Skipped: device no longer saved',
    'skipped: duplicate occurrence': 'Repeated schedule ignored',
    'error: packet not confirmed': 'Packet submission failed',
  };
  return result
    ? labels[result] || 'Attempt could not be completed'
    : 'Not run yet';
}

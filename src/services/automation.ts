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
  if (rule.trigger === 'external') return 'Waiting for linked event';
  const time = `${String(rule.hour).padStart(2, '0')}:${String(
    rule.minute,
  ).padStart(2, '0')}`;
  return `${
    rule.trigger === 'once'
      ? rule.date
      : rule.days
          .map(d => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d - 1])
          .join(', ')
  } at ${time} · ${rule.precision}`;
}

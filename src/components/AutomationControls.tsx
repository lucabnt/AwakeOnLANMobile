import React from 'react';
import { Switch, Text, TouchableOpacity, View } from 'react-native';
import { CustomButton } from './CustomButton';
import { useAutomationStyles } from '../styles/automation';

export function AutomationButton({
  title,
  onPress,
  disabled = false,
  tone = 'secondary',
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'link' | 'danger';
}) {
  const styles = useAutomationStyles();
  return (
    <CustomButton
      title={title}
      disabled={disabled}
      onPress={onPress}
      buttonStyle={
        tone === 'link'
          ? styles.link
          : [
              styles.button,
              tone === 'primary' ? styles.primary : styles.secondary,
            ]
      }
      buttonTextStyle={
        tone === 'primary'
          ? styles.primaryText
          : tone === 'link'
          ? styles.linkText
          : tone === 'danger'
          ? styles.dangerText
          : styles.secondaryText
      }
    />
  );
}

export function AutomationToggle({
  title,
  description,
  value,
  disabled,
  onChange,
}: {
  title: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const styles = useAutomationStyles();
  return (
    <View style={styles.row}>
      <View style={styles.grow}>
        <Text style={styles.label}>{title}</Text>
        {description && <Text style={styles.muted}>{description}</Text>}
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
      />
    </View>
  );
}

export function AutomationChoice({
  title,
  description,
  selected,
  disabled,
  onPress,
}: {
  title: string;
  description?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const styles = useAutomationStyles();
  return (
    <TouchableOpacity
      accessibilityRole="radio"
      accessibilityLabel={description ? `${title}. ${description}` : title}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.choice, selected && styles.selectedChoice]}
    >
      <Text style={styles.choiceTitle}>
        {selected ? '● ' : '○ '}
        {title}
      </Text>
      {description && <Text style={styles.muted}>{description}</Text>}
    </TouchableOpacity>
  );
}

export function AutomationDays({
  value,
  onChange,
  label,
  disabled,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  label: string;
  disabled?: boolean;
}) {
  const styles = useAutomationStyles();
  return (
    <View style={styles.days}>
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => {
        const number = index + 1;
        const selected = value.includes(number);
        return (
          <TouchableOpacity
            key={day}
            accessibilityRole="checkbox"
            accessibilityLabel={`${label}: ${day}`}
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() =>
              onChange(
                selected
                  ? value.filter(d => d !== number)
                  : [...value, number].sort(),
              )
            }
            style={[styles.day, selected && styles.selectedDay]}
          >
            <Text style={[styles.dayText, selected && styles.selectedDayText]}>
              {selected ? '✓ ' : ''}
              {day}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

import React from 'react';
import {
  Text,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
  TextStyle,
  StyleSheet,
} from 'react-native';

const styles = StyleSheet.create({
  touchTarget: { minHeight: 48, justifyContent: 'center' },
  disabled: { opacity: 0.45 },
});

interface CustomButtonProps {
  arg?: string; // Optional arg
  title: string;
  onPress: (arg?: string) => void;
  buttonStyle?: StyleProp<ViewStyle>;
  buttonTextStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
}

export const CustomButton: React.FC<CustomButtonProps> = ({
  arg,
  title,
  onPress,
  buttonStyle,
  buttonTextStyle,
  disabled = false,
  accessibilityLabel,
}) => {
  return (
    <TouchableOpacity
      style={[styles.touchTarget, buttonStyle, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled }}
      onPress={() => onPress(arg)}
      disabled={disabled}
    >
      <Text style={buttonTextStyle}>{title}</Text>
    </TouchableOpacity>
  );
};

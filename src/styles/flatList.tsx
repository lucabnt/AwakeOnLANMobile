import { StyleSheet } from 'react-native';
import { useColors } from './base';

export const useDeviceFlatListStyles = () => {
  const colors = useColors();
  const action = {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexGrow: 1,
    flexBasis: '20%' as const,
  };
  return StyleSheet.create({
    list: { width: '100%' },
    itemContainer: {
      padding: 16,
      borderWidth: 1,
      borderColor: colors.borderColor,
      borderRadius: 20,
      backgroundColor: colors.surface,
      marginBottom: 12,
    },
    textContainer: { flexShrink: 1, gap: 4, marginBottom: 12 },
    name: { fontSize: 20, fontWeight: '700', color: colors.text },
    text: { fontSize: 14, color: colors.muted, lineHeight: 21 },
    buttonContainer: { gap: 8, flexDirection: 'row', flexWrap: 'wrap' },
    buttonText: { color: colors.text, fontSize: 14, fontWeight: '600' },
    wakeText: { color: colors.onAccent, fontSize: 15, fontWeight: '700' },
    deleteText: {
      color: colors.deleteOrCancelButtonColor,
      fontSize: 14,
      fontWeight: '600',
    },
    wakeButton: {
      ...action,
      flexBasis: '100%',
      minHeight: 56,
      backgroundColor: colors.primary,
    },
    editOrSubmitButton: { ...action, backgroundColor: colors.background },
    deleteButton: { ...action, backgroundColor: colors.background },
  });
};

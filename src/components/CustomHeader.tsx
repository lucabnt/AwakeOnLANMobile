import { View, Text, StatusBar, Platform } from 'react-native';
import { CustomButton } from '../components/CustomButton';
import { useTheme } from '../contexts/ThemeContext';
import { fonts, useColors, Colors } from '../styles/base';

const useCustomHeaderStyles = () => {
  const colors: Colors = useColors();

  return {
    header: {
      paddingTop: Platform.OS === 'ios' ? 44 : 24,
      height: Platform.OS === 'ios' ? 60 + 44 : 60 + 24,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 15,
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
      backgroundColor: colors.background,
    },
    headerTitle: {
      fontSize: fonts.largeFontSize,
      fontWeight: 'bold',
      backgroundColor: colors.background,
      color: colors.text,
    },
    statusBarBackgroundColor: colors.primary,
    menuButton: {
      padding: 10,
    },
    menuIcon: {
      fontSize: fonts.largeFontSize,
      fontWeight: 'bold',
      color: colors.text,
    },
  } as const;
};

interface CustomHeaderProps {
  onMenuPress: () => void;
}

export const CustomHeader = ({ onMenuPress }: CustomHeaderProps) => {
  const styles = useCustomHeaderStyles();
  const { isDarkMode } = useTheme();

  return (
    <View style={styles.header}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={styles.statusBarBackgroundColor}
      />
      <Text style={styles.headerTitle}>AwakeOnLANMobile</Text>
      <CustomButton
        title={'☰'}
        onPress={onMenuPress}
        buttonStyle={styles.menuButton}
        buttonTextStyle={styles.menuIcon}
      />
    </View>
  );
};

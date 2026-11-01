import { View, Text, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CustomButton } from '../components/CustomButton';
import { useTheme } from '../contexts/ThemeContext';
import { fonts, useColors, Colors } from '../styles/base';

const useCustomHeaderStyles = () => {
  const colors: Colors = useColors();

  return {
    safeArea: {
      backgroundColor: colors.background,
    },
    header: {
      minHeight: 64,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 15,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderColor,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
      backgroundColor: colors.background,
    },
    headerTitle: {
      fontSize: 20,
      flex: 1,
      marginRight: 12,
      fontWeight: 'bold',
      backgroundColor: colors.background,
      color: colors.text,
    },
    statusBarBackgroundColor: colors.background,
    menuButton: {
      width: 48,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuIcon: {
      fontSize: fonts.largeFontSize,
      lineHeight: 28,
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
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={styles.statusBarBackgroundColor}
      />
      <View style={styles.header}>
        <Text
          style={styles.headerTitle}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          AwakeOnLANMobile
        </Text>
        <CustomButton
          title={'☰'}
          accessibilityLabel="Open menu"
          onPress={onMenuPress}
          buttonStyle={styles.menuButton}
          buttonTextStyle={styles.menuIcon}
        />
      </View>
    </SafeAreaView>
  );
};

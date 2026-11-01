import { useTheme } from '../contexts/ThemeContext';

export interface FontSizes {
  smallFontSize: number;
  mediumFontSize: number;
  largeFontSize: number;
}

export const fonts: FontSizes = {
  smallFontSize: 12,
  mediumFontSize: 16,
  largeFontSize: 24,
};

export interface Colors {
  background: string;
  text: string;
  primary: string;
  secondary: string;
  borderColor: string;
  placeholderText: string;
  saveOrEditButtonColor: string;
  deleteOrCancelButtonColor: string;
  surface: string;
  muted: string;
  onAccent: string;
}

export const lightTheme: Colors = {
  background: '#F2F6F7',
  surface: '#FFFFFF',
  text: '#142D36',
  muted: '#526873',
  primary: '#007F7A',
  secondary: '#006D69',
  borderColor: '#C8D7DC',
  placeholderText: '#617780',
  saveOrEditButtonColor: '#007F7A',
  deleteOrCancelButtonColor: '#B93845',
  onAccent: '#FFFFFF',
};

export const darkTheme: Colors = {
  background: '#0D171D',
  surface: '#17262E',
  text: '#E6F0F3',
  muted: '#A4BBC4',
  primary: '#54D8CB',
  secondary: '#54D8CB',
  borderColor: '#354C57',
  placeholderText: '#A4BBC4',
  saveOrEditButtonColor: '#54D8CB',
  deleteOrCancelButtonColor: '#FFADB4',
  onAccent: '#10272E',
};

export const useColors = () => {
  const { isDarkMode } = useTheme();
  return isDarkMode === false ? lightTheme : darkTheme;
};

export const useBaseStyles = () => {
  const colors: Colors = useColors();

  return {
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      // Platform-specific padding to play nice with Modal since it implicitly accounts for the
      // StatusBar with no control over it
      paddingTop: 12,
      paddingBottom: 8,
      paddingHorizontal: 16,
      backgroundColor: colors.background,
    },
    title: {
      fontSize: fonts.largeFontSize,
      fontWeight: 'bold',
      marginBottom: 16,
      textAlign: 'left',
      color: colors.text,
    },
    input: {
      width: '100%',
      borderWidth: 1,
      borderColor: colors.borderColor,
      backgroundColor: colors.surface,
      color: colors.text,
      padding: 12,
      minHeight: 48,
      marginBottom: 12,
      borderRadius: 12,
      fontSize: fonts.mediumFontSize,
    },
    text: {
      color: colors.text,
    },
    button: {
      borderRadius: 12,
      padding: 12,
      minHeight: 48,
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonText: {
      color: colors.onAccent,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    saveOrEditButtonColor: colors.saveOrEditButtonColor, // blue
    deleteOrCancelButtonColor: colors.deleteOrCancelButtonColor, // red
  } as const;
};

import React from 'react';
import packageJson from '../../package.json';
import {
  Modal,
  Pressable,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { CustomButton } from '../components/CustomButton';
import { useTheme } from '../contexts/ThemeContext';
import { fonts, useColors, Colors } from '../styles/base';
import { useDeviceContext } from '../contexts/DeviceContext';

const useModalStyles = () => {
  const colors: Colors = useColors();

  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-start' as const,
      alignItems: 'flex-end' as const,
    },
    modalContent: {
      width: '88%',
      maxWidth: 340,
      marginTop: 60,
      marginRight: 10,
      borderRadius: 20,
      padding: 10,
      elevation: 5,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      backgroundColor: colors.surface,
    },
    modalItem: {
      padding: 15,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderColor,
    },
    modalItemText: {
      fontSize: fonts.mediumFontSize,
      fontWeight: '500',
      color: colors.text,
    },
    contactText: {
      fontSize: fonts.smallFontSize,
      marginTop: 5,
      color: colors.text,
    },
  });
};

interface MenuModalProps {
  visible: boolean;
  onClose: () => void;
}

export const MenuModal = ({ visible, onClose }: MenuModalProps) => {
  const { isDarkMode, toggleTheme } = useTheme();
  const { manageBackup, isLoading, storageError } = useDeviceContext();
  const styles = useModalStyles();
  const { version } = packageJson;

  const toggleThemeButton = () => {
    toggleTheme();
    onClose();
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={styles.modalContent}>
          <CustomButton
            title={isDarkMode ? 'Toggle Light Mode ☀️' : 'Toggle Dark Mode 🌘'}
            onPress={toggleThemeButton}
            buttonStyle={styles.modalItem}
            buttonTextStyle={styles.modalItemText}
          />

          <CustomButton
            title="Encrypted backup"
            disabled={isLoading || !!storageError}
            buttonStyle={styles.modalItem}
            buttonTextStyle={styles.modalItemText}
            onPress={async () => {
              onClose();
              try {
                await manageBackup();
              } catch (error) {
                Alert.alert(
                  'Backup unavailable',
                  (error as { code?: string })?.code === 'BACKUP_UNSUPPORTED'
                    ? 'Encrypted backups require Android 8 or newer.'
                    : 'Could not open encrypted backup. Your saved devices were preserved.',
                );
              }
            }}
          />

          <TouchableOpacity style={styles.modalItem} onPress={onClose}>
            <Text style={styles.modalItemText}>App Info:</Text>
            <Text style={styles.contactText}>
              License: GPLv3
              {'\n'}
              Source: github.com/lucabnt/AwakeOnLANMobile
              {'\n'}
              Report Issues: https://github.com/lucabnt/AwakeOnLANMobile/issues
              {'\n'}
              Based on: nellogan/AwakeOnLANMobile
              {'\n'}
              Version: {version}
            </Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
};

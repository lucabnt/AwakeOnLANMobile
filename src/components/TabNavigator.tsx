import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AutomationScreen } from '../screens/AutomationScreen';
import { DeviceListScreen } from '../screens/DeviceListScreen';
import { ScanHostsScreen } from '../screens/ScanHostsScreen';
import { fonts, useColors, Colors } from '../styles/base';

const Tab = createBottomTabNavigator();

const useTabNavigatorStyles = () => {
  const colors: Colors = useColors();

  return {
    tabBar: {
      backgroundColor: colors.surface,
      borderTopColor: colors.borderColor,
      paddingTop: 6,
    },
    tabBarLabel: {
      flex: 1,
      fontSize: fonts.mediumFontSize - 2,
      fontWeight: '600',
      textAlignVertical: 'center',
    },
    tabBarActiveTintColor: colors.secondary,
    tabBarInactiveTintColor: colors.muted,
    tabBarIconStyle: {
      height: 0,
      flex: 0,
    },
  } as const;
};

export const TabNavigator = () => {
  const styles = useTabNavigatorStyles();

  return (
    <Tab.Navigator
      initialRouteName="DeviceList"
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarActiveTintColor: styles.tabBarActiveTintColor,
        tabBarInactiveTintColor: styles.tabBarInactiveTintColor,
        tabBarIcon: () => null,
        tabBarIconStyle: styles.tabBarIconStyle, // Not using icons so collapse
      }}
    >
      <Tab.Screen
        name="DeviceList"
        component={DeviceListScreen}
        options={{ tabBarLabel: 'Device List' }}
      />
      <Tab.Screen
        name="Automation"
        component={AutomationScreen}
        options={{ tabBarLabel: 'Automation' }}
      />
      <Tab.Screen
        name="ScanHosts"
        component={ScanHostsScreen}
        options={{ tabBarLabel: 'Scan Hosts' }}
      />
    </Tab.Navigator>
  );
};

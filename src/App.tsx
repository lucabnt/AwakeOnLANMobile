import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { DeviceProvider } from './contexts/DeviceContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { TabNavigator } from './components/TabNavigator';
import { CustomHeader } from './components/CustomHeader';
import { MenuModal } from './components/MenuModal';
import { View } from 'react-native';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';

const App = () => {
  const [isModalVisible, setModalVisible] = useState<boolean>(false);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeProvider>
        <NavigationContainer>
          <DeviceProvider>
            <View style={{ flex: 1 }}>
              <CustomHeader onMenuPress={() => setModalVisible(true)} />
              <MenuModal
                visible={isModalVisible}
                onClose={() => setModalVisible(false)}
              />
              <TabNavigator />
            </View>
          </DeviceProvider>
        </NavigationContainer>
      </ThemeProvider>
    </SafeAreaProvider>
  );
};

export default App;

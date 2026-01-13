import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { PaperProvider } from 'react-native-paper';
import { View, ActivityIndicator } from 'react-native';

import { Theme } from '@/src/constants/Theme';
import { AuthProvider, useAuth } from '@/src/context/AuthContext';
import { updateService, VersionInfo } from '@/src/services/update.service';
import { UpdateModal } from '@/src/components/UpdateModal';

function UpdateChecker({ children }: { children: React.ReactNode }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const currentVersion = updateService.getCurrentVersion();

  useEffect(() => {
    const checkUpdate = async () => {
      const latest = await updateService.getLatestVersion();
      if (latest && updateService.isNewerVersion(latest.version, currentVersion)) {
        setVersionInfo(latest);
        setModalVisible(true);
      }
    };
    checkUpdate();
  }, []);

  return (
    <>
      {children}
      <UpdateModal
        visible={modalVisible}
        versionInfo={versionInfo}
        currentVersion={currentVersion}
        onDismiss={() => setModalVisible(false)}
      />
    </>
  );
}

function AuthContent() {
  const { isAuthenticated, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(tabs)';

    if (!isAuthenticated && inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated && segments[0] === 'login') {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Theme.colors.background }}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
      </View>
    );
  }

  return (
    <ThemeProvider value={DarkTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <PaperProvider>
      <AuthProvider>
        <UpdateChecker>
          <AuthContent />
        </UpdateChecker>
      </AuthProvider>
    </PaperProvider>
  );
}

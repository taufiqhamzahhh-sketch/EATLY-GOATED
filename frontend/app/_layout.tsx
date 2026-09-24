import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { AuthProvider } from "@/src/context/auth-context";
import { CartProvider } from "@/src/context/cart-context";
import { OrdersProvider } from "@/src/context/orders-context";
import { ToastProvider } from "@/src/context/toast-context";
import { fontAssets } from "@/src/fonts";
import { queryClient } from "@/src/query-client";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded] = useFonts(fontAssets);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: "#F7F3EE" }} />;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <AuthProvider>
                <CartProvider>
                  <OrdersProvider>
                    <ToastProvider>
                      <Stack
                        screenOptions={{
                          headerShown: false,
                          contentStyle: { backgroundColor: "#F7F3EE" },
                        }}
                      >
                        <Stack.Screen name="index" />
                        <Stack.Screen name="(tabs)" />
                        <Stack.Screen name="auth/login" />
                        <Stack.Screen name="auth/register" />
                        <Stack.Screen name="restaurant/[id]" />
                        <Stack.Screen name="cart" options={{ presentation: "card" }} />
                        <Stack.Screen name="checkout" />
                        <Stack.Screen name="payment-success" options={{ gestureEnabled: false }} />
                        <Stack.Screen name="order/[id]" />
                        <Stack.Screen name="review/[id]" />
                        <Stack.Screen name="notifications" />
                        <Stack.Screen name="post/[id]" />
                        <Stack.Screen name="user/[id]" />
                        <Stack.Screen name="search" />
                        <Stack.Screen name="saved" />
                        <Stack.Screen name="create" options={{ presentation: "modal" }} />
                      </Stack>
                    </ToastProvider>
                  </OrdersProvider>
                </CartProvider>
              </AuthProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

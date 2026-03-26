import { Href, useRouter } from "expo-router";
import { PropsWithChildren } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

type SeniorScreenProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  backHref?: Href;
}>;

export function SeniorScreen({
  children,
  title,
  subtitle,
  showBackButton = true,
  backHref = "/(user)/home",
}: SeniorScreenProps) {
  const router = useRouter();

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(backHref);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          {showBackButton ? (
            <Pressable onPress={handleBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>이전으로</Text>
            </Pressable>
          ) : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f4efe6",
  },
  container: {
    padding: 20,
    gap: 16,
  },
  header: {
    gap: 8,
    marginBottom: 8,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#e2e8d8",
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2b4031",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#1f2a1f",
  },
  subtitle: {
    fontSize: 18,
    lineHeight: 26,
    color: "#435241",
  },
});

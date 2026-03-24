import { PropsWithChildren } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

type SeniorScreenProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
}>;

export function SeniorScreen({ children, title, subtitle }: SeniorScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
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

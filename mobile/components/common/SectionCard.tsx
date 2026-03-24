import { PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";

type SectionCardProps = PropsWithChildren<{
  title: string;
  description: string;
}>;

export function SectionCard({ children, title, description }: SectionCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fffdf8",
    borderRadius: 20,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: "#ddd3c4",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#202820",
  },
  description: {
    fontSize: 17,
    lineHeight: 24,
    color: "#586456",
  },
  body: {
    gap: 10,
  },
});

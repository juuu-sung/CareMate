import { startTransition, useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { SectionCard } from "@/components/common/SectionCard";
import { SeniorScreen } from "@/components/common/SeniorScreen";
import { CareMode, GuardianOptions } from "@/types/care";
import { CareModeState, getCurrentMode, updateCurrentMode } from "@/services/modes";

export default function ModesScreen() {
  const [mode, setMode] = useState<CareMode>("basic");
  const [options, setOptions] = useState<GuardianOptions>({
    checkInIntervalMinutes: 180,
    alertRepeatCount: 3,
    alwaysOnLocationEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadMode();
  }, []);

  async function loadMode() {
    setLoading(true);
    setError(null);

    try {
      const data = await getCurrentMode();
      applyModeState(data);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "모드 정보를 불러오지 못했습니다.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function saveMode() {
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updated = await updateCurrentMode({ mode, options });
      applyModeState(updated);
      setSuccessMessage("돌봄 모드가 저장되었습니다.");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "모드 저장에 실패했습니다.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function applyModeState(data: CareModeState) {
    startTransition(() => {
      setMode(data.mode);
      setOptions(data.options);
    });
  }

  function updateOption<K extends keyof GuardianOptions>(key: K, value: GuardianOptions[K]) {
    setOptions((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <SeniorScreen
      title="돌봄 모드 설정"
      subtitle="기본, 인지 지원, 건강 관리 모드와 세부 옵션을 제어하는 화면입니다."
      backHref="/(guardian)/dashboard"
    >
      <SectionCard title="현재 모드" description="대상자에게 적용 중인 모드를 표시합니다.">
        {loading ? <Text style={styles.message}>불러오는 중...</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}
        <View style={styles.modeButtonGroup}>
          <ModeButton
            active={mode === "basic"}
            label="기본 모드"
            onPress={() => setMode("basic")}
          />
          <ModeButton
            active={mode === "cognitive_support"}
            label="인지 지원"
            onPress={() => setMode("cognitive_support")}
          />
          <ModeButton
            active={mode === "health_support"}
            label="건강 지원"
            onPress={() => setMode("health_support")}
          />
        </View>
      </SectionCard>
      <SectionCard title="세부 옵션" description="체크인 주기, 위치 공유, 반복 알림 횟수를 조절합니다.">
        <View style={styles.optionRow}>
          <Text style={styles.label}>체크인 주기(분)</Text>
          <TextInput
            keyboardType="number-pad"
            style={styles.input}
            value={String(options.checkInIntervalMinutes)}
            onChangeText={(text) => updateOption("checkInIntervalMinutes", Number(text) || 0)}
          />
        </View>
        <View style={styles.optionRow}>
          <Text style={styles.label}>반복 알림 횟수</Text>
          <TextInput
            keyboardType="number-pad"
            style={styles.input}
            value={String(options.alertRepeatCount)}
            onChangeText={(text) => updateOption("alertRepeatCount", Number(text) || 0)}
          />
        </View>
        <View style={styles.optionRow}>
          <Text style={styles.label}>상시 위치 공유</Text>
          <Switch
            value={options.alwaysOnLocationEnabled}
            onValueChange={(value) => updateOption("alwaysOnLocationEnabled", value)}
          />
        </View>
        <Pressable onPress={() => void saveMode()} style={styles.saveButton} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? "저장 중..." : "설정 저장"}</Text>
        </Pressable>
      </SectionCard>
    </SeniorScreen>
  );
}

type ModeButtonProps = {
  active: boolean;
  label: string;
  onPress: () => void;
};

function ModeButton({ active, label, onPress }: ModeButtonProps) {
  return (
    <Pressable onPress={onPress} style={[styles.modeButton, active ? styles.modeButtonActive : null]}>
      <Text style={[styles.modeButtonText, active ? styles.modeButtonTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modeButtonGroup: {
    gap: 10,
  },
  modeButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#b9c8b5",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
  },
  modeButtonActive: {
    backgroundColor: "#2f5d50",
    borderColor: "#2f5d50",
  },
  modeButtonText: {
    fontSize: 18,
    color: "#294136",
  },
  modeButtonTextActive: {
    color: "#fffdf8",
    fontWeight: "700",
  },
  optionRow: {
    gap: 8,
  },
  label: {
    fontSize: 17,
    lineHeight: 24,
    color: "#243125",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d3ddcf",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    backgroundColor: "#ffffff",
  },
  saveButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#2f5d50",
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fffdf8",
  },
  message: {
    fontSize: 17,
    color: "#4e5d4b",
  },
  success: {
    fontSize: 16,
    color: "#226144",
  },
  error: {
    fontSize: 16,
    color: "#a33a2b",
  },
});
